import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {randomToken,passwordHash} from './security.js';

const migrations=new URL('../migrations/',import.meta.url);
function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort())raw.exec(readFileSync(new URL(name,migrations),'utf8'));
 return {raw,beforeBatch:null,prepare(sql){return {bind(...values){const args=values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return {async first(){return raw.prepare(sql).get(...args)||null;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}};}};},async batch(items){this.beforeBatch?.();this.beforeBatch=null;raw.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());raw.exec('COMMIT');return result;}catch(error){raw.exec('ROLLBACK');throw error;}}};
}
function client(env){
 let cookie='';const host=env.APP_KIND==='admin'?'https://admin.example.test':'https://example.test';
 return async(path,data,method=data?'POST':'GET')=>{
  const response=await worker.fetch(new Request(`${host}/api/${path}`,{method,headers:{Origin:host,'Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':'workflow-test'},body:data?JSON.stringify(data):undefined}),env);
  if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];
  return {status:response.status,data:response.headers.get('Content-Type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer())};
 };
}
const password='workflow-password-123';
async function fixture(){
 const DB=database(),common={DB,BOOTSTRAP_TOKEN:randomToken()},admin=client({...common,APP_KIND:'admin'});
 await admin('auth/setup',{username:'owner',password,displayName:'운영자',setupToken:common.BOOTSTRAP_TOKEN});
 const hash=await passwordHash(password),members={};
 for(const [key,role] of [['brand','brand'],['supplier','supplier'],['otherBrand','brand'],['otherSupplier','supplier']]){
  const id=crypto.randomUUID(),email=`${key.toLowerCase()}@example.test`,time=new Date().toISOString();
  DB.raw.prepare("INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,email,hash,role,'individual',key,'private-contact','010-1234-5678','approved','test',time,time);
  const api=client({...common,APP_KIND:'main'});assert.equal((await api('member/login',{email,password})).status,200);members[key]={id,api};
 }
 return {DB,common,admin,...members};
}
const profile={summary:'반복 제작용 종이 상자',categories:['box'],quantity:1000,productionPeriod:'협의 후 3주',industry:'생활용품',delivery:'정기 납품',material:'종이',finish:'무광',note:'샘플 협의',internalNote:'PRIVATE INTERNAL',listed:true,version:0,confirmed:true};
const spec={name:'등록 패키징',size:'60 × 60 × 80 mm',material:'종이',printing:'로고',finish:'무광',description:'검토된 사양',files:[]};
const order=(packagingId,supplierId,version=1)=>({id:crypto.randomUUID(),packagingId,packagingVersion:version,supplierId,sharingConsent:true,confirmed:true,quantity:1000,requestedDate:'2030-12-01',address:'배송지',note:''});
const pendingReview=async(f,id)=>(await f.admin(`admin/packaging-reviews?memberId=${id}&status=pending`)).data.reviews[0];
const review=async(f,row,action='approve',extra={})=>f.admin(`admin/packaging-reviews/${row.id}`,{action,version:row.version,note:action==='reject'?'사진을 다시 확인해주세요':'',confirmed:true,...extra},'PATCH');

test('company profiles are account-linked, owner managed, anonymous and absent until explicitly listed',async()=>{
 const f=await fixture();
 assert.deepEqual((await f.brand.api('matching/candidates?category=box')).data.candidates,[]);
 const fresh=await f.admin(`admin/members/${f.supplier.id}/company`);assert.equal(fresh.data.profile.version,0);assert.equal(fresh.data.profile.listed,false);
 assert.equal((await f.admin(`admin/members/${f.supplier.id}/company`,{...profile,confirmed:false},'PUT')).status,400);
 assert.equal((await f.admin(`admin/members/${f.supplier.id}/company`,profile,'PUT')).status,200);
 assert.equal((await f.admin(`admin/members/${f.supplier.id}/company`,profile,'PUT')).status,409);
 await f.admin(`admin/members/${f.otherSupplier.id}/company`,{...profile,listed:false},'PUT');
 await f.admin(`admin/members/${f.brand.id}/company`,{...profile,quantity:2000},'PUT');
 const result=(await f.brand.api('matching/candidates?category=box&role=supplier&region=seoul')).data.candidates;
 assert.equal(result.length,1);assert.equal(result[0].id,f.supplier.id);assert.equal(result[0].label,'A업체');assert.equal(result[0].demo,false);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private-contact|010-1234|@example/);assert.equal('region' in result[0],false);
 assert.equal((await f.supplier.api('matching/candidates?category=box&capacity=1000')).data.candidates.length,0);
 const brandCandidate=(await f.supplier.api('matching/candidates?category=box&capacity=3000')).data.candidates[0];assert.equal(brandCandidate.label,'A브랜드');assert.equal(brandCandidate.schedule,profile.delivery);assert.equal(result[0].schedule,profile.productionPeriod);assert.equal(result[0].version,1);
 assert.equal((await f.brand.api('matching/candidates?category=unknown')).status,400);
 assert.equal((await client({...f.common,APP_KIND:'main'})('matching/candidates?category=box')).status,401);
 f.DB.raw.prepare("UPDATE members SET status='suspended' WHERE id=?").run(f.supplier.id);
 assert.equal((await f.brand.api('matching/candidates?category=box')).data.candidates.length,0);
 assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM member_profile_events').get().n,3);
});

test('multiple opposite-role selections persist both directions without creating a trading connection or exposing identities',async()=>{
 const f=await fixture();for(const member of [f.brand,f.supplier,f.otherSupplier])await f.admin(`admin/members/${member.id}/company`,profile,'PUT');
 const input={candidateIds:[f.supplier.id,f.otherSupplier.id],candidateVersions:{[f.supplier.id]:1,[f.otherSupplier.id]:1,[f.otherBrand.id]:1},category:'box',confirmed:true};
 assert.equal((await f.brand.api('matching/requests',{...input,confirmed:false})).status,400);
 assert.equal((await f.brand.api('matching/requests',input)).status,201);assert.equal((await f.brand.api('matching/requests',input)).status,201);
 assert.equal((await f.brand.api('matching/requests',{...input,candidateIds:[f.otherBrand.id]})).status,409);
 const reverse=await f.supplier.api('matching/requests',{candidateIds:[f.brand.id],candidateVersions:{[f.brand.id]:1},category:'box',capacity:2000,confirmed:true});assert.equal(reverse.status,201);
 const own=(await f.brand.api('matching/requests')).data.requests;assert.equal(own.length,2);assert.doesNotMatch(JSON.stringify(own),/requester_name|target_name|private-contact|PRIVATE/);
 assert.equal((await f.otherBrand.api(`matching/requests?memberId=${f.brand.id}`)).data.requests.length,0);
 assert.equal((await f.admin(`admin/matching/requests?memberId=${f.brand.id}`)).data.requests.length,3);
 assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM member_partners').get().n,0);
 const request=(await f.admin('admin/matching/requests?status=pending')).data.requests[0];assert.ok(request.requester_name);assert.ok(request.target_name);
 assert.equal((await f.admin(`admin/matching/requests/${request.id}`,{status:'reviewing',note:'검토 중',version:1,confirmed:true},'PATCH')).status,200);
 assert.equal((await f.admin(`admin/matching/requests/${request.id}`,{status:'completed',note:'처리',version:1,confirmed:true},'PATCH')).status,409);
 assert.equal((await f.admin(`admin/matching/requests/${request.id}`,{status:'completed',note:'처리',version:2,confirmed:true},'PATCH')).status,200);
 assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM member_partners').get().n,0);
});

test('candidate submissions reject missing, stale and concurrently changed displayed versions',async()=>{
 const f=await fixture();await f.admin(`admin/members/${f.supplier.id}/company`,profile,'PUT');
 const shown=(await f.brand.api('matching/candidates?category=box')).data.candidates[0];
 const input={candidateIds:[shown.id],category:'box',confirmed:true};
 assert.equal((await f.brand.api('matching/requests',input)).status,400);
 await f.admin(`admin/members/${f.supplier.id}/company`,{...profile,summary:'변경된 조건',version:1},'PUT');
 assert.equal((await f.brand.api('matching/requests',{...input,candidateVersions:{[shown.id]:shown.version}})).status,409);
 f.DB.beforeBatch=()=>f.DB.raw.prepare('UPDATE member_companies SET version=version+1 WHERE member_id=?').run(shown.id);
 assert.equal((await f.brand.api('matching/requests',{...input,candidateVersions:{[shown.id]:2}})).status,409);
 assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM matching_requests').get().n,0);
 const current=(await f.brand.api('matching/candidates?category=box')).data.candidates[0];assert.equal(current.title,'변경된 조건');
 assert.equal((await f.brand.api('matching/requests',{...input,candidateVersions:{[current.id]:current.version}})).status,201);
 const saved=(await f.brand.api('matching/requests')).data.requests[0];assert.equal(saved.candidate.title,current.title);assert.equal(saved.candidate.version,current.version);
});

test('member packaging additions and edits require review while approved snapshots remain unchanged',async()=>{
 const f=await fixture();
 assert.equal((await f.brand.api('packagings',{spec})).status,400);
 const created=await f.brand.api('packagings',{spec,confirmed:true});assert.equal(created.status,201);const id=created.data.id;
 let p=(await f.brand.api('packagings')).data.packagings[0];assert.equal(p.approval_status,'pending');assert.ok(p.pendingReview);
 assert.equal((await f.brand.api(`packagings/${id}`,{spec,version:1,confirmed:true},'PATCH')).status,409);
 assert.equal((await f.brand.api(`packagings/${id}`,{favorite:true,version:1},'PATCH')).status,200);
 assert.equal((await f.brand.api(`packagings/${id}`,{archived:true,version:1},'PATCH')).status,409);
 assert.equal((await f.otherBrand.api(`packagings/${id}`,{spec,version:1,confirmed:true},'PATCH')).status,404);
 let pending=await pendingReview(f,f.brand.id);assert.equal((await review(f,pending)).status,200);assert.equal((await review(f,pending)).status,409);
 p=(await f.brand.api('packagings')).data.packagings[0];assert.equal(p.approval_status,'approved');assert.equal(p.version,2);
 const changed={...spec,name:'변경 요청',material:'새 소재'};
 assert.equal((await f.brand.api(`packagings/${id}`,{spec:changed,version:p.version,confirmed:true},'PATCH')).status,200);
 p=(await f.brand.api('packagings')).data.packagings[0];assert.deepEqual(p.spec,spec);assert.equal(p.pendingReview.spec.name,'변경 요청');
 pending=await pendingReview(f,f.brand.id);assert.equal((await review(f,pending,'reject')).status,200);
 p=(await f.brand.api('packagings')).data.packagings[0];assert.deepEqual(p.spec,spec);assert.equal(p.lastReviewStatus,'rejected');assert.equal(p.pendingReview,null);
 await f.brand.api(`packagings/${id}`,{spec:changed,version:p.version,confirmed:true},'PATCH');pending=await pendingReview(f,f.brand.id);
 assert.equal((await review(f,pending,'approve',{spec:{...changed,name:'운영팀 최종 수정'}})).status,200);
 p=(await f.brand.api('packagings')).data.packagings[0];assert.equal(p.spec.name,'운영팀 최종 수정');assert.equal(p.lastReviewStatus,'approved');
 assert.ok(f.DB.raw.prepare('SELECT count(*) AS n FROM member_profile_events WHERE member_id=?').get(f.brand.id).n>=3);
});

test('new orders require an active counterpart and an approved owned specification; submitted arbitrary specs cannot bypass it',async()=>{
 const f=await fixture();const created=await f.brand.api('packagings',{spec,confirmed:true}),id=created.data.id;
 assert.equal((await f.brand.api('orders',order(id,f.supplier.id))).status,409);
 await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id});
 assert.equal((await f.brand.api('orders',order(id,f.supplier.id))).status,409);
 await review(f,await pendingReview(f,f.brand.id));
 assert.equal((await f.brand.api('orders',order(id,f.supplier.id))).status,409);
 assert.equal((await f.brand.api('orders',{...order(id,f.supplier.id,2),confirmed:false})).status,400);
 assert.equal((await f.brand.api('orders',{...order(id,f.supplier.id,2),supplierId:null})).status,400);
 const input={...order(id,f.supplier.id,2),spec:{...spec,name:'FORGED'}};assert.equal((await f.brand.api('orders',input)).status,201);assert.equal((await f.brand.api('orders',input)).status,200);
 const saved=(await f.brand.api(`orders/${input.id}`)).data.order;assert.deepEqual(saved.spec,spec);assert.equal(saved.packaging_id,id);assert.equal(saved.packaging_version,2);
 await f.admin('admin/partners',{brandId:f.otherBrand.id,supplierId:f.supplier.id});assert.equal((await f.otherBrand.api('orders',order(id,f.supplier.id,2))).status,409);
 const link=(await f.brand.api('partners')).data.partners[0];await f.admin(`admin/partners/${link.id}`,{status:'ended',version:link.version},'PATCH');
 assert.equal((await f.brand.api('orders',order(id,f.supplier.id,2))).status,409);assert.equal((await f.brand.api(`orders/${input.id}`)).status,200);
});

