import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {digest,randomToken} from './security.js';

function database(){
 const raw=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())raw.exec(readFileSync(new URL(name,dir),'utf8'));
 return {raw,prepare(sql){return {bind(...values){const args=values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return {async first(){return raw.prepare(sql).get(...args)||null;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}};}};},async batch(items){raw.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}}};
}
function client(env,ip='recovery-test'){
 let cookie='';const host=env.APP_KIND==='admin'?'https://admin.example.test':'https://example.test';
 return async(path,data,method=data?'POST':'GET',headers={})=>{
  const response=await worker.fetch(new Request(`${host}/api/${path}`,{method,headers:{Origin:host,'Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':ip,...headers},body:data?JSON.stringify(data):undefined}),env);
  if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];
  return {status:response.status,data:await response.json(),headers:response.headers};
 };
}
const adminPassword='test-admin-password-1234',password='Abcd1234';
const identity={name:'복구 테스트 업체',contact:'김담당',phone:'010-1234-5678'};
const signup=email=>({email,password,role:'brand',legalType:'individual',...identity,files:[],consent:true,testOnly:true,consentVersion:'member-pilot-2026-10-21'});
async function fixture(){
 const DB=database(),common={DB,BOOTSTRAP_TOKEN:randomToken()},admin=client({...common,APP_KIND:'admin'}),member=client({...common,APP_KIND:'main'});
 assert.equal((await admin('auth/setup',{username:'owner',password:adminPassword,displayName:'테스트 운영자',setupToken:common.BOOTSTRAP_TOKEN})).status,200);
 return {DB,common,admin,member};
}
async function register(f,email='recovery@test.test',status='approved'){
 assert.equal((await f.member('member/register',signup(email))).status,201);
 let member=f.DB.raw.prepare('SELECT * FROM members WHERE email=?').get(email);
 if(status!=='pending'){
  assert.equal((await f.admin(`admin/members/${member.id}`,{status,version:member.version,note:'테스트 상태'},'PATCH')).status,200);
  member=f.DB.raw.prepare('SELECT * FROM members WHERE id=?').get(member.id);
 }
 return member;
}
async function issue(f,member){
 const response=await f.admin(`admin/members/${member.id}/recovery-code`,{verified:true,version:member.version});
 assert.equal(response.status,200);assert.match(response.data.code,/^[a-f0-9]{24}$/);return response.data.code;
}
const reset=(member,code,newPassword='Newpass8')=>({email:member.email,code,newPassword});

test('member registration, login and password changes accept eight characters and reject seven',async()=>{
 const f=await fixture();
 assert.equal((await f.member('member/register',{...signup('short@test.test'),password:'Abcd123'})).status,400);
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM members').get().n,0);
 const member=await register(f);
 assert.equal((await f.member('member/login',{email:member.email,password:'Abcd123'})).status,400);
 assert.equal((await f.member('member/login',{email:member.email,password})).status,200);
 assert.equal((await f.member('member/password',{currentPassword:password,newPassword:'Newpass'})).status,400);
 assert.equal((await f.member('member/me')).status,200);
 assert.equal((await f.member('member/password',{currentPassword:password,newPassword:'Newpass8'})).status,200);
 assert.equal((await f.member('member/me')).status,401);
 assert.equal((await f.member('member/login',{email:member.email,password})).status,401);
 assert.equal((await f.member('member/login',{email:member.email,password:'Newpass8'})).status,200);
 assert.equal((await f.admin('auth/password',{currentPassword:adminPassword,newPassword:'Newpass8'})).status,400);
 assert.equal((await f.admin('admin/members')).status,200);
});

test('ID recovery matches every identity field exactly, normalizes phone formatting and masks the email',async()=>{
 const f=await fixture();await register(f);
 const found=await f.member('member/find-id',{...identity,phone:'(010) 1234 5678'});
 assert.equal(found.status,200);assert.deepEqual(found.data,{emails:['re***@test.test']});assert.equal(found.headers.get('Cache-Control'),'no-store');
 for(const wrong of [{name:'복구 테스트'},{contact:'김'},{phone:'010-9999-9999'}]){
  const response=await f.member('member/find-id',{...identity,...wrong});assert.equal(response.status,200);assert.deepEqual(response.data,{emails:[]});
 }
 assert.equal((await f.member('member/find-id',{...identity,phone:'-------'})).status,400);
 assert.equal((await f.member('member/find-id',{...identity,phone:'01012345678'})).data.emails[0],'re***@test.test');
});

