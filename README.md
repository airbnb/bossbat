# bossman

Distributed job scheduling in node, based on redis.

## Usage

```
npm install bossman --save
```

You `list` new jobs, your workers `apply` to perform jobs, and if they get selected to perform them, they get `hired`, and perform `work`.
Because naming is hard and funny always wins.

```js
import Bossman from 'bossman';

const boss = new Bossman(redisClient);
// Apply to perform a given job.
boss.apply('logout', {
  work: () => {
    // do something...
  }
});

// Perform something once:
boss.list('logout');

// Schedule the listing in the future:
boss.list('logout', {
  in: '10 minutes',
});

// Schedule the listing recurring:
boss.list('logout', {
  every: '10 minutes',
});
```
