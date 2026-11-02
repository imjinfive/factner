import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { bidApi } from './bid-auth.js';
import { BidRoom } from './bid-room.js';
import { HttpError } from './http.js';
import { seedReview, reviewPassword } from '../scripts/bid-seed.mjs';

function fixture(t) {
  const raw = new DatabaseSync(':memory:');
  t.after(()=>raw.close());
  for (const file of ['0001_initial.sql','0013_bid_market.sql']) {
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
async function roomCall(room, path, { input, token, origin = 'https://review.example.test' } = {}) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await room.fetch(new Request('https://review.example.test/api/bid/' + path, {
    method: input === undefined ? 'GET' : 'POST', headers, body: JSON.stringify(input)
  }));
  return { status: response.status, data: await response.json() };
}

test('review logins, activity and sessions are independent per room, survive eviction and expire',async t=>{
  const ctx=roomContext(t),one=new BidRoom(ctx,roomSchema),two=new BidRoom(roomContext(t),roomSchema);
  const fields={email:'brand1@gmail.com',password:reviewPassword,role:'brand'};
  assert.equal((await roomCall(one,'login',{input:fields,origin:'https://other.test'})).status,403);
  assert.equal((await roomCall(one,'state')).status,401);assert.equal((await roomCall(one,'events')).status,404);
  const {token}= (await roomCall(one,'login',{input:fields})).data, resumed=new BidRoom(ctx,roomSchema);
  assert.equal((await roomCall(resumed,'state',{token})).data.posts.length,10);
  assert.equal((await roomCall(two,'state',{token})).status,401);
  assert.equal((await roomCall(resumed,'register',{input:registration})).status,404);
  assert.equal((await roomCall(resumed,'demo',{input:{role:'admin'}})).status,404);
  const expiresAt=ctx.storage.getAlarm();assert.ok(Math.abs(expiresAt-Date.now()-7*86400000)<3000);
  ctx.storage.sql.exec('UPDATE review_room SET expires_at=?',Date.now()-1);
  const expired=new BidRoom(ctx,roomSchema);assert.equal((await roomCall(expired,'state',{token})).status,410);
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
