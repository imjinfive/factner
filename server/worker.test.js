import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, {quoteInput} from './worker.js';
import {passwordHash,verifyPassword,randomToken} from './security.js';
function database() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  return {
    prepare(sql){return{bind(...args){return{
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return{results:db.prepare(sql).all(...args)};},
      async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},
    };}};},
    async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},
    raw:db,
  };
}
const valid = ()=>({id:crypto.randomUUID(),receiptToken:randomToken(),brand:'테스트 브랜드',category:'단상자',quantity:500,description:'가상 제품 패키징',contactName:'테스트',email:'qa@example.com',consent:true,testOnly:true});
function client(env) {
  let cookie='';
  return async(path,data,method=data?'POST':'GET',headers={})=>{
    const req=new Request(`https://${env.APP_KIND==='admin'?'admin.':''}factner.com/api/${path}`,{method,headers:{Origin:`https://${env.APP_KIND==='admin'?'admin.':''}factner.com`,'Content-Type':'application/json',cookie,...headers},body:data?JSON.stringify(data):undefined});
    const response=await worker.fetch(req,env);
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return{status:response.status,data:await response.json(),headers:response.headers};
  };
}
test('password hashes have unique salts and reject incorrect passwords',async()=>{
 const a=await passwordHash('a-very-long-password');const b=await passwordHash('a-very-long-password');
 assert.notEqual(a,b);assert.equal(await verifyPassword('a-very-long-password',a),true);assert.equal(await verifyPassword('wrong-password',a),false);
});
test('quote validation rejects malformed email, consent, links, dates and oversized fields',()=>{
 for(const patch of [{email:'bad'},{consent:false},{referenceUrl:'javascript:alert(1)'},{deadline:'2027-02-31'},{quantity:0},{brand:'a'.repeat(61)},{receiptToken:'guess'},{category:'invalid'}])assert.throws(()=>quoteInput({...valid(),...patch}));
 assert.equal(quoteInput(valid()).quantity,500);
});
test('only the provisioned admin can use a shorter existing password; new passwords still require 12 characters',async()=>{
 const DB=database(),env={DB,APP_KIND:'admin',BOOTSTRAP_TOKEN:randomToken()},admin=client(env);
 const existingPassword='older';
 assert.equal((await admin('auth/setup',{username:'admin',password:existingPassword,displayName:'운영자',setupToken:env.BOOTSTRAP_TOKEN})).status,400);
 DB.raw.prepare('INSERT INTO admins(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run('initial-owner','admin','운영자',await passwordHash(existingPassword),'owner',new Date().toISOString());
 assert.equal((await admin('auth/login',{username:'other',password:existingPassword})).status,400);
 assert.equal((await admin('auth/login',{username:'admin',password:'four'})).status,400);
 assert.equal((await admin('auth/login',{username:'admin',password:'incorrect'})).status,401);
 assert.equal((await admin('auth/login',{username:'admin',password:existingPassword})).status,200);
 assert.equal((await admin('admin/quotes')).status,200);
 assert.equal((await admin('admin/users',{username:'staff',password:existingPassword,displayName:'담당자'})).status,400);
 assert.equal((await admin('auth/password',{currentPassword:existingPassword,newPassword:'short'})).status,400);
 assert.equal((await admin('auth/password',{currentPassword:existingPassword,newPassword:'replacement-password-123'})).status,200);
 assert.equal((await admin('admin/quotes')).status,401);
 assert.equal((await admin('auth/login',{username:'admin',password:existingPassword})).status,401);
 assert.equal((await admin('auth/login',{username:'admin',password:'replacement-password-123'})).status,200);
});
test('end-to-end: receipt isolation, admin authentication, updates, conflict, roles and revoked sessions',async()=>{
 const DB=database();const common={DB,BOOTSTRAP_TOKEN:randomToken()};
 const publicClient=client({...common,APP_KIND:'main'});const admin=client({...common,APP_KIND:'admin'});
 assert.equal((await admin('admin/quotes')).status,401);
 assert.equal((await publicClient('admin/quotes')).status,404);
 const setup={username:'owner',password:'long-owner-password-123',displayName:'운영자',setupToken:common.BOOTSTRAP_TOKEN};
 assert.equal((await admin('auth/setup',{...setup,setupToken:'bad'})).status,403);
 assert.equal((await admin('auth/setup',setup)).status,200);
 assert.equal((await admin('auth/setup',setup)).status,409);
 const form=valid();
 assert.equal((await publicClient('quotes',{...form,testOnly:false})).status,503);
 assert.equal((await publicClient('quotes',form)).status,201);
 assert.equal((await publicClient('quotes',form)).status,200);
 assert.equal((await publicClient(`quotes/${form.id}`,null,'GET',{Authorization:`Bearer ${randomToken()}`})).status,404);
 assert.equal((await publicClient(`quotes/${form.id}`,null,'GET',{Authorization:`Bearer ${form.receiptToken}`})).status,200);
 const list=await admin('admin/quotes');assert.equal(list.data.total,1);assert.equal('receipt_hash' in list.data.quotes[0],false);
 const detail=await admin(`admin/quotes/${form.id}`);assert.equal(detail.data.quote.email,form.email);assert.equal('receipt_hash' in detail.data.quote,false);
 const update={status:'consulting',internalNote:'고객에게 비공개',customerMessage:'샘플을 확인하고 있습니다.',assignee:'운영자',version:1};
 assert.equal((await admin(`admin/quotes/${form.id}`,update,'PATCH')).status,200);
 assert.equal((await admin(`admin/quotes/${form.id}`,update,'PATCH')).status,409);
 const receipt=await publicClient(`quotes/${form.id}`,null,'GET',{Authorization:`Bearer ${form.receiptToken}`});
 assert.equal(receipt.data.status,'consulting');assert.equal('internal_note' in receipt.data,false);assert.equal('email' in receipt.data,false);
 const again=await admin(`admin/quotes/${form.id}`);assert.equal(again.data.events.length,2);
 assert.equal((await admin('admin/users',{username:'staff',password:'long-staff-password-123',displayName:'담당자'})).status,201);
 const staff=client({...common,APP_KIND:'admin'});assert.equal((await staff('auth/login',{username:'staff',password:'long-staff-password-123'})).status,200);
 assert.equal((await staff('admin/quotes')).status,200);assert.equal((await staff('admin/users')).status,403);
 const users=await admin('admin/users');const staffId=users.data.users.find(u=>u.username==='staff').id;
 assert.equal((await admin(`admin/users/${staffId}`,{active:false},'PATCH')).status,200);
 assert.equal((await staff('admin/quotes')).status,401);
 assert.equal((await admin('auth/password',{currentPassword:setup.password,newPassword:'changed-owner-password-123'})).status,200);
 assert.equal((await admin('admin/quotes')).status,401);
 assert.equal((await admin('auth/login',{username:'owner',password:setup.password})).status,401);
 assert.equal((await admin('auth/login',{username:'owner',password:'changed-owner-password-123'})).status,200);
 assert.equal((await admin('admin/settings',{accepting:true,operator:'',contactEmail:''},'PUT')).status,400);
});
test('reject cross-origin writes, non-JSON input and unbounded bodies',async()=>{
 const env={DB:database(),APP_KIND:'main'};
 const request=(headers,body)=>worker.fetch(new Request('https://factner.com/api/quotes',{method:'POST',headers,body}),env);
 assert.equal((await request({Origin:'https://evil.example','Content-Type':'application/json'},'{}')).status,403);
 assert.equal((await request({Origin:'https://factner.com','Content-Type':'text/plain'},'{}')).status,415);
 assert.equal((await request({Origin:'https://factner.com','Content-Type':'application/json'},'x'.repeat(21000))).status,413);
});
test('production never enables the local admin bridge; scheduled retention deletes expired quotes and events',async()=>{
 const DB=database(),env={DB,APP_KIND:'main'},publicClient=client(env);
 assert.equal((await worker.fetch(new Request('https://factner.com/_local-admin/api/auth/state'),{...env,ASSETS:{fetch:()=>new Response('not an API',{status:404})}})).status,404);
 const form=valid();assert.equal((await publicClient('quotes',form)).status,201);
 DB.raw.prepare('UPDATE quotes SET created_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',form.id);
 await worker.scheduled({},env);
 assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM quotes').get().n,0);
 assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM quote_events').get().n,0);
});
