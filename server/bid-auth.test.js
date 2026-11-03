import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { bidApi } from './bid-auth.js';
import { BidRoom } from './bid-room.js';
import { HttpError } from './http.js';
import { insertReviewFixtures,seedReview,reviewPassword } from '../scripts/bid-seed.mjs';
import worker from './worker.js';
import {digest,passwordHash,randomToken} from './security.js';
import {SUBMISSION_AGREEMENT} from '../shared/submission-agreement.js';

function fixture(t) {
  const raw = new DatabaseSync(':memory:');
  t.after(()=>raw.close());
  for (const file of ['0001_initial.sql','0002_admin_security.sql','0013_bid_market.sql','0015_market_post_review.sql','0018_market_offer_review.sql','0019_submission_agreements.sql']) {
    raw.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  }
  const DB = {
    prepare(sql) {
      return { bind(...args) {
        const query = raw.prepare(sql);
        return {
          first:()=>query.get(...args),
          all:()=>({results:query.all(...args)}),
          run:()=>query.columns().length ? {results:query.all(...args)} : {meta:{changes:query.run(...args).changes}}
        };
      } };
    },
    batch(items) {
      raw.exec('BEGIN');
      try {
        const results=items.map(q=>q.run());
        raw.exec('COMMIT');
        return results;
      } catch(error) { raw.exec('ROLLBACK'); throw error; }
    }
  };
  const env = {DB,BID_DEMO:'1',previewAdminSessions:new Map()};
  async function call(path, {input,token,host='127.0.0.1',environment=env}={}) {
    const url = new URL('http://'+host+'/api/bid/'+path);
    const headers = token ? {Authorization:'Bearer '+token} : {};
    if (input!==undefined) headers['Content-Type']='application/json';
    const request = new Request(url,{method:input===undefined?'GET':'POST',headers,body:input===undefined?undefined:JSON.stringify(input)});
    try {
      const response = await bidApi(request,environment,url);
      return {status:response.status,data:await response.json()};
    } catch(error) {
      if (!(error instanceof HttpError)) throw error;
      return {status:error.status,data:{error:error.message}};
    }
  }
  return {raw,env,call};
}
const registration={email:'brand@example.test',password:'fixture-password-123',name:'가상 가입자',kind:'brand'};

test('every bid endpoint is closed outside a local demo even with a plausible bearer token',async t=>{
  const {call,env,raw}=fixture(t);
  for(const [host,flag] of [['factner.com','1'],['localhost.example.test','1'],['127.0.0.1','0'],['localhost',undefined]]) {
    const options={host,token:'a'.repeat(64),environment:{BID_DEMO:flag}};
    for(const [path,input] of [['session'],['state'],['register',registration],['login',registration],['demo',{role:'admin'}],['logout',{}],['posts',{}]]) {
      assert.equal((await call(path,{...options,input})).status,503,host+' '+path);
    }
  }
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM market_accounts').get().n,0);
  assert.equal((await call('session',{host:'localhost',environment:env})).status,401);
});

test('only fixture passwords grant a review session; signup, account lists, quick login and admin impersonation stay closed',async t=>{
  const {raw,call}=fixture(t);await seedReview(raw);await seedReview(raw);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM market_accounts').get().n,4);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM market_posts').get().n,0);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM market_offers').get().n,0);
  for(let n=1;n<=10;n++)assert.equal((await call('login',{input:{email:`brand${n}@gmail.com`,password:reviewPassword}})).status,401);
  assert.equal((await call('state')).status,401);
  assert.equal((await call('register',{input:registration})).status,404);
  assert.equal((await call('demo',{input:{role:'admin'}})).status,404);
  assert.equal((await call('login',{input:registration})).status,401);
  for(const [key,role] of [['package1','packaging'],['design1','design'],['design2','design'],['packagedesign1','packaging']]){
    const fields={email:key+'@gmail.com',password:reviewPassword,role};
    assert.equal((await call('login',{input:{...fields,password:'wrong-password'}})).status,401);
    const login=await call('login',{input:fields});assert.equal(login.status,200);
    const session=await call('session',{token:login.data.token});assert.equal(session.data.mode,'review');assert.deepEqual(session.data.accounts,[]);
    const state=await call('state',{token:login.data.token});assert.equal(state.status,200);
    if(role==='design')assert.ok(state.data.posts.every(p=>p.category==='design'));
    assert.equal((await call('logout',{token:login.data.token,input:{}})).status,200);
    assert.equal((await call('session',{token:login.data.token})).status,401);
  }
});