test('recovery requests have a generic response and store only exact matches without issuing a code',async()=>{
 const f=await fixture(),member=await register(f);
 const unknown=await f.member('member/recovery-request',{...identity,email:'unknown@test.test'});
 const wrong=await f.member('member/recovery-request',{...identity,email:member.email,contact:'다른 담당자'});
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_recovery').get().n,0);
 const matched=await f.member('member/recovery-request',{...identity,email:member.email.toUpperCase(),phone:'01012345678'});
 assert.equal(matched.status,200);assert.equal(unknown.status,200);assert.equal(wrong.status,200);assert.deepEqual(matched.data,unknown.data);assert.deepEqual(matched.data,wrong.data);
 const stored=f.DB.raw.prepare('SELECT * FROM member_recovery').get();assert.equal(stored.member_id,member.id);assert.ok(stored.requested_at);assert.equal(stored.token_hash,null);
 const queue=await f.admin('admin/members/recovery');assert.equal(queue.status,200);assert.equal(queue.data.requests.length,1);assert.equal(queue.data.requests[0].email,member.email);assert.equal('token_hash' in queue.data.requests[0],false);
 assert.equal((await f.member('member/reset-password',reset(member,'0'.repeat(24)))).status,400);
 assert.equal((await f.member('member/login',{email:member.email,password})).status,200);
});

test('only the owner can inspect recovery requests or issue a verified code for the current member version',async()=>{
 const f=await fixture(),member=await register(f),path=`admin/members/${member.id}/recovery-code`,input={verified:true,version:member.version};
 const stranger=client({...f.common,APP_KIND:'admin'});
 for(const [url,data] of [['admin/members/recovery',undefined],[path,input]]){
  assert.equal((await stranger(url,data)).status,401);assert.equal((await f.member(url,data)).status,404);
 }
 assert.equal((await f.admin('admin/users',{username:'staff',password:adminPassword,displayName:'테스트 직원'})).status,201);
 const staff=client({...f.common,APP_KIND:'admin'});
 assert.equal((await staff('auth/login',{username:'staff',password:adminPassword})).status,200);
 assert.equal((await staff('auth/password',{currentPassword:adminPassword,newPassword:'staff-new-password-1234'})).status,200);
 assert.equal((await staff('auth/login',{username:'staff',password:'staff-new-password-1234'})).status,200);
 assert.equal((await staff('admin/members/recovery')).status,403);assert.equal((await staff(path,input)).status,403);
 assert.equal((await f.admin(path,{...input,verified:false})).status,400);
 assert.equal((await f.admin(path,{...input,version:undefined})).status,400);
 assert.equal((await f.admin(path,{...input,version:member.version-1})).status,409);
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_recovery').get().n,0);
 await issue(f,member);
});

test('reset codes are hashed, bound to the account, single use and revoke member sessions without changing approval or admin sessions',async()=>{
 const f=await fixture(),member=await register(f),other=await register(f,'other@test.test'),second=client({...f.common,APP_KIND:'main'});
 for(const api of [f.member,second])assert.equal((await api('member/login',{email:member.email,password})).status,200);
 await f.member('member/recovery-request',{...identity,email:member.email});
 const code=await issue(f,member),stored=f.DB.raw.prepare('SELECT * FROM member_recovery WHERE member_id=?').get(member.id);
 assert.equal(stored.token_hash,await digest(code));assert.equal(JSON.stringify(stored).includes(code),false);assert.equal(stored.member_version,member.version);assert.equal(stored.used_at,null);
 assert.ok(stored.expires_at>Date.now()&&stored.expires_at<=Date.now()+30*60*1000);assert.equal((await f.admin('admin/members/recovery')).data.requests.length,0);
 assert.equal((await second('member/reset-password',reset(other,code))).status,400);
 assert.equal((await second('member/reset-password',reset(member,'f'.repeat(24)))).status,400);
 assert.equal((await second('member/reset-password',reset(member,code,'Newpass'))).status,400);
 assert.equal((await f.member('member/me')).status,200);assert.equal((await second('member/me')).status,200);
 const formatted=code.toUpperCase().match(/.{1,6}/g).join('-');
 assert.equal((await second('member/reset-password',reset(member,formatted))).status,200);
 const changed=f.DB.raw.prepare('SELECT * FROM members WHERE id=?').get(member.id),used=f.DB.raw.prepare('SELECT * FROM member_recovery WHERE member_id=?').get(member.id);
 assert.equal(changed.status,member.status);assert.equal(changed.version,member.version+1);assert.notEqual(changed.password_hash,member.password_hash);assert.ok(used.used_at);assert.equal(used.token_hash,null);assert.equal(used.requested_at,null);
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_sessions WHERE member_id=?').get(member.id).n,0);
 for(const api of [f.member,second])assert.equal((await api('member/me')).status,401);
 assert.equal((await second('member/reset-password',reset(member,code,'Replay88'))).status,400);
 assert.equal((await f.member('member/login',{email:member.email,password})).status,401);
 assert.equal((await f.member('member/login',{email:member.email,password:'Newpass8'})).status,200);
 assert.equal((await f.member('member/login',{email:other.email,password})).status,200);
 assert.equal((await f.admin('admin/members')).status,200);
});

