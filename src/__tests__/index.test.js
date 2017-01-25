/* eslint-env jest */

import Bossbat from '../index';

const BossbatCJS = require('../index');

describe('index', () => {
  it('exports for commonJS and ES modules', () => {
    expect(Bossbat).toEqual(BossbatCJS);
  });
});
