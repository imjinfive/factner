import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {randomToken,passwordHash} from './security.js';
import {legacyOrder,approvedPackaging} from './workflow-fixtures.js';

function database(){
 const raw=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())raw.exec(readFileSync(new URL(name,dir),'utf8'));
 return {raw,beforeBatch:null,prepare(sql){return {bind(...args){return {async first(){return raw.prepare(sql).get(...args)||null;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}};}};},async batch(items){this.beforeBatch?.();this.beforeBatch=null;raw.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());raw.exec('COMMIT');return result;}catch(error){raw.exec('ROLLBACK');throw error;}}};
}
function client(env){
 let cookie='';const host=env.APP_KIND==='admin'?'https://admin.example.test':'https://example.test';
 return async(path,data,method=data?'POST':'GET')=>{
  if(method==='PATCH'&&/^(admin\/)?orders\//.test(path)&&data.action!=='seen'&&data.confirmed===undefined)data={...data,confirmed:true};
  const response=await worker.fetch(new Request(`${host}/api/${path}`,{method,headers:{Origin:host,'Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':'partner-test'},body:data?JSON.stringify(data):undefined}),env);
  if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];
  return {status:response.status,data:await response.json()};
 };
}
const password='partner-test-password-123';
async function fixture(){
 const DB=database(),common={DB,BOOTSTRAP_TOKEN:randomToken()},admin=client({...common,APP_KIND:'admin'});
 await admin('auth/setup',{username:'owner',password,displayName:'테스트 운영자',setupToken:common.BOOTSTRAP_TOKEN});
 const hash=await passwordHash(password),members={};
 for(const [key,role] of [['brand','brand'],['supplier','supplier'],['otherBrand','brand'],['otherSupplier','supplier']]){
  const id=crypto.randomUUID(),email=`${key.toLowerCase()}@example.test`,time=new Date().toISOString();
  DB.raw.prepare("INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,email,hash,role,'individual',key,`${key} 담당자`,'010-0000-0000','approved','test',time,time);
  const api=client({...common,APP_KIND:'main'});assert.equal((await api('member/login',{email,password})).status,200);members[key]={id,api};
 }
 return {DB,common,admin,...members};
}
const orderInput=()=>({id:crypto.randomUUID(),spec:{name:'테스트 단상자',size:'60 × 60 × 80 mm',material:'종이',printing:'옵셋 인쇄',finish:'무광 코팅',description:'',files:[]},quantity:3000,requestedDate:'2030-12-01',address:'테스트 배송지',note:'가상 발주'});

test('partner migration preserves existing orders and marks only already shared cancelled history',()=>{
 const raw=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0008_member_partners.sql').sort())raw.exec(readFileSync(new URL(name,dir),'utf8'));
 const brand=crypto.randomUUID(),supplier=crypto.randomUUID(),created='2026-10-20T00:00:00.000Z',shared='2026-10-20T01:00:00.000Z';
 for(const [id,role] of [[brand,'brand'],[supplier,'supplier']])raw.prepare("INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,`${role}@example.test`,'unused',role,'individual',role,'담당자','01000000000','approved','test',created,created);
 const ids=[];
 for(const [i,status] of ['assigned','approved','cancelled','cancelled','matched'].entries()){
  const id=crypto.randomUUID();ids.push(id);
  raw.prepare('INSERT INTO orders(id,brand_id,supplier_id,spec,quantity,requested_date,address,note,status,approved_snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,brand,supplier,JSON.stringify(orderInput().spec),1000,'2030-12-01','가상 배송지','기존 기록',status,status==='approved'?JSON.stringify({supplierName:'승인 당시 업체',quantity:1000}):null,created,created);
  if(i<3)raw.prepare('INSERT INTO order_events VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,brand,'브랜드','업체 연결 및 제작 자료 전달 동의','{}',shared);
 }
 const before=raw.prepare('SELECT * FROM orders ORDER BY id').all(),events=raw.prepare('SELECT * FROM order_events ORDER BY id').all();
 raw.exec(readFileSync(new URL('0008_member_partners.sql',dir),'utf8'));
 const after=raw.prepare('SELECT * FROM orders ORDER BY id').all();assert.deepEqual(after.map(({shared_at,...row})=>row),before.map(row=>({...row})));
 assert.deepEqual(raw.prepare('SELECT * FROM order_events ORDER BY id').all(),events);
 assert.equal(raw.prepare('SELECT count(*) AS n FROM member_partners').get().n,0);
 for(const [i,id] of ids.entries())assert.equal(raw.prepare('SELECT shared_at FROM orders WHERE id=?').get(id).shared_at,i<3?shared:null);
});

test('partner management validates roles, approvals, owner access, uniqueness and member data isolation',async()=>{
 const {DB,common,admin,brand,supplier,otherBrand,otherSupplier}=await fixture();
 const anonymous=client({...common,APP_KIND:'main'});assert.equal((await anonymous('partners')).status,401);
 assert.equal((await brand.api('partners',{brandId:brand.id,supplierId:supplier.id})).status,404);
 assert.equal((await admin('admin/partners',{brandId:supplier.id,supplierId:brand.id})).status,400);
 DB.raw.prepare("UPDATE members SET status='pending' WHERE id=?").run(supplier.id);
 assert.equal((await admin('admin/partners',{brandId:brand.id,supplierId:supplier.id})).status,400);
 DB.raw.prepare("UPDATE members SET status='approved' WHERE id=?").run(supplier.id);
 const created=await admin('admin/partners',{brandId:brand.id,supplierId:supplier.id,note:'내부 확인 메모'});assert.equal(created.status,201);
 const duplicate=await admin('admin/partners',{brandId:brand.id,supplierId:supplier.id});assert.equal(duplicate.status,200);assert.equal(duplicate.data.id,created.data.id);
 await admin('admin/partners',{brandId:brand.id,supplierId:otherSupplier.id});
 const own=(await brand.api('partners')).data.partners;assert.equal(own.length,2);assert.ok(own.every(p=>p.available));
 const counterpart=(await supplier.api('partners')).data.partners[0];assert.equal(counterpart.partner_name,'brand');assert.equal(counterpart.partner_contact,'brand 담당자');assert.equal(counterpart.partner_phone,'010-0000-0000');assert.equal('events' in counterpart,false);assert.equal('email' in counterpart,false);assert.equal('password_hash' in counterpart,false);
 assert.equal((await otherBrand.api(`partners?memberId=${brand.id}`)).data.partners.length,0);
 const managed=(await admin(`admin/partners?memberId=${supplier.id}`)).data.partners;assert.equal(managed.length,1);assert.equal(managed[0].events.length,1);assert.equal(managed[0].events[0].note,'내부 확인 메모');
 assert.equal((await admin('admin/partners?memberId=invalid')).status,400);
 assert.equal((await admin(`admin/partners?memberId=${crypto.randomUUID()}`)).status,404);
 await admin('admin/users',{username:'staff',password,displayName:'직원'});const staff=client({...common,APP_KIND:'admin'});
 await staff('auth/login',{username:'staff',password});await staff('auth/password',{currentPassword:password,newPassword:'replacement-staff-1234'});await staff('auth/login',{username:'staff',password:'replacement-staff-1234'});
 assert.equal((await staff('admin/partners')).status,403);assert.equal((await staff('admin/partners',{brandId:otherBrand.id,supplierId:supplier.id})).status,403);
 assert.equal((await staff(`admin/partners/${created.data.id}`,{status:'ended',version:1},'PATCH')).status,403);
});

test('matched brand orders arrive with supplier and admin, preserve consent and remain visible after cancellation',async()=>{
 const {admin,brand,supplier,otherBrand,otherSupplier,DB}=await fixture();
 const match=(await admin('admin/partners',{brandId:brand.id,supplierId:supplier.id})).data;
 const base=orderInput(),input={...base,...await approvedPackaging(admin,brand.id,base.spec),supplierId:supplier.id};
 assert.equal((await brand.api('orders',{...input,supplierId:0,sharingConsent:true})).status,400);
 assert.equal((await brand.api('orders',input)).status,400);
 assert.equal((await otherBrand.api('orders',{...input,id:crypto.randomUUID(),sharingConsent:true})).status,409);
 const sent=await brand.api('orders',{...input,sharingConsent:true});assert.equal(sent.status,201);
 assert.equal((await brand.api('orders',{...input,sharingConsent:true})).status,200);
 const list=(await supplier.api('orders')).data;assert.equal(list.total,1);assert.equal(list.orders[0].id,input.id);assert.equal(list.orders[0].status,'assigned');assert.ok(list.orders[0].shared_at);
 assert.equal((await admin(`admin/orders?memberId=${brand.id}`)).data.total,1);
 assert.equal((await otherSupplier.api(`orders/${input.id}`)).status,404);
 const detail=(await supplier.api(`orders/${input.id}`)).data;assert.equal(detail.events[0].details.sharing.consent,true);assert.equal(detail.events[0].details.sharing.partnerId,match.id);
 const manual=orderInput();legacyOrder(DB,brand.id,manual);assert.equal((await supplier.api('orders')).data.total,1);
 assert.equal((await admin(`admin/partners/${match.id}`,{status:'ended',version:1,note:'테스트 종료'},'PATCH')).status,200);
 assert.equal((await brand.api('orders',{...input,id:crypto.randomUUID(),sharingConsent:true})).status,409);
 assert.equal((await supplier.api(`orders/${input.id}`)).status,200);
 assert.equal((await brand.api(`orders/${input.id}`,{action:'cancel',version:1,message:'테스트 취소'},'PATCH')).status,200);
 assert.equal((await supplier.api('orders')).data.total,1);assert.equal((await supplier.api(`orders/${input.id}`)).data.order.status,'cancelled');
 assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,2);
 assert.equal((await admin(`admin/partners/${match.id}`,{status:'active',version:1},'PATCH')).status,409);
 assert.equal((await admin('admin/partners',{brandId:brand.id,supplierId:supplier.id})).status,409);
 assert.equal((await admin(`admin/partners/${match.id}`,{status:'active',version:2},'PATCH')).status,200);
 assert.equal((await brand.api('orders',{...input,id:crypto.randomUUID(),sharingConsent:true})).status,201);
 DB.raw.prepare("UPDATE members SET status='suspended' WHERE id=?").run(supplier.id);
 assert.equal((await brand.api('partners')).data.partners[0].available,false);
 assert.equal((await brand.api('orders',{...input,id:crypto.randomUUID(),sharingConsent:true})).status,409);
});

test('matching and direct dispatch recheck eligibility inside the write transaction',async()=>{
 const {admin,brand,supplier,DB}=await fixture();
 DB.beforeBatch=()=>DB.raw.prepare("UPDATE members SET status='suspended' WHERE id=?").run(supplier.id);
 assert.equal((await admin('admin/partners',{brandId:brand.id,supplierId:supplier.id})).status,409);
 assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM member_partners').get().n,0);assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM member_partner_events').get().n,0);
 DB.raw.prepare("UPDATE members SET status='approved' WHERE id=?").run(supplier.id);
 const match=(await admin('admin/partners',{brandId:brand.id,supplierId:supplier.id})).data;
 const base=orderInput(),input={...base,...await approvedPackaging(admin,brand.id,base.spec),supplierId:supplier.id,sharingConsent:true};
 DB.beforeBatch=()=>DB.raw.prepare("UPDATE member_partners SET status='ended' WHERE id=?").run(match.id);
 assert.equal((await brand.api('orders',input)).status,409);
 assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,0);assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM order_events').get().n,0);
});
