import Bossman from '../src/';

const boss = new Bossman();

boss.hire('test', {
  every: '10 seconds',
  work: () => {
    // Do something...
  },
});
