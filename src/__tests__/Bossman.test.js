/* eslint-env jest */
/* eslint-disable global-require */

describe('Bossman Units', () => {
  const Bossman = require('../Bossman').default;

  it('constructs with no arguments', () => {
    const boss = new Bossman();
    expect(boss).toBeInstanceOf(Bossman);
  });

  it('constructs with arguments', () => {
    const boss = new Bossman({ connection: { db: 4 }, ttl: 101, prefix: 'p' });
    expect(boss).toBeInstanceOf(Bossman);
    expect(boss.ttl).toEqual(101);
    expect(boss.prefix).toEqual('p');
  });

  it('pushes to the qas array when calling qa', () => {
    const boss = new Bossman();
    const fn1 = () => {};
    const fn2 = () => {};
    boss.qa(fn1);
    boss.qa(fn2);
    expect(boss.qas).toEqual([fn1, fn2]);
  });
});

describe('Bossman Integration', () => {
  jest.resetModules();
  jest.unmock('ioredis');
  const Bossman = require('../Bossman').default;
  let boss;

  beforeEach(() => {
    boss = new Bossman();
  });

  afterEach(() => (
    // Put this on a slight delay so that the locks can be released before the test ends:
    new Promise(resolve => setTimeout(resolve, 0)).then(() => boss.quit())
  ));

  it('runs scheduled work', (done) => {
    boss.hire('scheduled', {
      every: '0.5 seconds',
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
      every: '0.5 seconds',
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
        every: '0.5 seconds',
        work: () => {
          performed += 1;
          expect(performed).toEqual(1);
          done();
        },
      });
    });
  });
});
