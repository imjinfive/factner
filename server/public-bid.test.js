import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {localMemberPreview} from './public-bid.js';
import {memberAdminApi} from './members.js';
import {partnerApi} from './partners.js';
import {policy,policyApi} from './policy.js';
import {bidApi,roomDatabase} from './bid-auth.js';
import {seedReview,reviewPassword} from '../scripts/bid-seed.mjs';
import {digest,passwordHash} from './security.js';
import {customerTrialVersion,trialCertificate} from '../shared/customer-trial.js';
import {SUBMISSION_AGREEMENT} from '../shared/submission-agreement.js';
import {adminMarketApi} from './admin-market.js';
import {onboardingPostDraft} from '../rebate-ui/src/bids/onboarding-data.js';

const migrationDir=new URL('../migrations/',import.meta.url);
function database(t,files){
  const raw=new DatabaseSync(':memory:');t.after(()=>raw.close());
  raw.exec('PRAGMA foreign_keys=ON');
  for(const name of files)raw.exec(readFileSync(new URL(name,migrationDir),'utf8'));
  const DB={prepare(sql){return {bind(...values){const args=values.map(x=>x instanceof ArrayBuffer?new Uint8Array(x):x);
    const q=raw.prepare(sql);return {first:()=>q.get(...args),all:()=>({results:q.all(...args)}),run:()=>q.columns().length?{results:q.all(...args)}:{meta:{changes:q.run(...args).changes}}};
  }};},batch(b){raw.exec('BEGIN');try{const res=b.map(s=>s.run());raw.exec('COMMIT');return res;}catch(e){raw.exec('ROLLBACK');throw e;}}};
  return {DB,raw};
}
function fixture(t){
  const {DB,raw}=database(t,readdirSync(migrationDir).filter(n=>n.endsWith('.sql')).sort());
  const rooms=new Map();
  const env={DB,APP_KIND:'main',[localMemberPreview]:true,BID_ROOMS:{idFromName:key=>key,get:key=>({fetch:async req=>{
    if(!rooms.has(key)){
      if(new URL(req.url).pathname==='/api/bid/preview-login')return Response.json({error:'다시 로그인해주세요.'},{status:401});
      const isolate=database(t,['0001_initial.sql','0013_bid_market.sql','0015_market_post_review.sql','0018_market_offer_review.sql','0019_submission_agreements.sql','0022_post_consultation.sql']);seedReview(isolate.raw);
      rooms.set(key,{DB:isolate.DB,[roomDatabase]:isolate.DB});
    }
    try{return await bidApi(req,rooms.get(key),new URL(req.url));}
    catch(e){return Response.json({error:e.message},{status:e.status||500});}
  }})}};
  async function call(path,input,headers={}){
    const url='https://example.test/api/'+path;
    const response=await worker.fetch(new Request(url,{method:input===undefined?'GET':'POST',
      headers:{Origin:'https://example.test','Content-Type':'application/json',...headers},body:input===undefined?undefined:JSON.stringify(input)}),env);
    return {status:response.status,data:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
  }
  function publish(version='accepted-version'){
    const config={operator:'Example',contactEmail:'help@example.test',accepting:true};
    const document={...config,privacy:'수집 방침',collection:'필수 정보',transfer:'제공 범위',terms:'이용약관'};
    raw.prepare("UPDATE settings SET value=? WHERE key='service'").run(JSON.stringify(config));
    raw.prepare('INSERT INTO policy_versions VALUES(?,?,?,?,?)').run(version,JSON.stringify(document),1,'owner',new Date().toISOString());
  }
  const owner={id:'owner',role:'owner',display_name:'운영자'};
  async function approve(id){
    const url=new URL('https://admin.example.test/api/admin/members/'+id);
    const r=await memberAdminApi(new Request(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review',status:'approved',version:1,note:'확인 완료'})}),env,url,owner);
    assert.equal(r.status,200);
  }
  return {call,raw,env,publish,approve,owner,rooms};
}
const password='sample-member-password-998';
const agreement={accepted:true,version:SUBMISSION_AGREEMENT.version,signature:'테스트 서명자'};
const account=(key,kind='brand')=>({email:key+'@example.test',password,name:key+' 업체',contact:'담당자',phone:'010-1234-5678',
  kind,...(kind==='packaging'?{packagingDesign:false}:{}),legalType:'individual',files:[],consent:true,termsConsent:true,consentVersion:'accepted-version',agreement});
const job={category:'packaging',title:'단상자 신규 제작',quantity:1000,unitPrice:300,size:'50 × 50',description:'코팅 종이 / 택배 납품',agreement};
const pricing={tiers:[{quantity:1000,unitPrice:250},{quantity:2000,unitPrice:225}],note:'배송 포함',agreement};

test('survey is privately retained through approval, login on another device and admin review',async t=>{
  const f=fixture(t);f.publish();
  const onboarding={version:1,role:'brand',experience:'no',material:'glass',product:'glass-cosmetic',variant:'glass-cosmetic-dropper',appearance:'brown',quantityUnknown:true,sizeUnknown:true,budgetUnknown:true,requiredDate:'2026-12-15',brandImages:['고급스러움','세련된'],brandImageOther:'차분한 느낌',supplierPriorities:['납기일을 잘 지켰으면 좋겠어요','불량률이 낮았으면 좋겠어요'],status:'approved',password:'do-not-store'};
  const fields={...account('survey'),onboarding};
  for(const invalid of [{...onboarding,role:'supplier'},{...onboarding,version:2},{...onboarding,extra:'x'.repeat(8192)}]){
    assert.equal((await f.call('bid/register',{...fields,onboarding:invalid})).status,400);
  }
  const registered=await f.call('bid/register',fields);assert.equal(registered.status,201);
  const saved=f.raw.prepare('SELECT status,onboarding_json FROM members WHERE id=?').get(registered.data.id);
  assert.equal(saved.status,'pending');assert.doesNotMatch(saved.onboarding_json,/do-not-store|approved/);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM market_posts').get().n,0);
  assert.equal((await f.call('bid/login',{email:fields.email,password})).status,403);
  await f.approve(registered.data.id);
  const login=await f.call('bid/login',{email:fields.email,password});
  assert.equal(login.data.user.onboarding.product,'glass-cosmetic');
  assert.equal(login.data.user.onboarding.variant,'glass-cosmetic-dropper');
  assert.equal(login.data.user.onboarding.appearance,'brown');
  assert.equal(login.data.user.onboarding.quantityUnknown,true);
  const newDevice=await f.call('bid/login',{email:fields.email,password});
  assert.deepEqual((await f.call('bid/session',undefined,{Cookie:newDevice.cookie})).data.user.onboarding,login.data.user.onboarding);
  const url=new URL('https://admin.example.test/api/admin/members/'+registered.data.id);
  const adminDetail=await (await memberAdminApi(new Request(url),f.env,url,f.owner)).json();
  assert.deepEqual(adminDetail.member.onboarding,login.data.user.onboarding);
  assert.ok(adminDetail.surveyRows.some(([label,value])=>label==='희망 품목'&&value==='스포이트병'));
  assert.ok(adminDetail.surveyRows.some(([label,value])=>label==='외관'&&value==='갈색'));
  assert.ok(adminDetail.surveyRows.some(([label,value])=>label==='브랜드 이미지'&&value==='고급스러움 · 세련된 · 차분한 느낌'));
  assert.ok(adminDetail.surveyRows.some(([label,value])=>label==='원하는 제작업체'&&value.includes('납기일')));
  assert.equal(login.data.user.onboarding.requiredDate,'2026-12-15');
  assert.doesNotMatch(JSON.stringify((await f.call('bid/state')).data),/glass-cosmetic|차분한 느낌/);
  const supplier={...account('survey-maker','packaging'),packagingDesign:undefined,onboarding:{version:1,role:'supplier',supplierProducts:['paper-carton-tuck','glass-cosmetic-dropper'],quantityRange:['small','medium'],availability:['now','discuss'],strengths:['납기일을 잘 지켜요','불량률이 낮아요','소량 제작에 강해요'],selectedPostId:'public-post'}};
  const maker=await f.call('bid/register',supplier);assert.equal(maker.status,201);
  await f.approve(maker.data.id);
  const makerLogin=await f.call('bid/login',{email:supplier.email,password});
  assert.equal(makerLogin.data.user.onboarding.selectedPostId,'public-post');
  assert.deepEqual(makerLogin.data.user.onboarding.quantityRange,['small','medium']);
  assert.deepEqual(makerLogin.data.user.onboarding.availability,['now','discuss']);
  assert.deepEqual(makerLogin.data.user.onboarding.strengths,['납기일을 잘 지켜요','불량률이 낮아요']);
  const makerUrl=new URL('https://admin.example.test/api/admin/members/'+maker.data.id);
  const makerDetail=await (await memberAdminApi(new Request(makerUrl),f.env,makerUrl,f.owner)).json();
  assert.ok(makerDetail.surveyRows.some(([label,value])=>label==='업체가 선택한 강점'&&value==='납기일을 잘 지켜요 · 불량률이 낮아요'));
  assert.ok(makerDetail.surveyRows.some(([label,value])=>label==='희망 품목'&&value==='일반 단상자 · 스포이트병'));
  const submitted=await f.call('bid/posts',{...job,...onboardingPostDraft(login.data.user.onboarding),quantity:null,unitPrice:null},{Cookie:login.cookie});
  assert.equal(submitted.status,201,JSON.stringify(submitted.data));
  assert.deepEqual((await f.call('bid/state',undefined,{Cookie:makerLogin.cookie})).data.posts,[]);
  f.raw.prepare("UPDATE market_posts SET review_status='approved' WHERE id=?").run(submitted.data.id);
  const publicPost=(await f.call('bid/state',undefined,{Cookie:makerLogin.cookie})).data.posts[0];
  assert.match(publicPost.description,/브랜드 이미지: 고급스러움 · 세련된 · 차분한 느낌/);
  assert.match(publicPost.description,/원하는 제작업체: 납기일을 잘 지켰으면 좋겠어요 · 불량률이 낮았으면 좋겠어요/);
  assert.doesNotMatch(JSON.stringify(publicPost),/업체가 선택한 강점|survey-maker@example/);
});

test('signup requires an electronic signature and keeps its immutable document privately with the application',async t=>{
 const f=fixture(t);f.publish();const fields=account('signed');
 for(const value of [undefined,{...agreement,accepted:false},{...agreement,version:'old'},{...agreement,signature:'\u200b'}]){
   const response=await f.call('bid/register',{...fields,agreement:value});
   assert.ok([400,409].includes(response.status));
 }
 assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,0);
 const result=await f.call('bid/register',fields);assert.equal(result.status,201);
 const row=f.raw.prepare('SELECT * FROM submission_agreements').get();
 assert.equal(row.member_id,result.data.id);assert.equal(row.resource_id,result.data.id);assert.equal(row.purpose,'registration');
 assert.deepEqual(JSON.parse(row.document_json),SUBMISSION_AGREEMENT);
 assert.equal(JSON.parse(row.submission_json).email,fields.email);
 assert.ok(!JSON.stringify(row).includes(password));
 const url=new URL('https://admin.example.test/api/admin/members/'+result.data.id);
 const details=await (await memberAdminApi(new Request(url),f.env,url,f.owner)).json();
 assert.equal(details.agreements[0].signature,agreement.signature);assert.equal(details.agreements[0].document.body,SUBMISSION_AGREEMENT.body);
 assert.ok(!JSON.stringify((await f.call('bid/state')).data).includes(agreement.signature));
 assert.equal((await f.call('admin/members/'+result.data.id)).status,404);
 f.raw.exec("CREATE TRIGGER fail_signup_signature BEFORE INSERT ON submission_agreements BEGIN SELECT RAISE(ABORT,'signature unavailable'); END;");
 const failed=await f.call('bid/register',{...fields,email:'failed-sign@example.test'});assert.equal(failed.status,500);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,1);
});

test('retired temporary signup cannot create another room, even on an original unpublished draft',async t=>{
  const f=fixture(t);
  f.env.DRAFT_SIGNUP_ENABLED='1';
  assert.equal((await f.call('bid/session')).data.registration.previewAvailable,undefined);
  assert.equal((await f.call('bid/preview-register',{kind:'brand',legalType:'individual'})).status,404);
  f.publish();
  assert.equal((await f.call('bid/preview-register',{kind:'packaging',legalType:'corporate'})).status,404);
  assert.equal(f.rooms.size,0);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,0);
});

