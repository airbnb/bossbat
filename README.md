# bossman
_Stupid simple distributed job scheduling in node, backed by redis._

[![npm Version](https://img.shields.io/npm/v/bossman.svg)](https://www.npmjs.com/package/bossman)
[![License](https://img.shields.io/npm/l/bossman.svg)](https://www.npmjs.com/package/bossman)
[![Build Status](https://travis-ci.org/kesne/bossman.svg)](https://travis-ci.org/kesne/bossman)
[![Coverage Status](https://coveralls.io/repos/github/kesne/bossman/badge.svg?branch=master)](https://coveralls.io/github/kesne/bossman?branch=master)

Bossman combines schedulers and workers into a single concept, which aligns better with most node applications.
All of the jobs run with a [redis lock](https://redis.io/topics/distlock), preventing more than once instance from performing a given job at a time.

## Usage

Bossman is published on `npm`, and can be installed simply:

```shell
npm install bossman --save
```

Or if you use Yarn in your project:

```shell
yarn add bossman
```

You can then import the module and use it normally. For more details, see the [API documentation](#API).

```js
import Bossman from 'bossman';

// Make sure you name your variables clever things:
const fred = new Bossman({
  connection: {
    host: '127.0.0.1',
    port: 1234,
  },
  // Set the redis key prefix:
  prefix: 'bossman:',
});

// Hire for a job.
fred.hire('engineers', {
  every: '10 minutes',
  work: () => {
    // Do something...
  },
});

// Hire something as soon as possible:
fred.demand('engineers');

// You can also "qa" work:
fred.qa((jobName, jobDefinition, next) => {
  return next();
});

// Fire a job, this will cancel any pending jobs:
fred.fire('engineers');

// Shut down our instance.
fred.quit();
```

## API

#### `new Bossman(options: Object)`

Creates a new bossman instance. All arguments are optional.

- `options.connection`: Used to configure the connection to your redis. This accepts the same arguments that [`ioredis`](https://github.com/luin/ioredis/blob/master/API.md#new_Redis_new) does.
- `options.prefix`: A string that all redis keys will be prefixed with. Defaults to `bossman`.
- `options.ttl`: The number of milliseconds before a job times out. Setting it will change the maximum duration that jobs can hold a lock. By default, job locks will timeout if a job does not complete in 2000ms.

#### `bossman.hire(jobName: String, jobDefinition: Object)`

Schedules recurring work to be done.

- `jobName`: A unique name for the job.
- `jobDefinition`: The job definition can contain two properties: `work`, and `every`. The `work` function is invoked when the job is completed. `every` is a human-friendly string which describes the interval the job will be run.

It's possible to omit the `every` property if you don't wish to schedule recurring work, and just want to register a job.

#### `bossman.demand(jobName: String)`

Runs a job as soon as possible, outside of the scheduled jobs.
This does **not** prevent any scheduled jobs from running, unless the demand is running at the same time as a scheduled job and all instances fail to acquire a lock on the job.

#### `bossman.qa(qaFunction: Function)`

QA is used to registers functions that will invoked any time a job is run. This function can be called multiple times to register multiple QA functions.
The passed `qaFunction` function will be called with `jobName`, and `jobDefinition` from the `hire` function, as well as a `next` function, which should be called when the QA function is complete.
The `next` function returns a promise that can be used to get  

For example, here is what a time logging QA function might look like.

```js
bossman.qa((jobName, jobDefinition, next) => {
  const startTime = Date.now();
  return next().then(() => {
    const endTime = Date.now();
    logToServer(`${jobName} completed in ${endTime - startTime}ms`);
  })
});
```

#### `bossman.fire(jobName: String)`

Cancels any _scheduled_ jobs with name `jobName`. This does **not** stop any demanded jobs from running.

#### `bossman.quit()`

Shuts down a bossman instance, closing all redis connections.
This does **not** cancel any scheduled work, and does not stop it from running in any other bossman instances.

## How it works

Constructing a new bossman instance sets up an expired key listener on your redis database.
When you `hire` for a new job, Bossman sets a key in Redis that expire when the first run should occur.
When the key expires, the expired key listener is called and Bossman does the following:

1. Attempt to get a lock to perform the work. Only one instance of bossman will acquire the lock.
  1. If the lock is acquired, then perform the work and move on.
  2. If the lock is not acquired, then move on.
2. Schedule the next run of the job by setting a key that expires when the next run should occur.

It's worth noting that every instance of Bossman attempts to schedule the next run of the job. This is okay because Redis will only schedule the first one that it receives, thanks to the `NX` option in `SET`.
Calling `demand` performs the same operation as `hire`, except with a special key for demands.