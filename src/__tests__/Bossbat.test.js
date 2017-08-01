/* eslint-env jest */
/* eslint-disable global-require */

describe('Bossbat Units', () => {
  let Bossbat;
  let Redis;

  beforeAll(() => {
    jest.mock('ioredis');
    Bossbat = require('../Bossbat');
    Redis = require('ioredis');
  });

  afterAll(() => {
    jest.resetModules();
    jest.unmock('ioredis');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('constructs with no arguments', () => {
    const boss = new Bossbat();
    expect(boss).toBeInstanceOf(Bossbat);
    expect(Redis.mock.instances.length).toEqual(2);
    expect(Redis.mock.instances[1].config.mock.calls.length).toEqual(1);
    boss.quit();
  });

  it('constructs with arguments', () => {
    const boss = new Bossbat({ connection: { db: 4 }, ttl: 101, prefix: 'p', tz: 'Europe/Helsinki', disableRedisConfig: true });
    expect(boss).toBeInstanceOf(Bossbat);
    expect(boss.ttl).toEqual(101);
    expect(boss.prefix).toEqual('p');
    expect(boss.tz).toEqual('Europe/Helsinki');
    expect(Redis.mock.instances.length).toEqual(2);
    expect(Redis.mock.instances[1].config.mock.calls.length).toEqual(0);
    boss.quit();
  });

  it('pushes to the qas array when calling qa', () => {
    const boss = new Bossbat();
    const fn1 = () => {};
    const fn2 = () => {};
    boss.qa(fn1);
    boss.qa(fn2);
    expect(boss.qas).toEqual([fn1, fn2]);
    boss.quit();
  });
});

describe('Bossbat Integration', () => {
  let Bossbat;
  let Redis;
  let boss;
  let bossAlternative;

  beforeAll(() => {
    jest.resetModules();
    jest.unmock('ioredis');
    Bossbat = require('../Bossbat');
    Redis = require('ioredis');
  });

  beforeEach(() => {
    boss = new Bossbat({
      connection: { db: 3 },
    });
    bossAlternative = new Bossbat({
      connection: { db: 3 },
    });
  });

  afterEach(() => (
    // Put this on a slight delay so that the locks can be released before the test ends:
    new Promise(resolve => (
      setTimeout(resolve, 0)
    )).then(() => (
      Promise.all([boss.quit(), bossAlternative.quit()])
    ))
  ));

  it('runs scheduled work', (done) => {
    boss.hire('scheduled', {
      every: '200 ms',
      work: () => {
        done();
      },
    });
  });

  it('runs QA tasks before running scheduled work', (done) => {
    const flags = { performed: false, qa: false };

    boss.qa((name, def, next) => {
      expect(flags).toEqual({ performed: false, qa: false });
      flags.qa = true;
      next().then(() => {
        expect(flags).toEqual({ performed: true, qa: true });
        done();
      });
    });

    boss.hire('qas', {
      every: '200 ms',
      work: () => {
        expect(flags).toEqual({ performed: false, qa: true });
        flags.performed = true;
      },
    });
  });

  it('only runs one unit of work in the scheduled time', (done) => {
    let performed = 0;

    // Start 50 of these jobs, which still should only be fired once:
    Array(50).fill().forEach(() => {
      boss.hire('one', {
        every: '200 ms',
        work: () => {
          performed += 1;
          expect(performed).toEqual(1);
          done();
        },
      });
    });
  });

  it('only performs on one worker, even when given multiple workers', (done) => {
    let performed = 0;

    // Start 50 of these jobs, which still should only be fired once:
    Array(50).fill().forEach(() => {
      [boss, bossAlternative].forEach((b) => {
        b.hire('one', {
          every: '200 ms',
          work: () => {
            performed += 1;
            expect(performed).toEqual(1);
            done();
          },
        });
      });
    });
  });

  it('removes tasks with fire', (done) => {
    boss.hire('fired', {
      every: '200 ms',
      work: () => {
        done(new Error('Work should not be called'));
      },
    });

    boss.fire('fired');

    setTimeout(done, 1000);
  });

  it('does not require every to be passed', (done) => {
    boss.hire('demanded', {
      work: () => {
        done();
      },
    });

    boss.demand('demanded');
  });

  it('ignores non-work expiring messages', (done) => {
    const redis = new Redis({ db: 3 });
    redis.set('some-other-key', 'val', 'PX', 1);
    redis.quit();

    setTimeout(done, 100);
  });

  it('can demand over a scheduled key', (done) => {
    let performed = 0;

    boss.hire('both', {
      every: '200 ms',
      work() {
        performed += 1;
        if (performed === 2) done();
      },
    });

    boss.demand('both');
  });

  it('allows colons in names', (done) => {
    boss.hire('something:with:colons', {
      every: '200 ms',
      work() {
        done();
      },
    });
  });

  it('allows cron formats', (done) => {
    boss.hire('cronjob', {
      cron: '*/1 * * * * *',
      work() {
        done();
      },
    });
  });

  it('allows numeric values for every', (done) => {
    boss.hire('numeric', {
      every: 200,
      work() {
        done();
      },
    });
  });

  it('throws when given an invalid type for every', () => {
    expect(() => {
      boss.hire('throws', {
        every: {},
      });
    }).toThrowError();
  });
});
