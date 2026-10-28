import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {passwordHash,randomToken} from './security.js';

const password='support-testing-123';
function database(){
 const raw=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url);raw.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())raw.exec(readFileSync(new URL(name,dir),'utf8'));
 return {raw,beforeBatch:null,prepare(sql){return {bind(...args){return {async first(){return raw.prepare(sql).get(...args)||null;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}};}};},async batch(items){this.beforeBatch?.();this.beforeBatch=null;raw.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());raw.exec('COMMIT');return result;}catch(error){raw.exec('ROLLBACK');throw error;}}};
}
function client(env){
 let cookie='';const host=env.APP_KIND==='admin'?'https://admin.example.test':'https://example.test';
 return async(path,data,method=data?'POST':'GET')=>{
  const response=await worker.fetch(new Request(`${host}/api/${path}`,{method,headers:{Origin:host,'Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':'support-test'},body:data?JSON.stringify(data):undefined}),env);
  if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];
  return {status:response.status,data:await response.json()};
 };
}
async function fixture(){
 const DB=database(),common={DB,BOOTSTRAP_TOKEN:randomToken()},admin=client({...common,APP_KIND:'admin'});
 assert.equal((await admin('auth/setup',{username:'owner',password,displayName:'테스트 운영팀',setupToken:common.BOOTSTRAP_TOKEN})).status,200);
 const hash=await passwordHash(password),members={};
 for(const [key,role,status] of [['brand','brand','approved'],['supplier','supplier','approved'],['other','brand','approved'],['pending','brand','pending']]){
  const id=crypto.randomUUID(),email=`${key}@example.test`,time=new Date().toISOString();
  DB.raw.prepare('INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,email,hash,role,'individual',key,'고객 담당자','010-0000-0000',status,'test',time,time);
  const api=client({...common,APP_KIND:'main'});if(status==='approved')assert.equal((await api('member/login',{email,password})).status,200);members[key]={id,email,api};
 }
 return {DB,common,admin,...members};
}
const support={managerName:'테스트 운영 담당자',managerPhone:'010-0000-0001',managerEmail:'manager@example.test',signupEta:'영업일 기준 2일 예상',packagingEta:'자료 확인 후 일정 안내',matchingEta:'접수 후 개별 안내',responseEta:'영업일 기준 다음 날',version:0,confirmed:true};
const company={summary:'브랜드 소개',categories:['box'],quantity:1000,productionPeriod:'협의',industry:'테스트',delivery:'협의',material:'종이',finish:'무광',note:'고객 공개',internalNote:'PRIVATE SECRET',listed:true,version:0,confirmed:true};
const submit=(api,kind='inquiry',details={})=>api('member/requests',{kind,details,message:'담당자의 확인과 연락을 요청합니다.',confirmed:true});

test('support and own company are private to the member and pending login reveals support only after password verification',async()=>{
 const f=await fixture(),anonymous=client({...f.common,APP_KIND:'main'});
 assert.equal((await anonymous('member/workspace')).status,401);
 const empty=(await f.brand.api('member/workspace')).data;assert.equal(empty.support.managerName,'');assert.equal(empty.support.signupEta,'');assert.equal(empty.support.version,0);assert.equal(empty.company.version,0);
 assert.equal((await f.admin(`admin/members/${f.brand.id}/support`,support,'PUT')).status,200);
 assert.equal((await f.admin(`admin/members/${f.brand.id}/company`,company,'PUT')).status,200);
 const own=(await f.brand.api(`member/workspace?memberId=${f.other.id}`)).data;
 assert.equal(own.support.managerName,support.managerName);assert.equal(own.company.summary,company.summary);assert.equal(own.company.listed,true);assert.doesNotMatch(JSON.stringify(own),/PRIVATE|internalNote|password_hash/);
 assert.equal((await f.other.api(`member/workspace?memberId=${f.brand.id}`)).data.support.managerName,'');
 await f.admin(`admin/members/${f.pending.id}/support`,support,'PUT');
 const wrong=await f.pending.api('member/login',{email:f.pending.email,password:'incorrect-123'});assert.equal(wrong.status,401);assert.equal('support' in wrong.data,false);
 const pending=await f.pending.api('member/login',{email:f.pending.email,password});assert.equal(pending.status,403);assert.equal(pending.data.support.managerPhone,support.managerPhone);assert.equal((await f.pending.api('member/workspace')).status,401);
 assert.equal((await f.brand.api(`admin/members/${f.other.id}/support`)).status,404);
});

test('support validates contacts and confirmation, guards concurrent updates and audits only successful changes',async()=>{
 const f=await fixture(),path=`admin/members/${f.brand.id}/support`;
 for(const patch of [{confirmed:false},{managerPhone:'call me'},{managerEmail:'bad-email'},{managerName:'x'.repeat(61)}])assert.equal((await f.admin(path,{...support,...patch},'PUT')).status,400);
 assert.equal((await f.admin(path,support,'PUT')).status,200);assert.equal((await f.admin(path,support,'PUT')).status,409);
 f.DB.beforeBatch=()=>f.DB.raw.prepare('UPDATE member_support SET version=version+1 WHERE member_id=?').run(f.brand.id);
 assert.equal((await f.admin(path,{...support,managerName:'다른 담당자',version:1},'PUT')).status,409);
 assert.equal((await f.admin(path)).data.support.managerName,support.managerName);assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_profile_events').get().n,1);
 await f.admin('admin/users',{username:'staff',password,displayName:'직원'});const staff=client({...f.common,APP_KIND:'admin'});
 await staff('auth/login',{username:'staff',password});await staff('auth/password',{currentPassword:password,newPassword:'changed-staff-123'});await staff('auth/login',{username:'staff',password:'changed-staff-123'});
 for(const route of [path,'admin/member-requests'])assert.equal((await staff(route)).status,403);
 assert.equal((await staff(path,{...support,version:2},'PUT')).status,403);
});

test('member requests preserve approved profiles, isolate members and retain reviewing requests in the active queue',async()=>{
 const f=await fixture();await f.admin(`admin/members/${f.brand.id}/company`,company,'PUT');
 const profile=await submit(f.brand.api,'profile',{name:'변경 신청',contact:'새 담당자',phone:'010-0000-0002'});assert.equal(profile.status,201);
 const changed=await submit(f.brand.api,'company',{summary:'수정 신청',quantity:2000,version:1});assert.equal(changed.status,201);
 assert.equal((await submit(f.supplier.api,'matching',{category:'box',capacity:'10000'})).status,201);assert.equal((await submit(f.brand.api)).status,201);
 assert.equal(f.DB.raw.prepare('SELECT name FROM members WHERE id=?').get(f.brand.id).name,'brand');
 assert.equal(JSON.parse(f.DB.raw.prepare('SELECT profile FROM member_companies WHERE member_id=?').get(f.brand.id).profile).summary,company.summary);
 const own=(await f.brand.api('member/workspace')).data.requests;assert.equal(own.length,3);assert.ok(own.every(r=>r.member_id===f.brand.id));assert.equal((await f.other.api('member/workspace')).data.requests.length,0);
 const queue=(await f.admin('admin/member-requests?status=active')).data.requests;assert.equal(queue.length,4);assert.ok(queue.every(r=>r.member_name&&r.member_role));
 const route=`admin/member-requests/${profile.data.id}`;
 assert.equal((await f.admin(route,{status:'reviewing',note:'등록된 번호로 확인 예정입니다.',version:1,confirmed:true},'PATCH')).status,200);
 assert.equal((await f.admin('admin/member-requests?status=active')).data.requests.length,4);assert.equal((await f.admin('admin/member-requests?status=pending')).data.requests.length,3);
 assert.equal((await f.admin(route,{status:'completed',note:'완료',version:1,confirmed:true},'PATCH')).status,409);
 assert.equal((await f.admin(route,{status:'completed',note:'별도 회원 정보 수정 후 완료',version:2,confirmed:true},'PATCH')).status,200);
 assert.equal((await f.admin('admin/member-requests?status=active')).data.requests.length,3);
 assert.equal((await f.admin(route,{status:'reviewing',note:'재개',version:3,confirmed:true},'PATCH')).status,409);
 const result=(await f.brand.api('member/workspace')).data.requests.find(r=>r.id===profile.data.id);assert.equal(result.status,'completed');assert.equal(result.note,'별도 회원 정보 수정 후 완료');
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_request_events WHERE request_id=?').get(profile.data.id).n,3);
});

test('request validation and transaction status checks block unconfirmed, malformed and suspended submissions',async()=>{
 const f=await fixture();
 for(const data of [
  {kind:'profile',details:{phone:'not-a-phone'}},{kind:'company',details:{internalNote:'private'}},{kind:'company',details:{quantity:-1}},
  {kind:'matching',details:{category:'unknown'}},{kind:'inquiry',details:{member_id:f.other.id}},{kind:'unknown',details:{}},
  {kind:'inquiry',details:{},message:''},{kind:'inquiry',details:{},confirmed:false},
 ])assert.equal((await f.brand.api('member/requests',{message:'확인 요청',confirmed:true,...data})).status,400);
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_requests').get().n,0);
 assert.equal((await f.admin('admin/member-requests?status=invalid')).status,400);assert.equal((await f.admin('admin/member-requests?memberId=invalid')).status,400);
 f.DB.beforeBatch=()=>f.DB.raw.prepare("UPDATE members SET status='suspended',version=version+1 WHERE id=?").run(f.brand.id);
 assert.equal((await submit(f.brand.api)).status,409);assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_request_events').get().n,0);
});

async function selectEachOther(f){
 for(const member of [f.brand,f.supplier,f.other])await f.admin(`admin/members/${member.id}/company`,company,'PUT');
 for(const [a,b] of [[f.brand,f.supplier],[f.supplier,f.brand],[f.other,f.supplier]])assert.equal((await a.api('matching/requests',{category:'box',candidateIds:[b.id],candidateVersions:{[b.id]:1},confirmed:true})).status,201);
}
test('connecting and reactivating a trade atomically complete both directions with audit while preserving unrelated and historical requests',async()=>{
 const f=await fixture();await selectEachOther(f);
 const reverse=(await f.admin(`admin/matching/requests?memberId=${f.brand.id}`)).data.requests.find(r=>r.requester_id===f.supplier.id);
 await f.admin(`admin/matching/requests/${reverse.id}`,{status:'reviewing',note:'양측 확인 중',version:1,confirmed:true},'PATCH');
 assert.equal((await f.admin('admin/matching/requests?status=active')).data.requests.length,3);
 const created=await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id});assert.equal(created.status,201);
 const paired=(await f.admin(`admin/matching/requests?memberId=${f.brand.id}`)).data.requests;assert.equal(paired.length,2);assert.ok(paired.every(r=>r.status==='completed'));assert.equal(paired.find(r=>r.id===reverse.id).version,3);
 assert.equal((await f.admin('admin/matching/requests?status=active')).data.requests.length,1);
 assert.equal(f.DB.raw.prepare("SELECT count(*) n FROM matching_request_events WHERE status='completed'").get().n,2);
 assert.equal((await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id})).status,200);assert.equal(f.DB.raw.prepare("SELECT count(*) n FROM matching_request_events WHERE status='completed'").get().n,2);
 await f.admin(`admin/partners/${created.data.id}`,{status:'ended',version:1},'PATCH');
 assert.equal((await f.brand.api('matching/requests',{category:'box',candidateIds:[f.supplier.id],candidateVersions:{[f.supplier.id]:1},confirmed:true})).status,201);
 assert.equal((await f.admin(`admin/partners/${created.data.id}`,{status:'active',version:2},'PATCH')).status,200);
 const all=(await f.admin(`admin/matching/requests?memberId=${f.brand.id}`)).data.requests;assert.equal(all.length,3);assert.ok(all.every(r=>r.status==='completed'));assert.equal(f.DB.raw.prepare("SELECT count(*) n FROM matching_request_events WHERE status='completed'").get().n,3);
 assert.equal((await f.supplier.api('matching/requests',{category:'box',candidateIds:[f.brand.id],candidateVersions:{[f.brand.id]:1},confirmed:true})).status,201);
 assert.equal((await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id})).status,200);
 assert.ok((await f.admin(`admin/matching/requests?memberId=${f.brand.id}`)).data.requests.every(r=>r.status==='completed'));
 assert.equal(f.DB.raw.prepare("SELECT count(*) n FROM matching_request_events WHERE status='completed'").get().n,4);
});

test('failed connection eligibility and request audit failures never partially complete the mutual requests',async()=>{
 const f=await fixture();await selectEachOther(f);
 f.DB.beforeBatch=()=>f.DB.raw.prepare("UPDATE members SET status='suspended' WHERE id=?").run(f.supplier.id);
 assert.equal((await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id})).status,409);
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_partners').get().n,0);assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM matching_request_events').get().n,0);
 assert.equal((await f.admin('admin/matching/requests?status=active')).data.requests.length,3);
 f.DB.raw.prepare("UPDATE members SET status='approved' WHERE id=?").run(f.supplier.id);
 f.DB.raw.exec("CREATE TRIGGER test_request_audit_failure BEFORE INSERT ON matching_request_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
 assert.equal((await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id})).status,500);
 assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_partners').get().n,0);assert.equal(f.DB.raw.prepare('SELECT count(*) n FROM member_partner_events').get().n,0);
 assert.equal((await f.admin('admin/matching/requests?status=active')).data.requests.length,3);
});