test('an already issued preview login can still reach only its original room',async t=>{
  const f=fixture(t),email='test-'+'b'.repeat(24)+'@preview.factner.invalid',password='previously-issued-password';
  const key=await digest(`factner-preview-signup-v1\n${email}\n${password}`);
  await f.call('bid/login',{email:'package1@gmail.com',password:reviewPassword},{'X-Factner-Review':key});
  await f.rooms.get(key).DB.prepare("INSERT INTO market_accounts VALUES('preview-account',?,'테스트 업체','packaging',?)").bind(email,await passwordHash(password)).run();
  const login=await f.call('bid/login',{email,password},{'X-Factner-Review':'a'.repeat(64)});
  assert.equal(login.status,200);assert.equal(login.data.reviewRoom,key);assert.equal(login.data.user.kind,'packaging');
  const headers={Authorization:'Bearer '+login.data.token,'X-Factner-Review':key};
  assert.equal((await f.call('bid/session',undefined,headers)).data.mode,'review');
  assert.equal((await f.call('member/me',undefined,headers)).status,401);
  assert.equal((await f.call('bid/login',{email,password:'wrong-password'})).status,401);
  assert.equal(f.rooms.size,1);assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,0);
});

test('official signup fails closed, validates reviewed consent, business proof and pending approval',async t=>{
  const f=fixture(t),fields=account('company');
  assert.equal((await f.call('bid/session')).data.registration.available,false);
  assert.equal((await f.call('bid/register',fields)).status,503);
  assert.equal((await f.call('member/register',{...fields,testOnly:true})).status,410);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,0);
  f.publish();
  assert.equal((await f.call('bid/session')).data.registration.available,true);
  assert.equal((await f.call('bid/register',{...fields,termsConsent:false})).status,409);
  assert.equal((await f.call('bid/register',{...fields,consentVersion:'older'})).status,409);
  assert.equal((await f.call('bid/register',{...fields,phone:'-------'})).status,400);
  assert.equal((await f.call('bid/register',{...fields,legalType:'corporate',businessNumber:'1234567890'})).status,400);
  const proof={kind:'certificate',name:'proof.png',mime:'image/png',data:'iVBORw0KGgo='};
  const saved=await f.call('bid/register',{...fields,legalType:'corporate',businessNumber:'123-45-67890',files:[proof]});
  assert.equal(saved.status,201);assert.equal(saved.data.status,'pending');assert.ok(saved.data.id);assert.equal(saved.cookie,undefined);
  assert.equal(f.raw.prepare('SELECT length(content) n FROM member_files WHERE member_id=?').get(saved.data.id).n,8);
  assert.equal((await f.call('bid/register',fields)).status,409);
  const waiting=await f.call('bid/login',fields);assert.equal(waiting.status,403);assert.equal(waiting.data.status,'pending');
  assert.equal(f.raw.prepare('SELECT count(*) n FROM market_sessions').get().n,0);
  const original=f.env.DB.batch.bind(f.env.DB);
  f.env.DB.batch=statements=>{
    f.raw.prepare("UPDATE settings SET value=json_set(value,'$.accepting',0) WHERE key='service'").run();
    return original(statements);
  };
  assert.equal((await f.call('bid/register',{...fields,email:'second@example.test',legalType:'corporate',businessNumber:'9876543210',files:[proof]})).status,409);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,1);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM member_files').get().n,1);
});