// Exercise the Durable Object SQL cursor contract against a real, independent SQLite database per room.
function roomContext(t) {
  let db = new DatabaseSync(':memory:'), alarm = null;
  t.after(() => db.close());
  const storage = {
    sql: {
      exec(query, ...args) {
        let rows = [];
        if (!args.length && query.includes(';')) db.exec(query);
        else {
          const stmt = db.prepare(query);
          if (stmt.columns().length) rows = stmt.all(...args);
          else stmt.run(...args);
        }
        return { toArray: () => rows, one: () => { assert.equal(rows.length, 1); return rows[0]; } };
      }
    },
    transactionSync(fn) {
      db.exec('BEGIN');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    getAlarm: () => alarm,
    setAlarm: at => { alarm = at; },
    deleteAll() { db.close(); db = new DatabaseSync(':memory:'); alarm = null; }
  };
  return { storage, blockConcurrencyWhile: fn => fn() };
}

const roomSchema = readFileSync(new URL('../migrations/0013_bid_market.sql', import.meta.url), 'utf8');
const reviewSchema = readFileSync(new URL('../migrations/0015_market_post_review.sql', import.meta.url), 'utf8');
const offerSchema = readFileSync(new URL('../migrations/0018_market_offer_review.sql', import.meta.url), 'utf8');
const agreementSchema = readFileSync(new URL('../migrations/0019_submission_agreements.sql', import.meta.url), 'utf8');
async function roomCall(room, path, { input, token, origin = 'https://review.example.test' } = {}) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await room.fetch(new Request('https://review.example.test/api/bid/' + path, {
    method: input === undefined ? 'GET' : 'POST', headers, body: JSON.stringify(input)
  }));
  return { status: response.status, data: await response.json() };
}

test('a preview login never initializes an unknown or expired room',async t=>{
  const ctx=roomContext(t),room=new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema);
  const input={email:'test-'+'a'.repeat(24)+'@preview.factner.invalid',password:'a-generated-password-for-preview'};
  assert.equal((await roomCall(room,'preview-login',{input})).status,401);
  assert.equal(ctx.storage.getAlarm(),null);
  assert.equal(ctx.storage.sql.exec('SELECT count(*) n FROM sqlite_master').one().n,0);
  assert.equal((await roomCall(room,'preview-register',{input:{...input,kind:'packaging',legalType:'corporate'}})).status,404);
  assert.equal(ctx.storage.getAlarm(),null);
  await roomCall(room,'login',{input:{email:'package1@gmail.com',password:reviewPassword}});
  ctx.storage.sql.exec("INSERT INTO market_accounts VALUES('preview-account',?,'테스트 업체','packaging',?)",input.email,await passwordHash(input.password));
  const expiry=ctx.storage.getAlarm();assert.ok(expiry>Date.now());
  const resumed=new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema);
  assert.equal((await roomCall(resumed,'preview-login',{input})).status,200);
  ctx.storage.sql.exec('UPDATE review_room SET expires_at=?',Date.now()-1);
  assert.equal((await roomCall(new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema),'preview-login',{input})).status,410);
  await room.alarm();assert.equal((await roomCall(room,'preview-login',{input})).status,401);
  assert.equal(ctx.storage.getAlarm(),null);
});

