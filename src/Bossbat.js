import Redlock from 'redlock';
import Redis from 'ioredis';
import timestring from 'timestring';
import { compose } from 'throwback';
import { parseExpression } from 'cron-parser';

// We timeout jobs after 2 seconds:
const JOB_TTL = 2000;
const JOB_PREFIX = 'bossbat';

export default class Bossbat {
  constructor({ connection, prefix = JOB_PREFIX, ttl = JOB_TTL, tz, disableRedisConfig } = {}) {
    const DB_NUMBER = (connection && connection.db) || 0;

    this.prefix = prefix;
    this.ttl = ttl;
    this.tz = tz;

    this.client = new Redis(connection);
    this.subscriber = new Redis(connection);
    this.redlock = new Redlock([this.client], { retryCount: 0 });

    this.jobs = {};
    this.qas = [];

    if (!disableRedisConfig) {
      this.subscriber.config('SET', 'notify-keyspace-events', 'Ex');
    }

    // Subscribe to expiring keys on the jobs DB:
    this.subscriber.subscribe(`__keyevent@${DB_NUMBER}__:expired`);
    this.subscriber.on('message', (channel, message) => {
      // Check to make sure that the message is a job run request:
      if (!message.startsWith(`${this.prefix}:work:`)) return;

      const jobName = message.startsWith(`${this.prefix}:work:demand:`)
        ? message.replace(`${this.prefix}:work:demand:`, '')
        : message.replace(`${this.prefix}:work:`, '');

      if (this.jobs[jobName]) {
        // Attempt to perform the job. Only one worker will end up getting assigned
        // the job thanks to distributed locking via redlock.
        this.doWork(jobName);
        // Schedule the next run. We do this in every instance because it's
        // just a simple set command, and is okay to run on top of eachother.
        if (this.jobs[jobName].every || this.jobs[jobName].cron) {
          this.scheduleRun(jobName, this.jobs[jobName]);
        }
      }
    });
  }

  quit() {
    this.jobs = {};
    return Promise.all([
      this.subscriber.quit(),
      this.client.quit(),
    ]);
  }


  hire(name, definition) {
    this.jobs[name] = definition;
    if (definition.every || definition.cron) {
      this.scheduleRun(name, definition);
    }
  }

  fire(name) {
    return this.client.del(this.getJobKey(name));
  }

  qa(fn) {
    this.qas.push(fn);
  }

  demand(name) {
    this.scheduleRun(name);
  }

  // Semi-privates:

  getJobKey(name) {
    return `${this.prefix}:work:${name}`;
  }

  getDemandKey(name) {
    return `${this.prefix}:work:demand:${name}`;
  }

  getLockKey(name) {
    return `${this.prefix}:lock:${name}`;
  }

  doWork(name) {
    this.redlock.lock(this.getLockKey(name), this.ttl).then((lock) => {
      const fn = compose(this.qas);
      // Call the QA functions, then finally the job function. We use a copy of
      // the job definition to prevent pollution between scheduled runs.
      const response = fn(name, { ...this.jobs[name] }, (_, definition) => (
        definition.work()
      ));

      const end = () => { lock.unlock(); };

      response.then(end, end);
    }, () => (
      // If we fail to get a lock, that means another instance already processed the job.
      // We just ignore these cases:
      null
    ));
  }

  scheduleRun(name, definition) {
    // If there's no definition passed, it's a demand, let's schedule as tight as we can:
    if (!definition) {
      return this.client.set(this.getDemandKey(name), name, 'PX', 1, 'NX');
    }

    let timeout;
    if (definition.every) {
      const typeOfEvery = typeof definition.every;
      if (typeOfEvery === 'string') {
        // Passed a human interval:
        timeout = timestring(definition.every, 'ms');
      } else if (typeOfEvery === 'number') {
        // Passed a ms interval:
        timeout = definition.every;
      } else {
        throw new Error(`Unknown interval of type "${typeOfEvery}" passed to hire.`);
      }
    } else if (definition.cron) {
      const options = { iterator: false, tz: this.tz };
      const iterator = parseExpression(definition.cron, options);
      const nextCronTimeout = () => iterator.next().getTime() - Date.now();
      const cronTimeout = nextCronTimeout();
      timeout = cronTimeout > 0 ? cronTimeout : nextCronTimeout();
    }
    return this.client.set(this.getJobKey(name), name, 'PX', timeout, 'NX');
  }
}
