import test from 'node:test';
import assert from 'node:assert/strict';
import {pageFromHistory} from './navigation.js';

test('retired and unknown destinations return to the service introduction', () => {
  for (const page of ['explore', 'membership', undefined, '', 'main', 'unknown']) {
    assert.equal(pageFromHistory(page), 'intro');
  }
});
test('history preserves active member and inquiry destinations', () => {
  for (const page of ['request', 'account', 'activity', 'guide']) {
    assert.equal(pageFromHistory(page), page);
  }
});