test('review logins, activity and sessions are independent per room, survive eviction and expire',async t=>{
  const ctx=roomContext(t),one=new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema),two=new BidRoom(roomContext(t),roomSchema,reviewSchema,offerSchema,agreementSchema);
  const fields={email:'package1@gmail.com',password:reviewPassword,role:'packaging'};
  assert.equal((await roomCall(one,'login',{input:fields,origin:'https://other.test'})).status,403);
  assert.equal((await roomCall(one,'state')).status,401);assert.equal((await roomCall(one,'events')).status,404);
  const {token}= (await roomCall(one,'login',{input:fields})).data, resumed=new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema);
  assert.equal((await roomCall(resumed,'state',{token})).data.posts.length,0);
  assert.equal((await roomCall(two,'state',{token})).status,401);
  assert.equal((await roomCall(resumed,'register',{input:registration})).status,404);
  assert.equal((await roomCall(resumed,'demo',{input:{role:'admin'}})).status,404);
  const expiresAt=ctx.storage.getAlarm();assert.ok(Math.abs(expiresAt-Date.now()-7*86400000)<3000);
  ctx.storage.sql.exec('UPDATE review_room SET expires_at=?',Date.now()-1);
  const expired=new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema);assert.equal((await roomCall(expired,'state',{token})).status,410);
  await expired.alarm();assert.equal(ctx.storage.getAlarm(),null);
  assert.equal(ctx.storage.sql.exec("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").one().n,0);
});

test('public Worker flags and request-supplied room markers cannot open a bid database', async () => {
  const url = new URL('https://factner.com/api/bid/session?hosted=true');
  const req = new Request(url, { headers: { 'X-Bid-Room': '1' } });
  await assert.rejects(() => bidApi(req, {
    BID_DEMO: '1', hosted: true, isIsolatedReview: true, roomDatabase: {}, get DB() { throw new Error('Production DB was accessed'); }
  }, url), error => error instanceof HttpError && error.status === 503);
});