test('reopened member intake accepts all brand and packaging application types but no designer signups',async t=>{
  const f=fixture(t);
  f.publish();
  f.raw.prepare("UPDATE settings SET value=json_set(value,'$.accepting',0,'$.memberAccepting',1) WHERE key='service'").run();
  assert.equal((await f.call('bid/session')).data.registration.available,true);
  const proof={kind:'certificate',name:'proof.png',mime:'image/png',data:'iVBORw0KGgo='};
  for(const [kind,role] of [['brand','brand'],['packaging','supplier']]){
    for(const legalType of ['individual','sole','corporate']){
      const fields=account(`${kind}-${legalType}`,kind);
      const business=legalType==='individual'?{}:{businessNumber:'1234567890',files:[proof]};
      const saved=await f.call('bid/register',{...fields,...business,legalType});
      assert.equal(saved.status,201);
      const row=f.raw.prepare('SELECT role,legal_type,status FROM members WHERE id=?').get(saved.data.id);
      assert.deepEqual({...row},{role,legal_type:legalType,status:'pending'});
    }
  }
  const design=account('designer','design');
  assert.equal((await f.call('bid/register',{...design,role:'supplier'})).status,403);
  assert.equal((await f.call('bid/register',{...design,kind:'both'})).status,400);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,6);
});

