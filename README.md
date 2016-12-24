# bossman

Distributed job scheduling in node, based on redis.

## Usage

```shell
npm install bossman --save
```

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
fred.hire('engineer', {
  every: '10 minutes',
  work: () => {
    // Do something...
  },
});

// You can also "qa" work:
fred.qa((jobName, jobDefinition, next) => {
  return newrelic.createBackgroundTransaction(`job:${jobName}`, () => {
    const response = next();

    const end = () => {
      newrelic.endTransaction();
    };

    return response.then(end, end);
  })();
});
```