test('admin uploads are owned by the brand and spec approval rechecks versions atomically',async()=>{
 const f=await fixture(),file={name:'sample.png',mime:'image/png',kind:'sample',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ZkAAAAASUVORK5CYII='};
 const upload=await f.admin(`admin/members/${f.brand.id}/files`,file);assert.equal(upload.status,201);assert.equal((await f.brand.api(`member/files/${upload.data.file.id}`)).status,200);assert.equal((await f.otherBrand.api(`member/files/${upload.data.file.id}`)).status,404);
 assert.equal((await f.admin(`admin/members/${f.otherBrand.id}/packagings`,{spec:{...spec,files:[upload.data.file]},confirmed:true})).status,400);
 const created=await f.admin(`admin/members/${f.brand.id}/packagings`,{spec:{...spec,files:[upload.data.file]},confirmed:true});assert.equal(created.status,201);
 let p=(await f.brand.api('packagings')).data.packagings[0];assert.equal(p.approval_status,'approved');assert.equal(p.spec.files[0].id,upload.data.file.id);
 await f.brand.api(`packagings/${p.id}`,{spec:{...spec,name:'요청'},version:p.version,confirmed:true},'PATCH');const pending=await pendingReview(f,f.brand.id);
 f.DB.beforeBatch=()=>f.DB.raw.prepare('UPDATE packagings SET version=version+1 WHERE id=?').run(p.id);
 assert.equal((await review(f,pending)).status,409);
 assert.equal(f.DB.raw.prepare('SELECT status FROM packaging_reviews WHERE id=?').get(pending.id).status,'pending');assert.equal(JSON.parse(f.DB.raw.prepare('SELECT spec FROM packagings WHERE id=?').get(p.id).spec).name,spec.name);
});

test('workflow writes are owner-only and candidate or specification changes cannot partly commit a submission',async()=>{
 const f=await fixture();for(const member of [f.supplier,f.otherSupplier])await f.admin(`admin/members/${member.id}/company`,profile,'PUT');
 f.DB.beforeBatch=()=>f.DB.raw.prepare("UPDATE members SET status='suspended' WHERE id=?").run(f.otherSupplier.id);
 assert.equal((await f.brand.api('matching/requests',{candidateIds:[f.supplier.id,f.otherSupplier.id],candidateVersions:{[f.supplier.id]:1,[f.otherSupplier.id]:1},category:'box',confirmed:true})).status,409);
 assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM matching_requests').get().n,0);
 const saved=await f.admin(`admin/members/${f.brand.id}/packagings`,{spec,confirmed:true});await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id});
 f.DB.beforeBatch=()=>f.DB.raw.prepare('UPDATE packagings SET version=version+1 WHERE id=?').run(saved.data.id);
 assert.equal((await f.brand.api('orders',order(saved.data.id,f.supplier.id))).status,409);
 assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,0);assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM order_events').get().n,0);
 await f.admin('admin/users',{username:'staff',password,displayName:'직원'});const staff=client({...f.common,APP_KIND:'admin'});
 await staff('auth/login',{username:'staff',password});await staff('auth/password',{currentPassword:password,newPassword:'changed-staff-password'});await staff('auth/login',{username:'staff',password:'changed-staff-password'});
 for(const path of [`admin/members/${f.brand.id}/company`,`admin/members/${f.brand.id}/packagings`,'admin/packaging-reviews','admin/matching/requests'])assert.equal((await staff(path)).status,403,path);
 assert.equal((await staff(`admin/members/${f.brand.id}/company`,profile,'PUT')).status,403);
 assert.equal((await staff(`admin/members/${f.brand.id}/packagings`,{spec,confirmed:true})).status,403);
});