test('customer trial accepts chosen business proof and optional photos under ordinary signup limits',async t=>{
  const f=fixture(t);
  const trialMode=async()=>(await f.call('bid/session')).data.registration.trial;
  assert.equal(await trialMode(),false);f.publish(customerTrialVersion);assert.equal(await trialMode(),true);
  const text=Buffer.from(trialCertificate.data,'base64').toString('ascii').replace('startxref','% synthetic test padding\n'.repeat(1000)+'startxref');
  const certificate={...trialCertificate,name:'가상 사업자 확인서.pdf',data:Buffer.from(text).toString('base64')};
  const photo={kind:'workplace',name:'가상 작업 현장.png',mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQzXQFAAGiANzRTMslAAAAAElFTkSuQmCC'};
  const business={...account('trial-buyer'),consentVersion:customerTrialVersion,legalType:'sole',businessNumber:'1234567890',files:[certificate,photo]};
  assert.equal((await f.call('bid/register',{...business,files:[{...certificate,data:'x'.repeat(11000000)}]})).status,413);
  for(const files of [[],[null],[{...certificate,mime:'image/png'}],[{...certificate,data:'x'.repeat(2097153)}],
    [{...certificate,kind:'workplace'}],[certificate,certificate],[certificate,...Array(5).fill(photo)]]){
    assert.equal((await f.call('bid/register',{...business,files},{'CF-Connecting-IP':'192.0.2.5'})).status,400);
  }
  assert.equal((await f.call('bid/register',{...business,legalType:'individual'})).status,400);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,0);
  const saved=await f.call('bid/register',business);
  assert.equal(saved.status,201);assert.equal(saved.data.status,'pending');
  const files=f.raw.prepare('SELECT name,content FROM member_files WHERE member_id=? ORDER BY kind').all(saved.data.id);
  assert.deepEqual(files.map(file=>[file.name,Buffer.from(file.content).toString('base64')]),business.files.map(file=>[file.name,file.data]));
  const credentials={email:business.email,password:business.password};
  assert.equal((await f.call('bid/login',credentials)).data.status,'pending');
  await f.approve(saved.data.id);
  const login=await f.call('bid/login',credentials);
  assert.equal(login.status,200);assert.ok(login.cookie);assert.equal(login.data.user.legacyOnly,false);
  assert.equal((await f.call('bid/posts',job,{Cookie:login.cookie})).status,201);
  const individual={...account('trial-individual','packaging'),consentVersion:customerTrialVersion,files:[photo]};
  assert.equal((await f.call('bid/register',individual)).status,201);
  f.publish();assert.equal(await trialMode(),false);
  const normal=await f.call('bid/register',{...business,email:'normal@example.test',consentVersion:'accepted-version',files:[{...trialCertificate,name:'normal.pdf'}]});
  assert.equal(normal.status,201);
});

