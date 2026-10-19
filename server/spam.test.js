import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {verifyQuoteSubmission} from './spam.js';
function database() {
 const raw=new DatabaseSync(':memory:');raw.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 return {raw,prepare(sql){return {bind(...args){return {async first(){return raw.prepare(sql).get(...args)||null;}};}};}};
}
const input=patch=>({id:crypto.randomUUID(),email:'test@example.com',website:'',turnstileToken:'test-captcha-token',...patch});
const request=new Request('https://factner.com/api/quotes',{headers:{'CF-Connecting-IP':'192.0.2.1'}});
const environment=()=>({DB:database(),TURNSTILE_SITE_KEY:'site-key',TURNSTILE_SECRET_KEY:'secret-key'});
const rejected=(action,status)=>assert.rejects(action,error=>error.status===status);
test('test intake can run without captcha, live cannot, and honeypots are rejected',async()=>{
 const env={DB:database()};
 await verifyQuoteSubmission(request,env,input(),{accepting:false});
 await rejected(()=>verifyQuoteSubmission(request,env,input(),{accepting:true}),503);
 await rejected(()=>verifyQuoteSubmission(request,env,input({website:'https://spam.example'}),{accepting:false}),400);
});
test('siteverify rejects missing tokens, hostname/action forgery, replay and unavailable responses',async(t)=>{
 const env=environment();let calls=0,lastBody;
 let response={success:true,hostname:'factner.com',action:'quote'};
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');lastBody=JSON.parse(options.body);return Response.json(response);});
 for(const turnstileToken of ['',null,'x'.repeat(2049)])await rejected(()=>verifyQuoteSubmission(request,env,input({turnstileToken}),{accepting:true}),400);
 assert.equal(calls,0);
 const accepted=input();await verifyQuoteSubmission(request,env,accepted,{accepting:true});assert.equal(calls,1);
 assert.deepEqual(lastBody,{secret:'secret-key',response:accepted.turnstileToken,remoteip:'192.0.2.1',idempotency_key:accepted.id});
 for(const bad of [{success:false,'error-codes':['timeout-or-duplicate']},{success:true,hostname:'attacker.example',action:'quote'},{success:true,hostname:'factner.com',action:'login'},{success:'true',hostname:'factner.com',action:'quote'}]){
  response=bad;await rejected(()=>verifyQuoteSubmission(request,env,input(),{accepting:true}),typeof bad.success==='boolean'?400:503);
 }
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('network down');});
 await rejected(()=>verifyQuoteSubmission(request,env,input(),{accepting:true}),503);
});
test('provider HTTP errors and malformed bodies fail closed as unavailable',async(t)=>{
 const env=environment();
 t.mock.method(globalThis,'fetch',async()=>Response.json({success:true,hostname:'factner.com',action:'quote'},{status:503}));
 await rejected(()=>verifyQuoteSubmission(request,env,input(),{accepting:true}),503);
 t.mock.method(globalThis,'fetch',async()=>Response.json(null));
 await rejected(()=>verifyQuoteSubmission(request,env,input(),{accepting:true}),503);
});
test('the per-email cap normalizes case and surrounding whitespace across source IPs',async()=>{
 const env={DB:database()};
 for(let index=0;index<10;index++)await verifyQuoteSubmission(request,env,input({email:'TEST@EXAMPLE.COM'}),{accepting:false});
 const another=new Request('https://factner.com/api/quotes',{headers:{'CF-Connecting-IP':'192.0.2.2'}});
 await rejected(()=>verifyQuoteSubmission(another,env,input({email:' test@example.com '}),{accepting:false}),429);
});