test('quotes and monetary approval require explicit confirmation and retain immutable approved conditions',async()=>{
 const f=await fixture(),saved=await f.admin(`admin/members/${f.brand.id}/packagings`,{spec,confirmed:true});await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id});
 const input=order(saved.data.id,f.supplier.id);await f.brand.api('orders',input);
 const quote={action:'quote',totalPrice:120000,deliveryDate:'2030-12-01',terms:'부가세·운송비 포함',version:1};
 assert.equal((await f.supplier.api(`orders/${input.id}`,quote,'PATCH')).status,400);
 assert.equal((await f.supplier.api(`orders/${input.id}`,{...quote,confirmed:true},'PATCH')).status,200);
 assert.equal((await f.brand.api(`orders/${input.id}`,{action:'approve',consent:true,version:2},'PATCH')).status,400);
 assert.equal((await f.brand.api(`orders/${input.id}`,{action:'approve',consent:true,confirmed:true,version:2},'PATCH')).status,200);
 const snapshot=(await f.brand.api(`orders/${input.id}`)).data.order.approved_snapshot;
 assert.equal(snapshot.proposal.totalPrice,120000);assert.equal(snapshot.packagingId,saved.data.id);assert.equal(snapshot.packagingVersion,1);assert.deepEqual(snapshot.spec,spec);
 assert.equal((await f.admin(`admin/members/${f.brand.id}/packagings/${saved.data.id}`,{spec:{...spec,name:'새 승인 사양'},version:1,confirmed:true},'PATCH')).status,200);
 assert.deepEqual((await f.brand.api(`orders/${input.id}`)).data.order.approved_snapshot,snapshot);
});