test('trial republication preserves the trial notice and ordinary upload safeguards',async t=>{
  const f=fixture(t);f.publish(customerTrialVersion);
  async function save(published){
    const url=new URL('https://admin.example.test/api/admin/policy');
    const input={...await policy(f.env),customerTrial:false,reviewed:true,published};
    return (await policyApi(new Request(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),f.env,url,f.owner)).json();
  }
  const updated=await save(true);
  assert.notEqual(updated.version,customerTrialVersion);assert.equal(updated.customerTrial,true);
  f.raw.exec("UPDATE settings SET value=json_set(value,'$.memberAccepting',1) WHERE key='service'");
  assert.equal((await f.call('bid/session')).data.registration.trial,true);
  const fields={...account('trial-republish'),consentVersion:updated.version,legalType:'corporate',businessNumber:'1234567890',trial:false};
  assert.equal((await f.call('bid/register',{...fields,files:[{...trialCertificate,data:'aW52YWxpZA=='}]})).status,400);
  assert.equal((await f.call('bid/register',{...fields,files:[trialCertificate]})).status,201);
  f.raw.exec("UPDATE settings SET value=json_set(value,'$.operator','New operator') WHERE key='service'");
  assert.equal((await save(true)).customerTrial,true);
  f.raw.exec("UPDATE settings SET value=json_set(value,'$.contactEmail','support@company.example') WHERE key='service'");
  assert.equal((await save(false)).customerTrial,true);
  assert.equal((await save(true)).customerTrial,false);
  assert.equal((await f.call('bid/session')).data.registration.trial,false);
});

