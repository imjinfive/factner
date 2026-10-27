import test from 'node:test';
import assert from 'node:assert/strict';
import {pageFromHistory,matchingFromHistory} from './navigation.js';

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

test('matching browser history restores the form, selected candidates and review stage', () => {
  const member = {id:'brand-1',role:'brand'};
  const draft = {memberId:'brand-1',stage:'form',form:{role:'brand',category:'box',region:'seoul',capacity:'30000'},selected:[]};
  const entries = [draft, {...draft,stage:'results',selected:['supplier-1','supplier-2']}, {...draft,stage:'review',selected:['supplier-1','supplier-2']}];
  const restored = entries.map(matching => matchingFromHistory({matching},member));
  assert.deepEqual(restored.map(value=>value.stage),['form','results','review']);
  assert.deepEqual(restored.map(value=>value.depth),[0,1,2]);
  assert.ok(restored.every(value=>value.form.category==='box'&&value.form.region==='all'));
  assert.deepEqual(restored[1].selected,['supplier-1','supplier-2']);
  assert.deepEqual(restored[2].selected,restored[1].selected);
});

test('matching role comes from the current account and old account selections cannot leak', () => {
  const state = {matching:{memberId:'brand-1',stage:'review',form:{role:'brand',category:'supplies',capacity:'5000'},selected:['supplier-1']}};
  const result = matchingFromHistory(state,{id:'supplier-2',role:'supplier'});
  assert.equal(result.form.role,'supplier');
  assert.equal(result.form.category,'supplies');
  assert.equal(result.stage,'form');
  assert.deepEqual(result.selected,[]);
  assert.equal(matchingFromHistory(state,null).stage,'form');
  assert.deepEqual(matchingFromHistory(state,null).selected,[]);
});

test('invalid history cannot open a review or supply arbitrary query choices', () => {
  const member = {id:'brand-1',role:'brand'};
  const result = matchingFromHistory({matching:{memberId:'brand-1',stage:'review',form:{role:'supplier',category:'unknown',capacity:'-1'},selected:['a','a',null,3]}},member);
  assert.equal(result.stage,'form');
  assert.equal(result.form.category,'');
  assert.equal(result.form.capacity,'30000');
  assert.equal(result.form.role,'brand');
  assert.deepEqual(result.selected,['a']);
});