test('old rooms retire only generated posts, keep handwritten rows and contracts, and reject retired sessions',async t=>{
 for(const previouslyMigrated of [false,true]){
  const ctx=roomContext(t),sql=ctx.storage.sql,at=Date.now(),expiry=at+7*86400000;
  sql.exec(roomSchema);
  sql.exec('CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL); CREATE TABLE review_room(id INTEGER PRIMARY KEY,expires_at INTEGER NOT NULL);');
  sql.exec('INSERT INTO review_room VALUES(1,?)',expiry);
  insertReviewFixtures(query=>(...args)=>sql.exec(query,...args));
  sql.exec("INSERT INTO market_accounts SELECT 'seed-brand1','brand1@gmail.com','브랜드1','brand',password_hash FROM market_accounts WHERE id='seed-package1'");
  const original=crypto.randomUUID(),handwritten=crypto.randomUUID(),privatePost=crypto.randomUUID(),offer=crypto.randomUUID(),deal=crypto.randomUUID(),token=randomToken();
  sql.exec("INSERT INTO market_posts VALUES(?,'seed-brand1','packaging','앰플 단상자 3,000개 제작',3000,480,'42 × 42 × 118 mm','무광 코팅 백판지, 별색 1도. 유리 앰플을 고정할 종이 받침이 필요합니다.',?,?)",
    original,new Date(at+3*86400000+9*3600000).toISOString().slice(0,10),new Date(at-9*60000).toISOString());
  sql.exec('INSERT INTO market_posts SELECT ?,brand_id,category,title,quantity,unit_price,size,description,deadline,? FROM market_posts WHERE id=?',handwritten,new Date(at).toISOString(),original);
  sql.exec("INSERT INTO market_posts VALUES(?,'seed-brand1','packaging','등록자 보관 제목',400,200,'이전 규격','외부 비공개 설명','2099-01-01',?)",privatePost,new Date(at).toISOString());
  sql.exec("INSERT INTO market_offers VALUES(?,?,'seed-package1','제안사 A','[]','비고',?)",offer,original,new Date(at).toISOString());
  sql.exec("INSERT INTO market_contracts(id,post_id,offer_id,quantity,unit_price,version,terms_json,brand_signature,brand_signed_at) VALUES(?,?,?,400,200,'v','{}','서명',?)",deal,original,offer,new Date(at).toISOString());
  sql.exec("INSERT INTO market_sessions VALUES(?,'seed-brand1',?)",await digest(token),expiry);
  if(previouslyMigrated){
   sql.exec(reviewSchema);
   sql.exec("UPDATE market_posts SET review_status='approved' WHERE id IN (?,?)",original,handwritten);
  }
  const room=new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema);
  const supplier=(await roomCall(room,'login',{input:{email:'package1@gmail.com',password:reviewPassword}})).data.token;
  const state=(await roomCall(room,'state',{token:supplier})).data;
  assert.deepEqual(state.posts.map(p=>p.id),previouslyMigrated?[handwritten]:[]);
  const review=id=>sql.exec('SELECT review_status,review_version FROM market_posts WHERE id=?',id).one();
  assert.equal(review(original).review_status,'withdrawn');
  assert.equal(review(handwritten).review_status,previouslyMigrated?'approved':'pending');
  assert.equal(review(privatePost).review_status,'pending');
  assert.equal(state.contracts[0].id,deal);assert.equal(state.contracts[0].title,'비공개 공고');
  assert.equal(sql.exec('SELECT count(*) n FROM market_offers WHERE id=?',offer).one().n,1);
  assert.equal((await roomCall(room,'login',{input:{email:'brand1@gmail.com',password:reviewPassword}})).status,401);
  assert.equal((await roomCall(room,'state',{token})).status,401);
  await roomCall(new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema),'state',{token:supplier});
  assert.equal(review(original).review_version,2);assert.equal(ctx.storage.getAlarm(),expiry);
 }
});