test('approved accounts share real posts across logins; one selected offer reaches the existing admin connection workflow',async t=>{
  const f=fixture(t);f.publish();
  const roles=[account('buyer'),account('factory','packaging'),account('factory2','packaging'),account('outsider')], users=[];
  for(const fields of roles){
    const saved=await f.call('bid/register',fields);await f.approve(saved.data.id);
    const login=await f.call('bid/login',fields);assert.equal(login.status,200);assert.ok(login.cookie);
    assert.equal(login.data.token,undefined);users.push({id:saved.data.id,headers:{Cookie:login.cookie}});
  }
  const [brand,a,b,outsider]=users;
  assert.equal((await f.call('bid/posts',job,a.headers)).status,403);
  const examples=(await f.call('bid/state')).data;assert.deepEqual(examples.posts,[]);assert.ok(examples.partners.every(p=>p.example));
  assert.deepEqual((await f.call('bid/state',undefined,brand.headers)).data.posts,examples.posts);
  const post=(await f.call('bid/posts',job,brand.headers)).data.id;
  assert.deepEqual((await f.call('bid/state')).data.posts,[]);
  assert.equal((await f.call('bid/posts/'+post+'/offers',pricing,a.headers)).status,404);
  f.raw.prepare("UPDATE market_posts SET review_status='approved' WHERE id=?").run(post);
  const again=await f.call('bid/login',roles[0]);
  assert.equal((await f.call('bid/state',undefined,{Cookie:again.cookie})).data.posts[0].id,post);
  const guest=(await f.call('bid/state')).data;assert.equal(guest.posts.length,1);assert.equal(guest.posts[0].example,undefined);
  assert.equal((await f.call('bid/posts/'+post+'/offers',pricing,outsider.headers)).status,403);
  const aOffer=(await f.call('bid/posts/'+post+'/offers',pricing,a.headers)).data.id;
  const bOffer=(await f.call('bid/posts/'+post+'/offers',pricing,b.headers)).data.id;
  const board=async actor=>(await f.call('bid/state',undefined,actor.headers)).data;
  assert.deepEqual((await board(brand)).offers,[]);
  assert.equal((await f.call('bid/state')).data.posts[0].offerCount,0);
  assert.equal((await board(a)).offers[0].reviewStatus,'pending');
  assert.equal((await f.call('bid/offers/'+aOffer+'/select',{accepted:true,quantity:1000},brand.headers)).status,404);
  for(const id of [aOffer,bOffer]){
    const url=new URL('https://admin.example.test/api/admin/market/offers/'+id+'/review');
    const approved=await adminMarketApi(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'approve',confirmed:true,version:1})}),f.env,url,f.owner);
    assert.equal(approved.status,200);
  }
  const bids=(await board(brand)).offers;
  assert.deepEqual(new Set(bids.map(o=>o.alias)),new Set(['제안사 A','제안사 B']));
  assert.deepEqual(bids.find(o=>o.id===aOffer).tiers,pricing.tiers);
  assert.deepEqual((await board(a)).offers.map(o=>o.id),[aOffer]);
  const otherBrand=await board(outsider);
  assert.equal(otherBrand.posts[0].brandAlias,'브랜드 A');assert.deepEqual(otherBrand.offers,[]);
  assert.doesNotMatch(JSON.stringify([otherBrand,bids]),/buyer 업체|factory|example.test|010-1234-5678/);
  const select=(id,actor,quantity=1000)=>f.call('bid/offers/'+id+'/select',{accepted:true,quantity},actor.headers);
  assert.equal((await select(aOffer,outsider)).status,404);
  assert.equal((await select(aOffer,a)).status,403);
  const attempts=await Promise.all([select(aOffer,brand),select(bOffer,brand)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
  const winner=attempts[0].status===201?a:b,winnerOffer=winner===a?aOffer:bOffer;
  const againSelect=await select(winnerOffer,brand);assert.equal(againSelect.status,200);assert.equal(againSelect.data.kind,'connection');
  assert.equal((await select(winnerOffer,brand,2000)).status,409);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM matching_requests').get().n,1);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM matching_request_events').get().n,1);
  const preservedTables=['market_posts','market_offers','market_connection_requests','matching_requests','matching_request_events','market_offer_reviews','submission_agreements'];
  const beforeMigration=preservedTables.map(name=>f.raw.prepare(`SELECT * FROM ${name}`).all());
  f.raw.exec('BEGIN');f.raw.exec(readFileSync(new URL('0022_post_consultation.sql',migrationDir),'utf8'));f.raw.exec('COMMIT');
  assert.deepEqual(preservedTables.map(name=>f.raw.prepare(`SELECT * FROM ${name}`).all()),beforeMigration);
  assert.deepEqual(f.raw.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.deepEqual((await f.call('bid/state',undefined,outsider.headers)).data.connections,[]);
  const match=(await board(winner)).connections[0];
  assert.equal(match.alias,bids.find(o=>o.id===winnerOffer).alias);
  assert.deepEqual((await board(winner===a?b:a)).connections,[]);
  assert.equal((await f.call('bid/state',undefined,winner.headers)).data.connections[0].status,'pending');
  const adminURL=new URL('https://admin.example.test/api/admin/partners');
  await partnerApi(new Request(adminURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brandId:brand.id,supplierId:winner.id,note:'연결 확인',explained:true})}),f.env,adminURL,f.owner);
  assert.equal((await f.call('bid/state',undefined,brand.headers)).data.connections[0].status,'completed');
  assert.equal((await f.call('bid/contracts/'+againSelect.data.id+'/pay',{kind:'production'},brand.headers)).status,403);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM market_payments').get().n,0);
  assert.equal((await f.call('bid/logout',{},brand.headers)).cookie,'factner_member=');
  assert.equal((await f.call('bid/session',undefined,brand.headers)).data.user,null);
});