test('archiving invalidates stale drafts and concurrent edits or favorites cannot revive archived packaging',async()=>{
 const f=await fixture(),create=async()=>{
  const saved=await f.admin(`admin/members/${f.brand.id}/packagings`,{spec,confirmed:true});assert.equal(saved.status,201);return saved.data.id;
 };
 const archived=await create();
 assert.equal((await f.brand.api(`packagings/${archived}`,{favorite:true,version:1},'PATCH')).status,200);
 assert.equal(f.DB.raw.prepare('SELECT version FROM packagings WHERE id=?').get(archived).version,1);
 assert.equal((await f.brand.api(`packagings/${archived}`,{archived:true,version:1,confirmed:true},'PATCH')).status,200);
 const stored=f.DB.raw.prepare('SELECT archived,version FROM packagings WHERE id=?').get(archived);assert.equal(stored.archived,1);assert.equal(stored.version,2);
 assert.equal((await f.brand.api(`packagings/${archived}`,{favorite:false,version:1},'PATCH')).status,404);
 for(const admin of [false,true]){
  const id=await create();f.DB.beforeBatch=()=>f.DB.raw.prepare('UPDATE packagings SET archived=1 WHERE id=?').run(id);
  const result=admin?await f.admin(`admin/members/${f.brand.id}/packagings/${id}`,{spec:{...spec,name:'오래된 수정'},version:1,confirmed:true},'PATCH'):await f.brand.api(`packagings/${id}`,{spec:{...spec,name:'오래된 요청'},version:1,confirmed:true},'PATCH');
  assert.equal(result.status,409);assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM packaging_reviews WHERE packaging_id=?').get(id).n,0);
  const row=f.DB.raw.prepare('SELECT archived,spec FROM packagings WHERE id=?').get(id);assert.equal(row.archived,1);assert.deepEqual(JSON.parse(row.spec),spec);
 }
 const id=await create(),prepare=f.DB.prepare.bind(f.DB);let raced=false;
 f.DB.prepare=sql=>{const statement=prepare(sql);return {bind(...args){const bound=statement.bind(...args);if(sql.startsWith('UPDATE packagings SET favorite=')){const run=bound.run;bound.run=async()=>{raced=true;f.DB.raw.prepare('UPDATE packagings SET archived=1 WHERE id=?').run(id);return run();};}return bound;}};};
 assert.equal((await f.brand.api(`packagings/${id}`,{favorite:true,version:1},'PATCH')).status,409);assert.equal(raced,true);
 const row=f.DB.raw.prepare('SELECT archived,favorite FROM packagings WHERE id=?').get(id);assert.equal(row.archived,1);assert.equal(row.favorite,0);
});

