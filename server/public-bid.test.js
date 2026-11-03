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
      const isolate=database(t,['0001_initial.sql','0013_bid_market.sql','0015_market_post_review.sql']);seedReview(isolate.raw);
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
const account=(key,kind='brand')=>({email:key+'@example.test',password,name:key+' 업체',contact:'담당자',phone:'010-1234-5678',
  kind,legalType:'individual',files:[],consent:true,termsConsent:true,consentVersion:'accepted-version'});
const job={category:'packaging',title:'단상자 신규 제작',quantity:1000,unitPrice:300,size:'50 × 50',description:'코팅 종이 / 택배 납품',deadline:'2099-01-01'};
const pricing={tiers:[{quantity:1000,unitPrice:250},{quantity:2000,unitPrice:225}],note:'배송 포함'};

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
  await f.call('bid/login',{email:'brand1@gmail.com',password:reviewPassword},{'X-Factner-Review':key});
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

test('a published customer trial accepts permanent accounts and only the supplied sample business document',async t=>{
  const f=fixture(t);
  const trialMode=async()=>(await f.call('bid/session')).data.registration.trial;
  assert.equal(await trialMode(),false);f.publish(customerTrialVersion);assert.equal(await trialMode(),true);
  const business={...account('trial-buyer'),consentVersion:customerTrialVersion,legalType:'sole',businessNumber:'1234567890',files:[trialCertificate]};
  for(const files of [[],[null],[{...trialCertificate,name:'private.pdf'}],[{...trialCertificate,data:'JVBERi1wcml2YXRl'}],
    [{...trialCertificate,kind:'workplace'}],[trialCertificate,trialCertificate]]){
    assert.equal((await f.call('bid/register',{...business,files})).status,400);
  }
  assert.equal((await f.call('bid/register',{...business,legalType:'individual'})).status,400);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM members').get().n,0);
  const saved=await f.call('bid/register',business);
  assert.equal(saved.status,201);assert.equal(saved.data.status,'pending');
  const file=f.raw.prepare('SELECT name,content FROM member_files WHERE member_id=?').get(saved.data.id);
  assert.equal(file.name,trialCertificate.name);assert.equal(Buffer.from(file.content).toString('base64'),trialCertificate.data);
  const credentials={email:business.email,password:business.password};
  assert.equal((await f.call('bid/login',credentials)).data.status,'pending');
  await f.approve(saved.data.id);
  const login=await f.call('bid/login',credentials);
  assert.equal(login.status,200);assert.ok(login.cookie);assert.equal(login.data.user.legacyOnly,false);
  assert.equal((await f.call('bid/posts',job,{Cookie:login.cookie})).status,201);
  const individual={...account('trial-individual','packaging'),consentVersion:customerTrialVersion};
  assert.equal((await f.call('bid/register',individual)).status,201);
  f.publish();assert.equal(await trialMode(),false);
  const normal=await f.call('bid/register',{...business,email:'normal@example.test',consentVersion:'accepted-version',files:[{...trialCertificate,name:'normal.pdf'}]});
  assert.equal(normal.status,201);
});

