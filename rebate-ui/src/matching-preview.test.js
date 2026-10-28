import test from 'node:test';
import assert from 'node:assert/strict';
import {MATCH_CATEGORIES, previewCandidates} from './matching-preview.js';
import {matchingFromHistory} from './navigation.js';

test('anonymous preview has several clearly marked examples without real company identities',()=>{
 for(const role of ['brand','supplier'])for(const category of MATCH_CATEGORIES){
  const candidates=previewCandidates(role,category.value);
  assert.ok(candidates.length>=3);
  assert.equal(new Set(candidates.map(item=>item.id)).size,candidates.length);
  for(const candidate of candidates){
   assert.equal(candidate.demo,true);
   assert.match(candidate.label,/미리보기 예시/);
   assert.match(candidate.note,/가상 예시/);
   assert.match(candidate.label,role==='brand'?/업체/:/브랜드/);
   assert.ok(!candidate.email&&!candidate.phone&&!candidate.version);
  }
 }
 assert.deepEqual(previewCandidates('brand','invalid'),[]);
});

test('anonymous results restore across browser history but cannot enter a real candidate review',()=>{
 const matching={memberId:null,stage:'results',form:{role:'brand',category:'box'},selected:['preview-brand-box-0']};
 assert.equal(matchingFromHistory({matching},null).stage,'results');
 assert.deepEqual(matchingFromHistory({matching},null).selected,[]);
 assert.equal(matchingFromHistory({matching:{...matching,stage:'review'}},null).stage,'form');
 assert.equal(matchingFromHistory({matching}, {id:'member',role:'brand'}).stage,'form');
});
