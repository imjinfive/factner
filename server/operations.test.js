import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {cleanOperations,drainNotifications,notificationReadiness,operationsApi,quoteNotificationStatement,recordFailure} from './operations.js';

function database() {
  const raw=new DatabaseSync(':memory:');
  for(const file of ['0001_initial.sql','0004_operations.sql']) raw.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  return {raw,prepare(sql){return{bind(...args){return{
    first:async()=>raw.prepare(sql).get(...args)||null,
    all:async()=>({results:raw.prepare(sql).all(...args)}),
    run:async()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}),
    sync:()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}),
  };}};},async batch(statements){raw.exec('BEGIN');try{const rows=statements.map(statement=>statement.sync());raw.exec('COMMIT');return rows;}catch(cause){raw.exec('ROLLBACK');throw cause;}}};
}
function ready(env) {
  env.NOTIFY_TO='ops@example.com';env.NOTIFY_FROM='notifications@factner.com';
  env.DB.raw.prepare("UPDATE settings SET value=? WHERE key='operations'").run(JSON.stringify({recipient:env.NOTIFY_TO,enabled:true}));
  return env;
}
function quoteStatement(env,id,date=new Date().toISOString()) {
  return env.DB.prepare(`INSERT INTO quotes(id,receipt_hash,brand,category,quantity,description,contact_name,email,consent_version,created_at,updated_at)
    VALUES(?,?,'PRIVATE BRAND','단상자',500,'PRIVATE DESCRIPTION','PRIVATE CONTACT','private@example.com','test',?,?)`).bind(id,'PRIVATE RECEIPT',date,date);
}
async function quote(env,date=new Date().toISOString()) {
  const id=crypto.randomUUID();await env.DB.batch([quoteStatement(env,id,date),quoteNotificationStatement(env,id,date)]);return id;
}
const owner={id:'owner',role:'owner'};
async function api(env,path='',data,method=data?'POST':'GET',user=owner) {
  const url=new URL(`https://admin.factner.com/api/admin/operations${path}`);
  const response=await operationsApi(new Request(url,{method,headers:{Origin:url.origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}),env,url,user);
  return {status:response.status,data:await response.json()};
}

test('quote and notification commit together; unconfigured delivery leaves a durable pending record',async t=>{
  const DB=database();t.after(()=>DB.raw.close());let calls=0;
  const env={DB,EMAIL:{send:async()=>{calls++;return{messageId:'not-expected'};}}};
  const id=await quote(env);
  assert.equal(DB.raw.prepare('SELECT quote_id FROM notification_outbox').get().quote_id,id);
  assert.equal((await drainNotifications(env)).blocked,true);assert.equal(calls,0);
  assert.equal(DB.raw.prepare('SELECT attempts FROM notification_outbox').get().attempts,0);
  const badId=crypto.randomUUID();
  DB.raw.prepare("INSERT INTO notification_outbox(id,event_key,kind,created_at) VALUES(?,?,'test',?)").run(crypto.randomUUID(),`quote:${badId}`,new Date().toISOString());
  await assert.rejects(env.DB.batch([quoteStatement(env,badId),quoteNotificationStatement(env,badId,new Date().toISOString())]));
  assert.equal(DB.raw.prepare('SELECT id FROM quotes WHERE id=?').get(badId),undefined);
  assert.equal((await api(env,'/test',{})).status,409);
  assert.equal((await api(env,'',undefined,'GET',{role:'staff'})).status,403);
  assert.equal((await api(env,'',{recipient:'ops@example.com',enabled:true},'PUT')).status,400);
  assert.equal((await api(env,'',{recipient:'ops@example.com',enabled:false},'PUT')).status,200);
  assert.equal((await api(env)).data.readiness.ready,false);
});

test('atomic claims prevent concurrent duplicate sends and emails omit all customer details',async t=>{
  const DB=database();t.after(()=>DB.raw.close());const sent=[];
  const env=ready({DB,EMAIL:{send:async message=>{sent.push(message);await new Promise(resolve=>setTimeout(resolve,1));return {messageId:`mail-${sent.length}`};}}});
  for(let i=0;i<12;i++)await quote(env);
  await Promise.all([drainNotifications(env),drainNotifications(env)]);
  assert.equal(sent.length,12);
  assert.equal(new Set(sent.map(row=>row.text)).size,12);
  const payload=JSON.stringify(sent);
  assert.equal(payload.includes('PRIVATE'),false);assert.equal(payload.includes('private@example.com'),false);
  assert.equal(DB.raw.prepare("SELECT count(*) AS n FROM notification_outbox WHERE status='sent'").get().n,12);
  assert.ok((await api(env)).data.lastSentAt);
  assert.equal(notificationReadiness({...env,NOTIFY_TO:'other@example.com'},{recipient:env.NOTIFY_TO,enabled:true}).ready,false);
  assert.equal(notificationReadiness({...env,NOTIFY_FROM:'bad@example.com'},{recipient:env.NOTIFY_TO,enabled:true}).ready,false);
});

test('delivery failures back off, stop after eight attempts, and retry only with a verified setup',async t=>{
  const DB=database();t.after(()=>DB.raw.close());let calls=0;
  const env=ready({DB,EMAIL:{send:async()=>{calls++;throw Object.assign(new Error('PRIVATE TOKEN private@example.com'),{code:'E_RATE_LIMIT_EXCEEDED'});}}});
  await quote(env);
  assert.equal((await drainNotifications(env)).failed,1);
  let row=DB.raw.prepare('SELECT * FROM notification_outbox').get();
  assert.equal(row.status,'pending');assert.ok(row.next_attempt_at>Date.now());
  await drainNotifications(env);assert.equal(calls,1);
  for(let i=1;i<8;i++){DB.raw.prepare('UPDATE notification_outbox SET next_attempt_at=0').run();await drainNotifications(env);}
  row=DB.raw.prepare('SELECT * FROM notification_outbox').get();assert.equal(row.status,'failed');assert.equal(row.attempts,8);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM notification_outbox').get().n,1);
  assert.equal(JSON.stringify((await api(env)).data).includes('PRIVATE TOKEN'),false);
  assert.equal((await api(env,`/notifications/${row.id}/retry`,{})).status,202);
  env.EMAIL.send=async()=>({messageId:'accepted'});await drainNotifications(env);
  assert.equal(DB.raw.prepare('SELECT status FROM notification_outbox').get().status,'sent');
  assert.equal((await api(env,`/notifications/${row.id}/retry`,{})).status,409);
});

test('interrupted processing recovers and missing provider acknowledgment is not reported as sent',async t=>{
  const DB=database();t.after(()=>DB.raw.close());
  const env=ready({DB,EMAIL:{send:async()=>undefined}});
  await quote(env);
  DB.raw.prepare("UPDATE notification_outbox SET status='processing',attempts=1,lease_until=1,claim_token='abandoned'").run();
  await drainNotifications(env);
  let row=DB.raw.prepare('SELECT * FROM notification_outbox').get();assert.equal(row.status,'pending');assert.equal(row.attempts,2);assert.equal(row.last_error,'DELIVERY_UNCONFIRMED');
  DB.raw.prepare("UPDATE notification_outbox SET status='processing',attempts=8,lease_until=1,claim_token='abandoned'").run();
  await drainNotifications(env);
  row=DB.raw.prepare('SELECT * FROM notification_outbox').get();assert.equal(row.status,'failed');assert.equal(row.last_error,'PROCESSING_INTERRUPTED');
});

test('operational errors deduplicate, redact arbitrary content and expire without touching current quotes',async t=>{
  const DB=database();t.after(()=>DB.raw.close());const env={DB};
  await recordFailure(env,'REQUEST_FAILED','main-api');await recordFailure(env,'REQUEST_FAILED','main-api');
  assert.equal(DB.raw.prepare('SELECT occurrences FROM operational_incidents').get().occurrences,2);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM notification_outbox').get().n,1);
  await recordFailure(env,'private@example.com token=secret','/api/quotes?secret=receipt');
  assert.equal(JSON.stringify(DB.raw.prepare('SELECT * FROM operational_incidents').all()).includes('secret'),false);
  const current=await quote(env);
  DB.raw.prepare("UPDATE operational_incidents SET last_at='2020-01-01T00:00:00.000Z'").run();
  await cleanOperations(env);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM operational_incidents').get().n,0);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM notification_outbox').get().n,1);
  assert.equal(DB.raw.prepare('SELECT id FROM quotes').get().id,current);
});