test('seed credentials never cross into live storage, room switching revokes the former member session, and samples are read-only',async t=>{
  const f=fixture(t);f.publish();const member=account('regular');
  const saved=await f.call('bid/register',member);await f.approve(saved.data.id);
  const live=await f.call('bid/login',member);
  const livePost=(await f.call('bid/posts',job,{Cookie:live.cookie})).data.id;
  assert.equal((await f.call('bid/register',{...member,email:'package1@gmail.com'})).status,409);
  assert.equal((await f.call('bid/demo',{role:'admin'})).status,404);
  const test=await f.call('bid/login',{email:'package1@gmail.com',password:reviewPassword,role:'packaging'},{Cookie:live.cookie});
  assert.equal(test.status,200);assert.match(test.data.reviewRoom,/^[a-f0-9]{64}$/);assert.equal(test.cookie,'factner_member=');
  assert.equal((await f.call('bid/session',undefined,{Cookie:live.cookie})).data.user,null);
  const headers={Authorization:'Bearer '+test.data.token,'X-Factner-Review':test.data.reviewRoom};
  assert.equal((await f.call('bid/session',undefined,headers)).data.mode,'review');
  const board=(await f.call('bid/state',undefined,headers)).data;assert.equal(board.posts.length,0);assert.ok(!board.posts.some(p=>p.id===livePost));
  assert.equal((await f.call('bid/state',undefined,{...headers,'X-Factner-Review':'f'.repeat(64)})).status,401);
  assert.equal((await f.call('bid/posts',{...job,title:'격리된 공고'},headers)).status,403);
  assert.equal((await f.call('bid/login',{email:'brand1@gmail.com',password:reviewPassword})).status,401);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM market_posts').get().n,1);
  assert.equal(f.raw.prepare("SELECT count(*) n FROM market_accounts WHERE id LIKE 'seed-%'").get().n,0);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM market_sessions').get().n,0);
});

