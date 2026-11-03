import {emptyOnboardingDraft,normalizeOnboardingDraft,onboardingResumeStep} from './onboarding-data.js';

const completed = new Map();
const storageKey = ownerId => 'factner:completed-post-requests:'+ownerId;
const requestId = value => typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);

export function completedPostRequests(ownerId,storage) {
  const ids=new Set(completed.get(ownerId)||[]);
  try {
    const stored=JSON.parse((storage??globalThis.sessionStorage)?.getItem(storageKey(ownerId))||'[]');
    if(Array.isArray(stored))for(const id of stored.filter(requestId))ids.add(id);
  } catch {}
  return ids;
}

export function completePostRequest(ownerId,id,storage) {
  const ids=completedPostRequests(ownerId,storage);ids.add(id);
  const saved=[...ids];completed.set(ownerId,saved);
  try {(storage??globalThis.sessionStorage)?.setItem(storageKey(ownerId),JSON.stringify(saved));}catch{}
}

export function initialPostRequest(user,posts,entry={},completedIds=new Set(),newId=crypto.randomUUID()) {
  const saved=entry?.postRequest;
  if(saved?.ownerId===user.id&&requestId(saved.id)&&!saved.submittedId&&!completedIds.has(saved.id)) {
    const draft=normalizeOnboardingDraft(saved.draft);
    if(draft.role==='brand')return {...saved,stage:saved.stage==='review'?'review':'survey',draft};
  }
  // The authenticated state includes every owned post, including rejected and withdrawn records.
  const first=!posts.some(post=>post.isMine);
  const source=first?(entry?.onboardingDraft?.role==='brand'?entry.onboardingDraft:user.onboarding):null;
  const draft=source?.role==='brand'?normalizeOnboardingDraft(source):{...emptyOnboardingDraft(),role:'brand'};
  return {id:newId,ownerId:user.id,stage:first&&onboardingResumeStep(draft)==='result'?'review':'survey',draft};
}
