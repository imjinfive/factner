import test from 'node:test';
import assert from 'node:assert/strict';
import {captureDrafts,restoreDrafts} from './member-editor.js';
import {workflowQueue,memberWorkspace} from './member-workspace.js';

const field=(name,value,type='text')=>({name,value,type,checked:false,closest:()=>({textContent:name})});
const form=(id,elements)=>({id,elements,dataset:{edited:'true'},dispatchEvent(){this.inputRestored=true;}});

test('reload keeps another form draft and the actual selected file input while detecting new server values',()=>{
 const selected=field('attachments','','file');selected.files=[{name:'sample.png'}];
 const dirty=form('company',[field('summary','작성 중인 소개'),field('listed','on','checkbox'),selected]);dirty.elements[1].checked=true;
 const saved=form('review',[field('status','approved')]);
 const drafts=captureDrafts({querySelectorAll:()=>[dirty,saved]},saved);
 assert.equal(drafts.length,1);
 const fresh=form('company',[field('summary','다른 직원이 저장한 소개'),field('listed','on','checkbox'),field('attachments','','file')]);
 fresh.elements[2].replaceWith=node=>fresh.elements[2]=node;
 const {changes,missing}=restoreDrafts({querySelector:selector=>selector==='#company'?fresh:null},drafts);
 assert.equal(fresh.elements[0].value,'작성 중인 소개');assert.equal(fresh.elements[1].checked,true);assert.equal(fresh.elements[2],selected);
 assert.equal(fresh.inputRestored,true);assert.deepEqual(missing,[]);
 assert.ok(changes.some(change=>change.latest==='다른 직원이 저장한 소개'&&change.draft==='작성 중인 소개'));
});

test('completed requests retain a readable orphan draft and never preserve phone-verification attestation',()=>{
 const draft=form('request',[field('note','추가 확인 필요'),field('verified','on','checkbox')]);
 const captured=captureDrafts({querySelectorAll:()=>[draft]});assert.deepEqual(captured[0].fields.map(field=>field.name),['note']);
 const {missing}=restoreDrafts({querySelector:()=>null},captured);assert.equal(missing[0].fields[0].value,'추가 확인 필요');
});

test('409 reload ignores inserted buttons and restores named fields, reordered checkboxes and file selection',()=>{
 const selected=field('attachments','','file');selected.files=[{name:'draft.png'}];
 const box=field('categories','box','checkbox');box.checked=true;
 const packaging=field('categories','packaging','checkbox');packaging.checked=false;
 const dirty=form('support',[field('','입력 유지하고 최신 내용 불러오기','button'),field('matchingEta','QA 작성 중 · 영업일 4일'),box,packaging,selected,field('decision','save','submit')]);
 const drafts=captureDrafts({querySelectorAll:()=>[dirty]});
 const fresh=form('support',[field('matchingEta','QA 예시 · 영업일 1일 (최신 저장)'),field('categories','packaging','checkbox'),field('','다른 버튼','button'),field('categories','box','checkbox'),field('attachments','','file')]);
 fresh.elements[1].checked=true;fresh.elements[4].replaceWith=node=>fresh.elements[4]=node;
 const {changes}=restoreDrafts({querySelector:()=>fresh},drafts);
 assert.equal(fresh.elements[0].value,'QA 작성 중 · 영업일 4일');
 assert.equal(fresh.elements[1].checked,false);assert.equal(fresh.elements[3].checked,true);assert.equal(fresh.elements[4],selected);
 assert.ok(changes.some(change=>change.latest==='QA 예시 · 영업일 1일 (최신 저장)'&&change.draft==='QA 작성 중 · 영업일 4일'));
});

test('same-name text controls remain distinct by occurrence rather than unrelated control position',()=>{
 const dirty=form('repeat',[field('note','첫 번째'),field('','reload','button'),field('note','두 번째')]);
 const drafts=captureDrafts({querySelectorAll:()=>[dirty]});
 const fresh=form('repeat',[field('note','old first'),field('note','old second')]);
 restoreDrafts({querySelector:()=>fresh},drafts);assert.deepEqual(fresh.elements.map(field=>field.value),['첫 번째','두 번째']);
});

test('workflow groups pending and reviewing separately and folds completed member, matching and packaging requests',()=>{
 const html=workflowQueue({esc:value=>String(value??''),requests:[{requester_id:'a',requester_name:'브랜드A',target_name:'제작B',status:'reviewing',created_at:'2026-10-28'}],reviews:[{brand_id:'a',brand_name:'브랜드A',spec:{name:'상자'},status:'approved',created_at:'2026-10-28'}],service:[{member_id:'a',member_name:'브랜드A',kind:'company',status:'pending',created_at:'2026-10-28'}]});
 assert.match(html,/접수 <strong>1건/);assert.match(html,/검토 중 <strong>1건/);assert.match(html,/<details class="completed-requests"><summary>완료·보류 1건/);
 assert.match(html,/data-section="member-service-requests"/);assert.match(html,/업체정보 수정/);
});

test('member workspace initially folds company fields and completed matching requests',async()=>{
 const fixture=await memberWorkspace({esc:value=>String(value??''),api:async path=>path.includes('/company')?{profile:{}}:path.includes('matching')?{requests:[{id:'r',requester_id:'a',target_id:'b',requester_role:'brand',requester_name:'A',target_name:'B',category:'box',status:'completed',created_at:'2026-10-28'}]}:path.includes('packaging-reviews')?{reviews:[]}:{packagings:[]}}, {id:'a',name:'A',role:'brand'},()=>{});
 assert.match(fixture.html,/<details class="panel wide member-fold" id="member-company">/);
 assert.match(fixture.html,/<details class="completed-requests"><summary>완료·보류 요청 1건/);
 assert.doesNotMatch(fixture.html,/지역 무관/);assert.match(fixture.html,/사진 자동 압축/);
});