test('monetary approval atomically rejects suspension of either party without a snapshot or approval event',async()=>{
 const f=await fixture(),saved=await f.admin(`admin/members/${f.brand.id}/packagings`,{spec,confirmed:true});await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id});
 for(const member of [f.supplier,f.brand]){
  const input=order(saved.data.id,f.supplier.id);assert.equal((await f.brand.api('orders',input)).status,201);
  assert.equal((await f.supplier.api(`orders/${input.id}`,{action:'quote',totalPrice:120000,deliveryDate:'2030-12-01',terms:'부가세 포함',version:1,confirmed:true},'PATCH')).status,200);
  f.DB.beforeBatch=()=>f.DB.raw.prepare("UPDATE members SET status='suspended' WHERE id=?").run(member.id);
  assert.equal((await f.brand.api(`orders/${input.id}`,{action:'approve',consent:true,confirmed:true,version:2},'PATCH')).status,409);
  const row=f.DB.raw.prepare('SELECT status,version,approved_snapshot FROM orders WHERE id=?').get(input.id);assert.equal(row.status,'quoted');assert.equal(row.version,2);assert.equal(row.approved_snapshot,null);
  assert.equal(f.DB.raw.prepare("SELECT count(*) AS n FROM order_events WHERE order_id=? AND action='브랜드 최종 승인'").get(input.id).n,0);
  f.DB.raw.prepare("UPDATE members SET status='approved' WHERE id=?").run(member.id);
 }
});