test('only an actual owner can review a specifically shared post inside its original room',async t=>{
 const {raw,env}=fixture(t),roomA='a'.repeat(64),roomB='b'.repeat(64),missing='c'.repeat(64);
 const rooms=new Map(),contexts=new Map(),forwarded=[];
 for(const key of [roomA,roomB,missing]){
   const ctx=roomContext(t);contexts.set(key,ctx);rooms.set(key,new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema));
 }
 async function signIn(key,email){
   return (await roomCall(rooms.get(key),'login',{input:{email,password:reviewPassword}})).data.token;
 }
 async function ownerToken(role){
   const id=crypto.randomUUID(),token=randomToken();
   raw.prepare('INSERT INTO admins(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(id,role,role,'!',role,'now');
   raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)').run(await digest(token),id,Date.now()+600000);
   return {id,token};
 }
 const owner=await ownerToken('owner'),staff=await ownerToken('staff');
 const environment={...env,APP_KIND:'admin',REVIEW_ROOMS:{idFromName:key=>key,get:key=>({fetch:req=>{
   forwarded.push({url:req.url,cookie:req.headers.get('Cookie'),bearer:req.headers.get('Authorization'),actor:req.headers.get('X-Factner-Reviewer'),key:req.headers.get('X-Factner-Review')});
   return rooms.get(key).fetch(req);
 }})}};
 const s=await signIn(roomA,'package1@gmail.com'),other=await signIn(roomB,'package1@gmail.com');
 const post=crypto.randomUUID(),sql=contexts.get(roomA).storage.sql;
 sql.exec("INSERT INTO market_accounts VALUES('seed-brand1','brand1@gmail.com','이전 브랜드','brand','!')");
 sql.exec("INSERT INTO market_posts(id,brand_id,category,title,description,quantity,unit_price,size,deadline,created_at) VALUES(?,'seed-brand1','packaging','공유 시안','원목색 종이',150,220,'90 × 40','2099-01-01',?)",post,new Date().toISOString());
 const path='/api/admin/review-room/posts/'+post,approval={action:'approve',version:1,confirmed:true};
 async function check(key,token,data,kind='admin',target=path){
   const origin='https://'+kind+'.example.test',req=new Request(origin+target,{method:data?'POST':'GET',
     headers:{Origin:origin,'Content-Type':'application/json','X-Factner-Review':key,'X-Factner-Reviewer':'forged-user',Authorization:'Bearer wrong',Cookie:'factner_session='+token},
     body:data?JSON.stringify(data):undefined});
   const res=await worker.fetch(req,{...environment,APP_KIND:kind});return {status:res.status,data:await res.json()};
 }
 assert.equal((await check(roomA,'')).status,401);assert.equal((await check(roomA,staff.token,approval)).status,403);assert.equal(forwarded.length,0);
 assert.equal((await check(roomA,owner.token,approval,'main')).status,404);
 assert.equal((await check('bad',owner.token)).status,400);assert.equal((await check(roomA,owner.token,undefined,'admin','/api/admin/review-room/posts')).status,404);
 assert.equal((await check(missing,owner.token)).status,404);assert.equal(contexts.get(missing).storage.sql.exec("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").one().n,0);
 assert.equal((await check(roomB,owner.token)).status,404);
 const scoped=await check(roomA,owner.token);assert.equal(scoped.data.post.title,'공유 시안');assert.equal(scoped.data.post.reviewStatus,'pending');
 assert.ok(!Object.hasOwn(scoped.data.post,'email'));assert.equal((await roomCall(rooms.get(roomA),'internal/post-review/'+post,{token:s,input:approval})).status,404);
 assert.equal((await roomCall(rooms.get(roomA),'state',{token:s})).data.posts.some(p=>p.id===post),false);
 assert.equal((await check(roomA,owner.token,approval)).data.reviewStatus,'approved');
 assert.equal((await check(roomA,owner.token,approval)).status,409);
 assert.equal((await roomCall(rooms.get(roomA),'state',{token:s})).data.posts.some(p=>p.id===post),true);
 assert.equal((await roomCall(rooms.get(roomB),'state',{token:other})).data.posts.some(p=>p.id===post),false);
 assert.equal(forwarded.every(r=>r.cookie===null&&r.bearer===null&&r.key===null&&r.actor===owner.id&&r.url==='https://factner-review.internal/internal/post-review/'+post+'?page=1'),true);
 assert.equal(raw.prepare('SELECT count(*) n FROM market_posts').get().n,0);assert.equal(raw.prepare('SELECT count(*) n FROM market_post_reviews').get().n,0);
});

