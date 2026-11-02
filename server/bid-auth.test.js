import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { bidApi } from './bid-auth.js';
import { BidRoom } from './bid-room.js';
import { digest } from './security.js';
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
  assert.equal((await call('session',{host:'localhost',environment:env})).data.demo,true);
});

test('four member kinds can register and sign in while admin grants, duplicates and expired sessions are rejected',async t=>{
  const {call,raw}=fixture(t);
  for(const kind of ['brand','design','packaging','both']){
    const fields={...registration,kind,email:kind+'@example.test'};
    const created=await call('register',{input:fields});
    assert.equal(created.status,200);
    assert.equal(created.data.user.kind,kind);
    assert.match(created.data.token,/^[a-f0-9]{64}$/);
    assert.equal(created.data.user.password_hash,undefined);
    const stored=raw.prepare('SELECT password_hash FROM market_accounts WHERE email=?').get(fields.email);
    assert.notEqual(stored.password_hash,fields.password);
    assert.equal(raw.prepare('SELECT account_id FROM market_sessions WHERE token_hash=?').get(await digest(created.data.token)).account_id,created.data.user.id);
    assert.equal((await call('register',{input:{...fields,email:fields.email.toUpperCase()}})).status,409);
    assert.equal((await call('login',{input:{...fields,password:'incorrect-password'}})).status,401);
    const login=await call('login',{input:{...fields,email:fields.email.toUpperCase(),kind:'admin'}});
    assert.equal(login.status,200);
    assert.equal(login.data.user.kind,kind);
    assert.notEqual(login.data.token,created.data.token);
    assert.deepEqual((await call('session',{token:login.data.token})).data.user,created.data.user);
    assert.equal((await call('logout',{token:login.data.token,input:{}})).status,200);
    assert.equal((await call('session',{token:login.data.token})).data.user,null);
    assert.equal((await call('posts',{token:login.data.token,input:{}})).status,401);
    raw.prepare('UPDATE market_sessions SET expires_at=0 WHERE token_hash=?').run(await digest(created.data.token));
    assert.equal((await call('session',{token:created.data.token})).data.user,null);
  }
  assert.equal((await call('register',{input:{...registration,email:'admin@example.test',kind:'admin'}})).status,400);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM market_accounts').get().n,4);
  assert.equal((await call('demo',{input:{email:'brand@example.test'}})).status,404);
});

test('review fixtures contain 14 fictional accounts and ten distinct open briefs and separate the local admin session',async t=>{
  const {call,raw,env}=fixture(t);
  await seedReview(raw);
  await seedReview(raw);
  const selection=(await call('session')).data;
  assert.equal(selection.user,null);
  assert.equal(selection.accounts.length,14);
  const tally=Object.fromEntries(['brand','design','packaging','both'].map(kind=>[kind,selection.accounts.filter(a=>a.kind===kind).length]));
  assert.deepEqual(tally,{brand:10,design:2,packaging:1,both:1});
  assert.ok(selection.accounts.every(a=>a.id.startsWith('seed-') && !('password_hash' in a)));
  const board=(await call('state')).data;
  assert.equal(board.posts.length,10);
  assert.equal(new Set(board.posts.map(p=>p.title)).size,10);
  assert.ok(board.posts.every(p=>p.status==='open' && !p.isMine));
  assert.deepEqual(board.offers,[]);
  assert.equal(raw.prepare('SELECT COUNT(DISTINCT brand_id) n FROM market_posts').get().n,10);
  assert.ok(board.posts.some(p=>p.offerCount>1));
  const seed=selection.accounts.find(x=>x.kind==='design');
  const passwordLogin=await call('login',{input:{email:seed.email,password:reviewPassword}});
  assert.equal(passwordLogin.data.user.kind,'design');
  const quick=await call('demo',{input:{email:seed.email,kind:'admin'}});
  assert.equal(quick.data.user.id,seed.id);
  assert.equal(quick.data.user.kind,'design');
  const admin=await call('demo',{input:{role:'admin'}});
  assert.equal(admin.data.user.kind,'admin');
  assert.ok(env.previewAdminSessions.has(await digest(admin.data.token)));
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM market_sessions WHERE token_hash=?').get(await digest(admin.data.token)).n,0);
  assert.equal((await call('session',{token:admin.data.token})).data.user.kind,'admin');
  await call('logout',{token:admin.data.token,input:{}});
  assert.equal((await call('session',{token:admin.data.token})).data.user,null);
  assert.equal(env.previewAdminSessions.size,0);
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

test('hosted room state, registrations and admin tokens stay isolated and survive eviction', async t => {
  const ctx = roomContext(t);
  const room = new BidRoom(ctx, roomSchema), otherRoom = new BidRoom(roomContext(t), roomSchema);
  const state = await roomCall(room, 'state');
  assert.equal(state.status, 200);
  assert.equal(state.data.posts.length, 10);
  const expiresAt = ctx.storage.getAlarm();
  assert.ok(Math.abs(expiresAt - Date.now() - 7 * 86400000) < 3000);
  assert.equal((await roomCall(room, 'demo', { input: { role: 'admin' }, origin: 'https://other.test' })).status, 403);
  assert.equal((await roomCall(room, 'events')).status, 404);
  const admin = (await roomCall(room, 'demo', { input: { role: 'admin' } })).data;
  const account = (await roomCall(room, 'register', { input: registration })).data;
  const persisted = new BidRoom(ctx, roomSchema);
  const session = (await roomCall(persisted, 'session', { token: admin.token })).data;
  assert.equal(session.hosted, true);
  assert.equal(session.user.kind, 'admin');
  assert.equal(session.accounts.length, 14);
  assert.equal((await roomCall(persisted, 'session', { token: account.token })).data.user.id, account.user.id);
  assert.deepEqual((await roomCall(persisted, 'state')).data.posts, state.data.posts);
  assert.equal(ctx.storage.getAlarm(), expiresAt);
  assert.equal((await roomCall(otherRoom, 'session', { token: admin.token })).data.user, null);
  assert.equal((await roomCall(otherRoom, 'session', { token: account.token })).data.user, null);
  assert.equal((await roomCall(otherRoom, 'login', { input: registration })).status, 401);
  assert.equal((await roomCall(persisted, 'logout', { input: {}, token: admin.token })).status, 200);
  assert.equal((await roomCall(room, 'session', { token: admin.token })).data.user, null);
  ctx.storage.sql.exec('UPDATE review_room SET expires_at=?', Date.now() - 1);
  const expired = new BidRoom(ctx, roomSchema);
  assert.equal((await roomCall(expired, 'state')).status, 410);
  await expired.alarm();
  assert.equal(ctx.storage.getAlarm(), null);
  assert.equal(ctx.storage.sql.exec("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").one().n, 0);
});

test('public Worker flags and request-supplied room markers cannot open a bid database', async () => {
  const url = new URL('https://factner.com/api/bid/session?hosted=true');
  const req = new Request(url, { headers: { 'X-Bid-Room': '1' } });
  await assert.rejects(() => bidApi(req, {
    BID_DEMO: '1', hosted: true, isIsolatedReview: true, roomDatabase: {}, get DB() { throw new Error('Production DB was accessed'); }
  }, url), error => error instanceof HttpError && error.status === 503);
});
