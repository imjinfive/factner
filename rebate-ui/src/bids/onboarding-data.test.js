import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOnboardingDraft,readOnboardingDraft,saveOnboardingDraft,surveySteps,onboardingResumeStep,onboardingPostDraft,matchingSurveyPosts} from './onboarding-data.js';
test('unknown answers stay unknown and category changes invalidate stale products',()=>{
 const d=normalizeOnboardingDraft({role:'brand',material:'glass',product:'paper-carton',quantity:'1000',quantityUnknown:true,width:'100',sizeUnknown:true,budget:'30',budgetUnknown:true});
 assert.equal(d.product,'');assert.equal(d.quantity,'');assert.equal(d.width,'');assert.equal(d.budget,'');
});
test('beginner skips complaints and supplier has no brand questions',()=>{
 assert.equal(surveySteps({role:'brand',experience:'no'}).includes('complaints'),false);
 assert.equal(surveySteps({role:'brand',experience:'yes'}).includes('complaints'),true);
 assert.deepEqual(surveySteps({role:'supplier'}),['role','packaging','capacity','goals','result']);
});
test('storage failure does not interrupt onboarding',()=>{
 const blocked={getItem(){throw Error();},setItem(){throw Error();}};
 assert.equal(readOnboardingDraft(blocked).role,'');assert.equal(saveOnboardingDraft({role:'brand'},blocked).role,'brand');
});
test('post draft carries survey values without inventing missing quantities or prices',()=>{
 const p=onboardingPostDraft({role:'brand',material:'paper',product:'paper-carton',quantity:'1000',sizeUnknown:true,budgetUnknown:true,timing:'협의 가능'});
 assert.equal(p.quantity,'1000');assert.equal(p.unitPrice,'');assert.equal(p.title,'단상자 제작 요청');assert.match(p.description,/상담 후 결정/);assert.match(p.description,/업체 제안 요청/);
});
test('invalid input is bounded and strips unknown fields',()=>{
 const d=normalizeOnboardingDraft({role:'design',quantity:'-2',width:'NaN',supplierProducts:['paper-carton','bogus','paper-carton'],secret:'discard'});
 assert.equal(d.role,'');assert.equal(d.quantity,'');assert.deepEqual(d.supplierProducts,['paper-carton']);assert.equal(d.secret,undefined);
});
test('suggestions exclude private, expired, closed and unrelated briefs',()=>{
 const p={id:'1',category:'packaging',reviewStatus:'approved',status:'open',deadline:'2026-11-10',title:'단상자 제작',description:''};
 const matches=matchingSurveyPosts([p,{...p,id:'2',reviewStatus:'pending'},{...p,id:'3',deadline:'2026-10-30'},{...p,id:'4',title:'유리병'},{...p,id:'5',status:'awarded'}],{supplierProducts:['paper-carton']},'2026-11-03');
 assert.deepEqual(matches.map(p=>p.id),['1']);
});
test('resume returns to missing answers instead of claiming incomplete drafts are ready',()=>{
 assert.equal(onboardingResumeStep({role:'brand'}),'experience');
 assert.equal(onboardingResumeStep({role:'brand',experience:'no',material:'paper',product:'paper-carton'}),'conditions');
 assert.equal(onboardingResumeStep({role:'supplier',supplierProducts:['paper-carton']}),'capacity');
 assert.equal(onboardingResumeStep({role:'brand',experience:'no',material:'unknown',quantityUnknown:true,sizeUnknown:true}),'result');
});
test('product dimensions never become packaging dimensions and blank price remains unknown',()=>{
 const base={role:'brand',material:'paper',product:'paper-carton',width:'40',depth:'50',height:'60',budgetUnknown:false,budget:''};
 const product=onboardingPostDraft({...base,sizeBasis:'product'});
 assert.equal(product.width,'');assert.equal(product.height,'');assert.match(product.description,/내용물 크기: 40 × 50 × 60 mm/);
 const partial=onboardingPostDraft({...base,depth:''});
 assert.equal(partial.width,'');assert.equal(partial.depth,'');assert.equal(partial.budgetUnknown,true);
 const packaging=onboardingPostDraft(base);assert.equal(packaging.width,'40');assert.equal(packaging.depth,'50');
});
