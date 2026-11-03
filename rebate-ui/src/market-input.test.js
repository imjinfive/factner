import assert from 'node:assert/strict';
import test from 'node:test';
import { packagingSize, positiveInteger } from './bids/market-input.js';

test('typed quantities accept separators and enforce positive integer limits', () => {
  assert.equal(positiveInteger(' 10,000 ', 100000000, '수량'), 10000);
  assert.equal(positiveInteger('100000000', 100000000, '수량'), 100000000);
  for (const value of ['', '0', '-1', '1.5', '1e3', '1,,2', '1,2', '숫자', '100000001']) {
    assert.throws(() => positiveInteger(value, 100000000, '수량'));
  }
});

test('separate dimensions retain millimetres and allow flat packaging', () => {
  assert.equal(packagingSize({}), '');
  assert.equal(packagingSize({ width: '60', depth: '20' }), '60 × 20 mm');
  assert.equal(packagingSize({ width: '60', depth: '20.5', height: '110' }), '60 × 20.5 × 110 mm');
  for (const size of [{ width: '60' }, { height: '20' }, { width: '-1', depth: '20' }, { width: '0', depth: '20' }, { width: '1e3', depth: '20' }]) {
    assert.throws(() => packagingSize(size));
  }
});
