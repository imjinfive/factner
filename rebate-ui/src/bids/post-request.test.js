import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPostRequest,completePostRequest,completedPostRequests} from './post-request.js';

const id='11111111-1111-4111-8111-111111111111',nextId='22222222-2222-4222-8222-222222222222';
const survey={version:1,role:'brand',experience:'no',material:'paper',product:'paper-carton',variant:'paper-carton-tuck',quantityUnknown:true,sizeUnknown:true,budgetUnknown:true};
const user={id:'brand-one',onboarding:survey};

test('only the first post receives signup answers, including after a previous post was withdrawn',()=>{
  const first=initialPostRequest(user,[],{},new Set(),id);
  assert.equal(first.stage,'review');assert.equal(first.draft.variant,'paper-carton-tuck');
  for(const reviewStatus of ['pending','approved','rejected','withdrawn']) {
    const later=initialPostRequest(user,[{isMine:true,reviewStatus}],{onboardingDraft:survey},new Set(),nextId);
    assert.equal(later.stage,'survey');assert.equal(later.draft.product,'');assert.equal(later.draft.quantity,'');
  }
});

test('back and reload preserve an unfinished request but cannot replay a completed or another account request',()=>{
  const saved={id,ownerId:user.id,stage:'review',draft:survey};
  assert.equal(initialPostRequest(user,[],{postRequest:saved},new Set(),nextId).id,id);
  const previousPosts=[{isMine:true,reviewStatus:'withdrawn'}];
  for(const entry of [{postRequest:{...saved,submittedId:'posted'}},{postRequest:saved}]) {
    const reset=initialPostRequest(user,previousPosts,entry,new Set([id]),nextId);
    assert.equal(reset.id,nextId);assert.equal(reset.stage,'survey');assert.equal(reset.draft.variant,'');
  }
  assert.equal(initialPostRequest({...user,id:'brand-two',onboarding:null},[],{postRequest:saved},new Set(),nextId).draft.variant,'');
});

test('completed request tracking is account-scoped and storage failure does not block submission',()=>{
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  assert.doesNotThrow(()=>completePostRequest('storage-test-brand',id,denied));
  assert.equal(completedPostRequests('storage-test-brand',denied).has(id),true);
  assert.equal(completedPostRequests('another-brand',denied).has(id),false);
});