test('workflow migration preserves account, order and packaging data without inventing verification',()=>{
 const raw=new DatabaseSync(':memory:');for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')&&n<'0011_member_workflow.sql').sort())raw.exec(readFileSync(new URL(name,migrations),'utf8'));
 const brand=crypto.randomUUID(),packaging=crypto.randomUUID(),id=crypto.randomUUID(),time='2026-10-20T00:00:00.000Z';
 raw.prepare("INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(brand,'existing@example.test','hash','brand','individual','existing','contact','01000000000','approved','test',time,time);
 raw.prepare('INSERT INTO packagings(id,brand_id,spec,created_at,updated_at) VALUES(?,?,?,?,?)').run(packaging,brand,JSON.stringify(spec),time,time);
 raw.prepare('INSERT INTO orders(id,brand_id,spec,quantity,requested_date,address,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,brand,JSON.stringify(spec),1000,'2030-12-01','address','note',time,time);
 const before=raw.prepare('SELECT * FROM members').all(),oldOrder=raw.prepare('SELECT * FROM orders').get(),oldPackaging=raw.prepare('SELECT * FROM packagings').get();raw.exec(readFileSync(new URL('0011_member_workflow.sql',migrations),'utf8'));
 assert.deepEqual(raw.prepare('SELECT * FROM members').all(),before);const {packaging_id,packaging_version,...after}=raw.prepare('SELECT * FROM orders').get();assert.deepEqual(after,{...oldOrder});
 const {approval_status,...saved}=raw.prepare('SELECT * FROM packagings').get();assert.deepEqual(saved,{...oldPackaging});assert.equal(approval_status,'pending');assert.equal(raw.prepare('SELECT spec FROM packaging_reviews').get().spec,oldPackaging.spec);assert.equal(raw.prepare('SELECT count(*) AS n FROM member_companies').get().n,0);
});