test('a former pilot consent retains legacy access but cannot read, advertise or select in the live market',async t=>{
  const f=fixture(t);f.publish();
  const brand=account('old-member'),supplier=account('other-member','packaging');
  for(const fields of [brand,supplier]){const saved=await f.call('bid/register',fields);await f.approve(saved.data.id);}
  const buyer=await f.call('bid/login',brand),maker=await f.call('bid/login',supplier);
  assert.equal(buyer.data.user.legacyOnly,false);
  const original=(await f.call('bid/posts',job,{Cookie:buyer.cookie})).data.id;
  f.raw.prepare("UPDATE market_posts SET review_status='approved' WHERE id=?").run(original);
  const proposal=await f.call('bid/posts/'+original+'/offers',pricing,{Cookie:maker.cookie});
  assert.equal(proposal.status,201);
  f.raw.prepare('UPDATE members SET consent_version=? WHERE id=?').run('member-pilot-2026-10-21',buyer.data.user.id);
  const legacy=await f.call('bid/login',brand);
  assert.ok(legacy.cookie);assert.equal(legacy.data.user.legacyOnly,true);
  assert.equal((await f.call('bid/session',undefined,{Cookie:legacy.cookie})).data.user.legacyOnly,true);
  assert.equal((await f.call('member/me',undefined,{Cookie:legacy.cookie})).status,200);
  assert.deepEqual((await f.call('bid/state',undefined,{Cookie:legacy.cookie})).data,{partners:[],posts:[],offers:[],contracts:[],connections:[]});
  assert.equal((await f.call('bid/offers/'+proposal.data.id+'/select',{quantity:1000,accepted:true},{Cookie:legacy.cookie})).status,403);
  assert.equal((await f.call('bid/posts',job,{Cookie:legacy.cookie})).status,403);
  assert.deepEqual((await f.call('bid/state')).data.posts,[]);
  const own=(await f.call('bid/state',undefined,{Cookie:maker.cookie})).data;
  assert.deepEqual(own.posts,(await f.call('bid/state')).data.posts);assert.deepEqual(own.offers,[]);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM matching_requests').get().n,0);
  f.raw.prepare('INSERT INTO member_companies(rowid,member_id,profile,listed,created_at,updated_at) VALUES(27,?,?,1,?,?)')
    .run(maker.data.user.id,JSON.stringify({categories:['box','private-id'],quantity:'010-5555-1111',internalNote:'secret',summary:'secret'}),'now','now');
  const card=(await f.call('bid/state')).data.partners[0];
  assert.deepEqual(card,{alias:'27업체',kind:'packaging',items:['box'],title:'패키징 제작업체',description:'수량 협의'});
  f.raw.prepare('UPDATE members SET consent_version=? WHERE id=?').run('member-pilot-2026-10-21',maker.data.user.id);
  assert.ok((await f.call('bid/state')).data.partners.every(p=>p.example));
});
test('supplier design capability stays on the application and welcome is issued once after approval',async t=>{
  const f=fixture(t);f.publish();
  for(const [idx,packagingDesign] of [true,false].entries()){
    const fields={...account('onboarding-'+idx,'packaging'),packagingDesign};
    assert.equal((await f.call('bid/register',{...fields,packagingDesign:null})).status,400);
    const registered=await f.call('bid/register',fields);
    assert.equal(registered.status,201);
    const id=registered.data.id;
    assert.equal(f.raw.prepare('SELECT packaging_design FROM members WHERE id=?').get(id).packaging_design,Number(packagingDesign));
    const login=()=>f.call('bid/login',{email:fields.email,password});
    assert.equal((await login()).status,403);
    await f.approve(id);
    const responses=await Promise.all([login(),login()]);
    assert.deepEqual(responses.map(r=>r.data.firstLogin).sort(),[false,true]);
    assert.equal((await login()).data.firstLogin,false);
    assert.equal((await f.call('bid/posts',job,{Cookie:responses[0].cookie})).status,403);
  }
});