test('shared room offer review shows test identities only to its owner and approves only the requested post bid',async t=>{
 const {raw,env}=fixture(t),roomA='d'.repeat(64),roomB='e'.repeat(64),contexts=new Map(),rooms=new Map();
 for(const key of [roomA,roomB]){const ctx=roomContext(t);contexts.set(key,ctx);rooms.set(key,new BidRoom(ctx,roomSchema,reviewSchema,offerSchema,agreementSchema));}
 const room=rooms.get(roomA),supplier=(await roomCall(room,'login',{input:{email:'package1@gmail.com',password:reviewPassword}})).data.token;
 await roomCall(rooms.get(roomB),'login',{input:{email:'package1@gmail.com',password:reviewPassword}});
 const sql=contexts.get(roomA).storage.sql,brandEmail='test-'+'a'.repeat(24)+'@preview.factner.invalid',password='legacy-preview-password';
 sql.exec("INSERT INTO market_accounts VALUES('preview-account',?,'과거 테스트 브랜드','brand',?)",brandEmail,await passwordHash(password));
 const brand=(await roomCall(room,'preview-login',{input:{email:brandEmail,password}})).data.token;
 const post=crypto.randomUUID(),otherPost=crypto.randomUUID();
 for(const id of [post,otherPost])sql.exec("INSERT INTO market_posts(id,brand_id,category,title,description,quantity,unit_price,size,deadline,created_at,review_status) VALUES(?,'preview-account','packaging','공유 제작 의뢰','연락처 없는 제작 조건',500,300,'90 × 40','2099-01-01',?,'approved')",id,new Date().toISOString());
 const submission={tiers:[{quantity:500,unitPrice:260}],note:'합의한 재질로 제작합니다.',agreement:{accepted:true,version:SUBMISSION_AGREEMENT.version,signature:'테스트 서명자'}};
 const proposal=await roomCall(room,'posts/'+post+'/offers',{token:supplier,input:submission});assert.equal(proposal.status,201);
 const offer=proposal.data.id,path='/api/admin/review-room/posts/'+post,offerPath=path+'/offers/'+offer+'/review';
 async function admin(role){
   const id=crypto.randomUUID(),token=randomToken();
   raw.prepare('INSERT INTO admins(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(id,role,role,'!',role,'now');
   raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)').run(await digest(token),id,Date.now()+600000);return token;
 }
 const owner=await admin('owner'),staff=await admin('staff'),environment={...env,APP_KIND:'admin',REVIEW_ROOMS:{idFromName:key=>key,get:key=>({fetch:req=>rooms.get(key).fetch(req)})}};
 async function inspect(target,key,token,input,kind='admin'){
   const origin='https://'+kind+'.example.test',req=new Request(origin+target,{method:input?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json','X-Factner-Review':key,Cookie:'factner_session='+token},body:input?JSON.stringify(input):undefined});
   const res=await worker.fetch(req,{...environment,APP_KIND:kind});return {status:res.status,data:await res.json()};
 }
 const decision={action:'approve',confirmed:true,version:1};
 assert.equal((await inspect(path,roomA,staff)).status,403);
 assert.equal((await inspect(offerPath,roomA,staff,decision)).status,403);
 assert.equal((await inspect(offerPath,roomA,owner,decision,'main')).status,404);
 assert.equal((await inspect(offerPath,roomB,owner,decision)).status,404);
 assert.equal((await inspect('/api/admin/review-room/posts/'+otherPost+'/offers/'+offer+'/review',roomA,owner,decision)).status,404);
 const before=(await roomCall(room,'state',{token:brand})).data;
 assert.equal(before.offers.length,0);assert.equal(before.posts.find(p=>p.id===post).offerCount,0);
 const own=(await roomCall(room,'state',{token:supplier})).data;assert.equal(own.offers[0].reviewStatus,'pending');
 const detail=(await inspect(path,roomA,owner)).data;
 assert.equal(detail.post.brand.email,brandEmail);assert.equal(detail.offers[0].supplier.email,'package1@gmail.com');
 assert.equal(detail.offers[0].supplier.name,'패키지업체 1');assert.equal(detail.agreements[0].signature,'테스트 서명자');assert.equal(detail.agreements[0].document.body,'테스트');
 assert.equal((await inspect(offerPath,roomA,owner,decision)).status,200);
 assert.equal((await inspect(offerPath,roomA,owner,decision)).status,409);
 const published=(await roomCall(room,'state',{token:brand})).data;assert.equal(published.offers[0].id,offer);assert.equal(published.posts.find(p=>p.id===post).offerCount,1);
 assert.doesNotMatch(JSON.stringify(published),/package1@gmail|패키지업체 1|테스트 서명자/);
 assert.equal((await inspect(path,roomA,owner)).data.offers[0].reviewEvents[0].action,'approve');
 assert.equal(raw.prepare('SELECT count(*) n FROM market_offers').get().n,0);assert.equal(raw.prepare('SELECT count(*) n FROM submission_agreements').get().n,0);
});