test('trial document republication preserves sample-only intake until formal publication with new operator details',async t=>{
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
  assert.equal((await f.call('bid/register',{...fields,files:[{...trialCertificate,name:'private.pdf'}]})).status,400);
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
  const examples=(await f.call('bid/state')).data;assert.ok(examples.posts.every(p=>p.example));assert.ok(examples.partners.every(p=>p.example));
  assert.deepEqual((await f.call('bid/state',undefined,brand.headers)).data.posts,[]);
  const post=(await f.call('bid/posts',job,brand.headers)).data.id;
  assert.ok((await f.call('bid/state')).data.posts.every(p=>p.example));
  assert.equal((await f.call('bid/posts/'+post+'/offers',pricing,a.headers)).status,404);
  f.raw.prepare("UPDATE market_posts SET review_status='approved' WHERE id=?").run(post);
  const again=await f.call('bid/login',roles[0]);
  assert.equal((await f.call('bid/state',undefined,{Cookie:again.cookie})).data.posts[0].id,post);
  const guest=(await f.call('bid/state')).data;assert.equal(guest.posts.length,1);assert.equal(guest.posts[0].example,undefined);
  const aOffer=(await f.call('bid/posts/'+post+'/offers',pricing,a.headers)).data.id;
  const bOffer=(await f.call('bid/posts/'+post+'/offers',pricing,b.headers)).data.id;
  const select=(id,actor,quantity=1000)=>f.call('bid/offers/'+id+'/select',{accepted:true,quantity},actor.headers);
  assert.equal((await select(aOffer,outsider)).status,404);
  const attempts=await Promise.all([select(aOffer,brand),select(bOffer,brand)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
  const winner=attempts[0].status===201?a:b,winnerOffer=winner===a?aOffer:bOffer;
  const againSelect=await select(winnerOffer,brand);assert.equal(againSelect.status,200);assert.equal(againSelect.data.kind,'connection');
  assert.equal((await select(winnerOffer,brand,2000)).status,409);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM matching_requests').get().n,1);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM matching_request_events').get().n,1);
  assert.deepEqual((await f.call('bid/state',undefined,outsider.headers)).data.connections,[]);
  assert.equal((await f.call('bid/state',undefined,winner.headers)).data.connections[0].status,'pending');
  const adminURL=new URL('https://admin.example.test/api/admin/partners');
  await partnerApi(new Request(adminURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brandId:brand.id,supplierId:winner.id,note:'연결 확인'})}),f.env,adminURL,f.owner);
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
  assert.equal((await f.call('bid/register',{...member,email:'brand1@gmail.com'})).status,409);
  assert.equal((await f.call('bid/demo',{role:'admin'})).status,404);
  const test=await f.call('bid/login',{email:'brand1@gmail.com',password:reviewPassword,role:'brand'},{Cookie:live.cookie});
  assert.equal(test.status,200);assert.match(test.data.reviewRoom,/^[a-f0-9]{64}$/);assert.equal(test.cookie,'factner_member=');
  assert.equal((await f.call('bid/session',undefined,{Cookie:live.cookie})).data.user,null);
  const headers={Authorization:'Bearer '+test.data.token,'X-Factner-Review':test.data.reviewRoom};
  assert.equal((await f.call('bid/session',undefined,headers)).data.mode,'review');
  const board=(await f.call('bid/state',undefined,headers)).data;assert.equal(board.posts.length,10);assert.ok(!board.posts.some(p=>p.id===livePost));
  assert.equal((await f.call('bid/state',undefined,{...headers,'X-Factner-Review':'f'.repeat(64)})).status,401);
  const testPost=(await f.call('bid/posts',{...job,title:'격리된 공고'},headers)).data.id;
  assert.ok(testPost);assert.ok(!(await f.call('bid/state')).data.posts.some(p=>p.id===testPost));
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
  assert.ok((await f.call('bid/state')).data.posts.every(p=>p.example));
  const own=(await f.call('bid/state',undefined,{Cookie:maker.cookie})).data;
  assert.deepEqual(own.posts,[]);assert.deepEqual(own.offers,[]);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM matching_requests').get().n,0);
  f.raw.prepare('INSERT INTO member_companies(rowid,member_id,profile,listed,created_at,updated_at) VALUES(27,?,?,1,?,?)')
    .run(maker.data.user.id,JSON.stringify({categories:['box','private-id'],quantity:'010-5555-1111',internalNote:'secret',summary:'secret'}),'now','now');
  const card=(await f.call('bid/state')).data.partners[0];
  assert.deepEqual(card,{alias:'27업체',kind:'packaging',items:['box'],title:'패키징 제작업체',description:'수량 협의'});
  f.raw.prepare('UPDATE members SET consent_version=? WHERE id=?').run('member-pilot-2026-10-21',maker.data.user.id);
  assert.ok((await f.call('bid/state')).data.partners.every(p=>p.example));
});