test('reissuing, expiration and a later member change invalidate previous reset codes',async()=>{
 const f=await fixture(),member=await register(f);
 const original=await issue(f,member),replacement=await issue(f,member);assert.notEqual(original,replacement);
 assert.equal((await f.member('member/reset-password',reset(member,original))).status,400);
 f.DB.raw.prepare('UPDATE member_recovery SET expires_at=? WHERE member_id=?').run(Date.now()-1,member.id);
 assert.equal((await f.member('member/reset-password',reset(member,replacement))).status,400);
 const stale=await issue(f,member);
 assert.equal((await f.admin(`admin/members/${member.id}`,{action:'profile',version:member.version,...identity,contact:'변경 담당자'},'PATCH')).status,200);
 assert.equal((await f.member('member/reset-password',reset(member,stale))).status,400);
 assert.equal((await f.member('member/login',{email:member.email,password})).status,200);
 const current=f.DB.raw.prepare('SELECT * FROM members WHERE id=?').get(member.id),valid=await issue(f,current);
 assert.equal((await f.member('member/reset-password',reset(current,valid))).status,200);
});

test('password recovery preserves pending and suspended status and does not allow login before approval',async()=>{
 const f=await fixture();
 for(const status of ['pending','suspended']){
  const member=await register(f,`${status}@test.test`,status),code=await issue(f,member);
  assert.equal((await f.member('member/reset-password',reset(member,code))).status,200);
  assert.equal(f.DB.raw.prepare('SELECT status FROM members WHERE id=?').get(member.id).status,status);
  const login=await f.member('member/login',{email:member.email,password:'Newpass8'});assert.equal(login.status,403);assert.equal(login.data.status,status);assert.equal(login.headers.has('Set-Cookie'),false);
  assert.equal((await f.member('member/me')).status,401);
 }
});

test('recovery endpoints reject other origins and throttle both identity attempts and a shared IP',async()=>{
 const f=await fixture(),member=await register(f);
 for(const path of ['member/find-id','member/recovery-request','member/reset-password'])assert.equal((await f.member(path,{...identity,...reset(member,'0'.repeat(24))},'POST',{Origin:'https://evil.test'})).status,403);
 assert.equal((await f.admin(`admin/members/${member.id}/recovery-code`,{verified:true,version:member.version},'POST',{Origin:'https://evil.test'})).status,403);
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_recovery').get().n,0);
 for(let i=0;i<5;i++)assert.equal((await f.member('member/find-id',identity)).status,200);
 assert.equal((await f.member('member/find-id',identity)).status,429);
 const requesting=client({...f.common,APP_KIND:'main'},'request-ip');
 for(let i=0;i<3;i++)assert.equal((await requesting('member/recovery-request',{...identity,email:member.email})).status,200);
 assert.equal((await requesting('member/recovery-request',{...identity,email:member.email})).status,429);
 const resetting=client({...f.common,APP_KIND:'main'},'reset-ip');
 for(let i=0;i<10;i++)assert.equal((await resetting('member/reset-password',reset(member,'invalid'))).status,400);
 assert.equal((await resetting('member/reset-password',reset(member,'invalid'))).status,429);
 const flooding=client({...f.common,APP_KIND:'main'},'flood-ip');
 for(let i=0;i<20;i++)assert.equal((await flooding('member/find-id',{...identity,phone:`0100000${String(i).padStart(4,'0')}`})).status,200);
 assert.equal((await flooding('member/recovery-request',{...identity,email:'fresh@test.test'})).status,429);
});
