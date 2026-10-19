import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {policy,policyApi,readiness} from './policy.js';
import {drainNotifications} from './operations.js';
import {randomToken,totp} from './security.js';
function database() {
 const raw=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(file=>file.endsWith('.sql')).sort())raw.exec(readFileSync(new URL(file,dir),'utf8'));
 return {raw,prepare(sql){return {bind(...args){return {
  async first(){return raw.prepare(sql).get(...args)||null;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};},
 };}};},async batch(statements){raw.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}}};
}
function client(env) {
 let cookie='';const origin=env.APP_KIND==='admin'?'https://admin.factner.com':'https://factner.com',ip=crypto.randomUUID();
 const call=async(path,data,method=data?'POST':'GET')=>{
  const response=await worker.fetch(new Request(`${origin}/api/${path}`,{method,headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip,cookie},body:data?JSON.stringify(data):undefined}),env);
  if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return {status:response.status,data:await response.json()};
 };
 call.env=env;return call;
}
async function administrator(env) {
 const admin=client({...env,APP_KIND:'admin'});
 assert.equal((await admin('auth/setup',{username:'owner',displayName:'테스트 관리자',password:'a-private-test-owner-password',setupToken:env.BOOTSTRAP_TOKEN})).status,200);
 const begin=await admin('auth/mfa/begin',{});assert.equal(begin.status,200);
 assert.equal((await admin('auth/mfa/confirm',{code:await totp(begin.data.secret)})).status,200);
 return admin;
}
const environment=()=>({DB:database(),APP_KIND:'main',BOOTSTRAP_TOKEN:randomToken(),MFA_ENCRYPTION_KEY:randomToken()});
const valid=()=>({id:crypto.randomUUID(),receiptToken:randomToken(),brand:'가상 브랜드',category:'단상자',quantity:500,description:'가상 패키징 견적 테스트',contactName:'테스트 담당',email:'test@example.com',consent:true,termsConsent:true,consentVersion:'draft-2026-10-19',website:'',testOnly:true});
const operator={operator:'가상 운영자',contactEmail:'hello@example.com',accepting:false};
function setOperations(env,value){env.DB.raw.prepare("UPDATE settings SET value=? WHERE key='operations'").run(JSON.stringify(value));}
function addSupplier(env){const time=new Date().toISOString();env.DB.raw.prepare("INSERT INTO suppliers(id,name,state,actual_confirmed,created_at,updated_at) VALUES('test-only-supplier','가상 협력업체','published',1,?,?)").run(time,time);}
test('draft defaults are public, publication requires operator/review, and only owner may edit',async()=>{
 const env=environment(),publicClient=client(env),admin=await administrator(env);
 const draft=await policy(env);assert.equal(draft.published,false);assert.equal(draft.version,'draft-2026-10-19');assert.equal(draft.operator,'');
 const config=await publicClient('config');assert.equal(config.data.mode,'test');assert.equal(config.data.consentVersion,draft.version);
 assert.equal((await publicClient('policy')).data.version,draft.version);
 assert.equal((await admin('admin/policy',{...draft,published:true,reviewed:true},'PUT')).status,400);
 assert.equal((await admin('admin/settings',operator,'PUT')).status,200);
 assert.equal((await admin('admin/policy',{...draft,published:true,reviewed:false},'PUT')).status,400);
 assert.equal((await admin('admin/policy',{...draft,version:'stale',published:false},'PUT')).status,409);
 const req=new Request('https://admin.factner.com/api/admin/policy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
 await assert.rejects(()=>policyApi(req,env,new URL(req.url),{id:'staff',role:'staff'}),error=>error.status===403);
 const published=await admin('admin/policy',{...draft,published:true,reviewed:true},'PUT');assert.equal(published.status,200);assert.equal(published.data.operator,operator.operator);
 assert.equal(published.data.published,true);assert.notEqual(published.data.version,draft.version);
 assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM policy_versions').get().n,1);
 assert.equal((await publicClient('config')).data.mode,'test');
});
test('live intake remains blocked until every readiness dependency is configured',async()=>{
 const env=environment(),admin=await administrator(env);
 assert.equal((await admin('admin/settings',{...operator,accepting:true},'PUT')).status,400);
 await admin('admin/settings',operator,'PUT');
 const draft=await policy(env);await admin('admin/policy',{...draft,published:true,reviewed:true},'PUT');
 addSupplier(env);
 let checks=await readiness(env,operator);assert.equal(checks.filter(item=>!item.ready).length,2);
 env.TURNSTILE_SITE_KEY='test-site-key';env.TURNSTILE_SECRET_KEY='test-secret-key';
 env.NOTIFY_TO='ops@example.com';env.NOTIFY_FROM='ops@factner.com';env.EMAIL={send:async()=>({messageId:'test-id'})};
 setOperations(env,{recipient:env.NOTIFY_TO,enabled:true});
 checks=await readiness(env,operator);assert.ok(checks.every(item=>item.ready));
 // Bindings change on redeployment; reuse the authenticated browser session.
 Object.assign(admin.env,env,{APP_KIND:'admin'});
 assert.equal((await admin('admin/settings',{...operator,accepting:true},'PUT')).status,200);
 assert.equal((await client(env)('config')).data.mode,'live');
 const published=await policy(env);
 assert.equal((await admin('admin/policy',{...published,published:false},'PUT')).status,200);
 assert.equal((await client(env)('config')).data.mode,'test');
 await admin('admin/policy',{...await policy(env),published:true,reviewed:true},'PUT');
 const differentOperator={...operator,operator:'다른 운영자'};
 assert.equal((await readiness(env,differentOperator)).find(item=>item.label.includes('국외')).ready,false);
 env.EMAIL={};assert.equal((await readiness(env,operator)).find(item=>item.label.includes('알림')).ready,false);
 env.EMAIL={send:async()=>({messageId:'test-id'})};env.NOTIFY_FROM='not-an-email';
 assert.equal((await readiness(env,operator)).find(item=>item.label.includes('알림')).ready,false);
 env.NOTIFY_FROM='ops@factner.com';setOperations(env,{recipient:'different@example.com',enabled:true});
 assert.equal((await readiness(env,operator)).find(item=>item.label.includes('알림')).ready,false);
});
test('stale consent is rejected, accepted consent is retained, and unconfigured emails are never sent',async()=>{
 let sends=0;const env=environment();env.EMAIL={send:async()=>{sends++;return {messageId:'should-not-send'};}};
 const publicClient=client(env),admin=await administrator(env),form=valid();
 assert.equal((await publicClient('quotes',{...form,termsConsent:false})).status,409);
 assert.equal((await publicClient('quotes',{...form,consentVersion:'stale-version'})).status,409);
 assert.equal((await publicClient('quotes',{...form,testOnly:false})).status,503);
 assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM quotes').get().n,0);
 assert.equal((await publicClient('quotes',form)).status,201);
 const saved=env.DB.raw.prepare('SELECT consent_version,terms_version,intake_mode FROM quotes WHERE id=?').get(form.id);
 assert.deepEqual({...saved},{consent_version:'draft-2026-10-19',terms_version:'draft-2026-10-19',intake_mode:'test'});
 assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM notification_outbox').get().n,1);
 assert.equal((await drainNotifications(env)).blocked,true);assert.equal(sends,0);
 const draft=await policy(env),updated=await admin('admin/policy',{...draft,privacy:`${draft.privacy}\n가상 수정 확인`,published:false},'PUT');assert.equal(updated.status,200);
 assert.equal((await publicClient('quotes',valid())).status,409);
 assert.equal((await publicClient('quotes',form)).status,200); // A network retry preserves the original accepted consent.
 assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM quotes').get().n,1);
 const config=JSON.stringify({...operator,accepting:true});env.DB.raw.prepare("UPDATE settings SET value=? WHERE key='service'").run(config);
 assert.equal((await publicClient('quotes',{...valid(),consentVersion:updated.data.version,testOnly:false})).status,503);
});
