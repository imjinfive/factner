import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { bidApi } from './bid-auth.js';
import { BidRoom } from './bid-room.js';
import { HttpError } from './http.js';
import { insertReviewFixtures,seedReview,reviewPassword } from '../scripts/bid-seed.mjs';
import worker from './worker.js';
import {digest,randomToken} from './security.js';

function fixture(t) {
  const raw = new DatabaseSync(':memory:');
  t.after(()=>raw.close());
  for (const file of ['0001_initial.sql','0002_admin_security.sql','0013_bid_market.sql','0015_market_post_review.sql']) {
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
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM market_accounts').get().n,14);
  assert.equal((await call('state')).status,401);
  assert.equal((await call('register',{input:registration})).status,404);
  assert.equal((await call('demo',{input:{role:'admin'}})).status,404);
  assert.equal((await call('login',{input:registration})).status,401);
  for(const [key,role] of [['brand1','brand'],['package1','packaging'],['design1','design'],['design2','design'],['packagedesign1','packaging']]){
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
async function roomCall(room, path, { input, token, origin = 'https://review.example.test' } = {}) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await room.fetch(new Request('https://review.example.test/api/bid/' + path, {
    method: input === undefined ? 'GET' : 'POST', headers, body: JSON.stringify(input)
  }));
  return { status: response.status, data: await response.json() };
}

test('a preview login never initializes an unknown or expired room',async t=>{
  const ctx=roomContext(t),room=new BidRoom(ctx,roomSchema,reviewSchema);
  const input={email:'test-'+'a'.repeat(24)+'@preview.factner.invalid',password:'a-generated-password-for-preview'};
  assert.equal((await roomCall(room,'preview-login',{input})).status,401);
  assert.equal(ctx.storage.getAlarm(),null);
  assert.equal(ctx.storage.sql.exec('SELECT count(*) n FROM sqlite_master').one().n,0);
  assert.equal((await roomCall(room,'preview-register',{input:{...input,kind:'packaging',legalType:'corporate'}})).status,201);
  const expiry=ctx.storage.getAlarm();assert.ok(expiry>Date.now());
  const resumed=new BidRoom(ctx,roomSchema,reviewSchema);
  assert.equal((await roomCall(resumed,'preview-login',{input})).status,200);
  ctx.storage.sql.exec('UPDATE review_room SET expires_at=?',Date.now()-1);
  assert.equal((await roomCall(new BidRoom(ctx,roomSchema,reviewSchema),'preview-login',{input})).status,410);
  await room.alarm();assert.equal((await roomCall(room,'preview-login',{input})).status,401);
  assert.equal(ctx.storage.getAlarm(),null);
});

test('review logins, activity and sessions are independent per room, survive eviction and expire',async t=>{
  const ctx=roomContext(t),one=new BidRoom(ctx,roomSchema,reviewSchema),two=new BidRoom(roomContext(t),roomSchema,reviewSchema);
  const fields={email:'brand1@gmail.com',password:reviewPassword,role:'brand'};
  assert.equal((await roomCall(one,'login',{input:fields,origin:'https://other.test'})).status,403);
  assert.equal((await roomCall(one,'state')).status,401);assert.equal((await roomCall(one,'events')).status,404);
  const {token}= (await roomCall(one,'login',{input:fields})).data, resumed=new BidRoom(ctx,roomSchema,reviewSchema);
  assert.equal((await roomCall(resumed,'state',{token})).data.posts.length,10);
  assert.equal((await roomCall(two,'state',{token})).status,401);
  assert.equal((await roomCall(resumed,'register',{input:registration})).status,404);
  assert.equal((await roomCall(resumed,'demo',{input:{role:'admin'}})).status,404);
  const expiresAt=ctx.storage.getAlarm();assert.ok(Math.abs(expiresAt-Date.now()-7*86400000)<3000);
  ctx.storage.sql.exec('UPDATE review_room SET expires_at=?',Date.now()-1);
  const expired=new BidRoom(ctx,roomSchema,reviewSchema);assert.equal((await roomCall(expired,'state',{token})).status,410);
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

test('existing rooms approve only unchanged original fixtures, keep private submissions private, and preserve their existing contract',async t=>{
 const ctx=roomContext(t),sql=ctx.storage.sql,at=Date.now(),lifetime=7*86400000;
 sql.exec(roomSchema);
 sql.exec('CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL); CREATE TABLE review_room(id INTEGER PRIMARY KEY,expires_at INTEGER NOT NULL);');
 sql.exec('INSERT INTO review_room VALUES(1,?)',at+lifetime);
 // The old release seeded these same briefs without the new review column.
 insertReviewFixtures(query=>(...args)=>sql.exec(query.replace(',review_status)',')').replace(",'approved')",')'),...args),at);
 const old=sql.exec("SELECT * FROM market_posts WHERE brand_id='seed-brand1'").one();
 const clone=crypto.randomUUID(),leak=crypto.randomUUID(),offer=crypto.randomUUID(),deal=crypto.randomUUID();
 sql.exec('INSERT INTO market_posts SELECT ?,brand_id,category,title,quantity,unit_price,size,description,deadline,? FROM market_posts WHERE id=?',clone,new Date(at).toISOString(),old.id);
 sql.exec("INSERT INTO market_posts VALUES(?,'seed-brand1','packaging','등록자 보관 제목',400,200,'이전 규격','외부 비공개 설명','2099-01-01',?)",leak,new Date(at).toISOString());
 sql.exec("INSERT INTO market_offers VALUES(?,?,'seed-package1','제안사 A','[]','비고',?)",offer,leak,new Date(at).toISOString());
 sql.exec("INSERT INTO market_contracts(id,post_id,offer_id,quantity,unit_price,version,terms_json,brand_signature,brand_signed_at) VALUES(?,?,?,400,200,'v','{}','서명',?)",deal,leak,offer,new Date(at).toISOString());
 const room=new BidRoom(ctx,roomSchema,reviewSchema);
 async function login(email){return (await roomCall(room,'login',{input:{email,password:reviewPassword}})).data.token;}
 const supplier=await login('package1@gmail.com'),brand=await login('brand1@gmail.com'),other=await login('brand2@gmail.com');
 const own=(await roomCall(room,'state',{token:brand})).data;
 assert.equal(own.posts.filter(p=>p.reviewStatus==='approved').length,10);
 assert.equal(own.posts.find(p=>p.id===clone).reviewStatus,'pending');assert.equal(own.posts.find(p=>p.id===leak).reviewStatus,'pending');
 for(const token of [supplier,other]){
   const state=(await roomCall(room,'state',{token})).data;
   assert.doesNotMatch(JSON.stringify(state),/등록자 보관 제목|외부 비공개 설명/);
   assert.ok(state.posts.every(p=>p.reviewStatus==='approved'));assert.ok(state.offers.every(o=>o.id!==offer));
   if(token===supplier){assert.equal(state.contracts[0].id,deal);assert.equal(state.contracts[0].title,'비공개 공고');}
 }
 const job={category:'packaging',title:'새 종이 포장',quantity:10,unitPrice:2,size:'작은 종이',description:'두 가지 색',deadline:'2099-01-01'};
 const fresh=await roomCall(room,'posts',{token:brand,input:job});assert.equal(fresh.data.reviewStatus,'pending');
 assert.equal((await roomCall(room,'posts/'+fresh.data.id+'/offers',{token:supplier,input:{tiers:[{quantity:10,unitPrice:2}]}})).status,404);
 assert.equal((await roomCall(room,'posts/'+fresh.data.id+'/withdraw',{token:other,input:{version:1,confirmed:true}})).status,404);
 assert.equal((await roomCall(room,'posts/'+fresh.data.id+'/withdraw',{token:brand,input:{version:1,confirmed:true}})).data.reviewStatus,'withdrawn');
 const resumed=new BidRoom(ctx,roomSchema,reviewSchema);
 assert.equal((await roomCall(resumed,'state',{token:brand})).data.posts.find(p=>p.id===fresh.data.id).reviewStatus,'withdrawn');
 assert.equal(sql.exec('SELECT count(*) n FROM market_contracts').one().n,1);
});

test('only an actual owner can review a specifically shared post inside its original room',async t=>{
 const {raw,env}=fixture(t),roomA='a'.repeat(64),roomB='b'.repeat(64),missing='c'.repeat(64);
 const rooms=new Map(),contexts=new Map(),forwarded=[];
 for(const key of [roomA,roomB,missing]){
   const ctx=roomContext(t);contexts.set(key,ctx);rooms.set(key,new BidRoom(ctx,roomSchema,reviewSchema));
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
 const a=await signIn(roomA,'brand1@gmail.com'),s=await signIn(roomA,'package1@gmail.com'),other=await signIn(roomB,'package1@gmail.com');
 const post=(await roomCall(rooms.get(roomA),'posts',{token:a,input:{category:'packaging',title:'공유 시안',description:'원목색 종이',quantity:150,unitPrice:220,size:'90 × 40',deadline:'2099-01-01'}})).data.id;
 assert.ok(post);
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
 assert.ok(!Object.hasOwn(scoped.data.post,'email'));assert.equal((await roomCall(rooms.get(roomA),'internal/post-review/'+post,{token:a,input:approval})).status,404);
 assert.equal((await roomCall(rooms.get(roomA),'state',{token:s})).data.posts.some(p=>p.id===post),false);
 assert.equal((await check(roomA,owner.token,approval)).data.reviewStatus,'approved');
 assert.equal((await check(roomA,owner.token,approval)).status,409);
 assert.equal((await roomCall(rooms.get(roomA),'state',{token:s})).data.posts.some(p=>p.id===post),true);
 assert.equal((await roomCall(rooms.get(roomB),'state',{token:other})).data.posts.some(p=>p.id===post),false);
 assert.equal(forwarded.every(r=>r.cookie===null&&r.bearer===null&&r.key===null&&r.actor===owner.id&&r.url==='https://factner-review.internal/internal/post-review/'+post),true);
 assert.equal(raw.prepare('SELECT count(*) n FROM market_posts').get().n,0);assert.equal(raw.prepare('SELECT count(*) n FROM market_post_reviews').get().n,0);
});
