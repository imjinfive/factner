import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreSurveyEntry} from './onboarding-history.js';

test('Back restores the unanswered experience snapshot, not a later selection',()=>{
 const before={draft:{role:'brand',experience:''},step:'experience',index:1};
 const after={role:'brand',experience:'yes',complaints:['가격이 부담스러워요']};
 const result=restoreSurveyEntry(before,after);
 assert.equal(result.draft.experience,'');assert.deepEqual(result.draft.complaints,[]);assert.equal(result.step,'experience');
});
test('history restores a valid product and rejects a step from the other role',()=>{
 const result=restoreSurveyEntry({draft:{role:'supplier',supplierProducts:['paper-carton']},step:'experience',index:-3});
 assert.equal(result.step,'role');assert.equal(result.index,0);assert.deepEqual(result.draft.supplierProducts,['paper-carton']);
});
