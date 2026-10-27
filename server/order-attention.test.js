import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {orderAttention} from './orders.js';
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
  const response=await worker.fetch(new Request(`${host}/api/${path}`,{method,headers:{Origin:host,'Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':'attention-test'},body:data?JSON.stringify(data):undefined}),env);
  if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];
  return {status:response.status,data:await response.json()};
 };
}
const password='attention-test-password-123';
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

async function direct(f){
 await f.admin('admin/partners',{brandId:f.brand.id,supplierId:f.supplier.id});
 const base=orderInput(),input={...base,...await approvedPackaging(f.admin,f.brand.id,base.spec),supplierId:f.supplier.id,sharingConsent:true};
 assert.equal((await f.brand.api('orders',input)).status,201);return input.id;
}
async function get(f,id){return (await f.supplier.api(`orders/${id}`)).data.order;}

test('attention migration preserves every existing field and starts only shared pending response rounds',()=>{
 const raw=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url);
 for(const n of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0009_order_attention.sql').sort())raw.exec(readFileSync(new URL(n,dir),'utf8'));
 const brand=crypto.randomUUID(),supplier=crypto.randomUUID(),created='2026-10-20T00:00:00.000Z',shared='2026-10-20T01:00:00.000Z',revised='2026-10-21T01:00:00.000Z';
 for(const [id,role] of [[brand,'brand'],[supplier,'supplier']])raw.prepare("INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,`${role}@example.test`,'unused',role,'individual',role,'담당자','01000000000','approved','test',created,created);
 const ids=[];
 for(const [index,status] of ['assigned','assigned','quoted','approved','cancelled','matched'].entries()){
  const id=crypto.randomUUID();ids.push(id);
  raw.prepare('INSERT INTO orders(id,brand_id,supplier_id,spec,quantity,requested_date,address,note,status,approved_snapshot,shared_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,brand,supplier,JSON.stringify(orderInput().spec),1000,'2030-12-01','private address','private note',status,status==='approved'?'{"quantity":1000}':null,status==='matched'?null:shared,created,created);
  if(index===0){
   raw.prepare('INSERT INTO order_events VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,brand,'브랜드','조건 재확인 요청','{}',revised);
   raw.prepare('INSERT INTO order_events VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,brand,'브랜드','문의·진행 안내','{}','2026-10-21T02:00:00.000Z');
  }
 }
 const before=raw.prepare('SELECT * FROM orders ORDER BY id').all(),events=raw.prepare('SELECT * FROM order_events ORDER BY id').all();
 raw.exec(readFileSync(new URL('0009_order_attention.sql',dir),'utf8'));
 const after=raw.prepare('SELECT * FROM orders ORDER BY id').all();assert.deepEqual(after.map(({supplier_seen_at,response_requested_at,...r})=>r),before.map(r=>({...r})));
 assert.deepEqual(raw.prepare('SELECT * FROM order_events ORDER BY id').all(),events);
 ids.forEach((id,i)=>{const row=raw.prepare('SELECT * FROM orders WHERE id=?').get(id);assert.equal(row.supplier_seen_at,null);assert.equal(row.response_requested_at,i===0?revised:i===1?shared:null);});
});

test('attention persists without reads and both delivery paths enforce supplier isolation',async()=>{
 const f=await fixture(),id=await direct(f),anonymous=client({...f.common,APP_KIND:'main'});
 assert.equal((await anonymous('orders/attention')).status,401);assert.equal((await f.brand.api('orders/attention')).status,403);
 assert.equal((await f.otherSupplier.api(`orders/attention?memberId=${f.supplier.id}`)).data.pending,0);
 let summary=(await f.supplier.api('orders/attention')).data;
 assert.equal(summary.unread,1);assert.equal(summary.overdue,0);assert.equal(summary.responseHours,24);assert.equal(summary.items[0].id,id);
 assert.ok(summary.items[0].response_due_at);assert.equal('address' in summary.items[0],false);assert.equal('files' in summary.items[0],false);assert.equal('supplier_id' in summary.items[0],false);
 assert.equal((await get(f,id)).unread,true);assert.equal((await f.admin(`admin/orders/${id}`)).data.order.unread,true);assert.equal((await f.supplier.api('orders/attention')).data.unread,1);
 assert.equal((await f.otherSupplier.api(`orders/${id}`,{action:'seen',responseRequestedAt:summary.items[0].response_requested_at},'PATCH')).status,404);
 const manual=orderInput();legacyOrder(f.DB,f.brand.id,manual);await f.admin(`admin/orders/${manual.id}`,{action:'assign',version:1,supplierId:f.supplier.id},'PATCH');
 assert.equal((await f.supplier.api('orders/attention')).data.pending,1);
 assert.equal((await f.brand.api(`orders/${manual.id}`,{action:'share',version:2,consent:true},'PATCH')).status,200);
 const delivered=await get(f,manual.id);assert.equal(delivered.response_requested_at,delivered.shared_at);assert.equal(delivered.unread,true);
 assert.equal((await f.supplier.api('orders/attention')).data.pending,2);assert.equal((await f.admin('admin/orders/attention')).data.pending,2);
 assert.equal((await f.admin(`admin/orders/attention?memberId=${f.otherBrand.id}`)).data.pending,0);
 assert.equal((await f.admin('admin/orders/attention?memberId=invalid')).status,400);
 assert.equal((await f.admin(`admin/orders/attention?memberId=${crypto.randomUUID()}`)).status,404);
});

test('acknowledgment is idempotent, audited once and never invalidates a quote draft or approves production',async()=>{
 const f=await fixture(),id=await direct(f),before=await get(f,id),input={action:'seen',responseRequestedAt:before.response_requested_at};
 assert.equal((await f.brand.api(`orders/${id}`,input,'PATCH')).status,403);assert.equal((await f.admin(`admin/orders/${id}`,input,'PATCH')).status,403);
 const ack=await f.supplier.api(`orders/${id}`,input,'PATCH');assert.equal(ack.status,200);assert.ok(ack.data.supplier_seen_at);
 assert.equal((await f.supplier.api(`orders/${id}`,input,'PATCH')).data.supplier_seen_at,ack.data.supplier_seen_at);
 const after=await get(f,id);assert.equal(after.version,before.version);assert.equal(after.updated_at,before.updated_at);assert.equal(after.status,'assigned');assert.equal(after.unread,false);
 assert.equal(f.DB.raw.prepare("SELECT count(*) AS n FROM order_events WHERE order_id=? AND action='제작 업체 발주 확인'").get(id).n,1);
 assert.equal((await f.supplier.api('orders/attention')).data.unread,0);assert.equal((await f.supplier.api('orders/attention')).data.pending,1);
 assert.equal((await f.supplier.api(`orders/${id}`,{action:'quote',version:before.version,totalPrice:10000,deliveryDate:'2030-12-01',terms:'테스트 조건'},'PATCH')).status,200);
 assert.equal((await f.supplier.api('orders/attention')).data.pending,0);
 assert.equal((await get(f,id)).supplier_seen_at,ack.data.supplier_seen_at);
});

test('response delay uses a full 24 hours and counts all orders beyond the displayed page',async()=>{
 const f=await fixture(),id=await direct(f),time='2026-10-22T00:00:00.000Z';
 const row={status:'assigned',supplier_id:f.supplier.id,shared_at:'2026-10-21T00:00:00.000Z',response_requested_at:'2026-10-21T00:00:00.000Z',supplier_seen_at:null};
 assert.equal(orderAttention(row,'2026-10-21T23:59:59.999Z').overdue,false);assert.equal(orderAttention(row,time).overdue,true);
 assert.equal(orderAttention({...row,status:'cancelled'},time).overdue,false);assert.equal(orderAttention({...row,supplier_seen_at:time},time).unread,false);assert.equal(orderAttention({...row,supplier_seen_at:time},time).overdue,true);
 const past=new Date(Date.now()-25*3600000).toISOString(),base=await get(f,id);
 f.DB.raw.prepare('UPDATE orders SET response_requested_at=? WHERE id=?').run(past,id);
 for(let i=0;i<34;i++)f.DB.raw.prepare('INSERT INTO orders(id,brand_id,supplier_id,spec,quantity,requested_date,address,note,status,shared_at,response_requested_at,supplier_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),f.brand.id,f.supplier.id,JSON.stringify(base.spec),100,'2030-12-01','private address','private note','assigned',past,past,i<2?past:null,past,past);
 const summary=(await f.supplier.api('orders/attention')).data;assert.equal(summary.pending,35);assert.equal(summary.overdue,35);assert.equal(summary.unread,33);assert.equal(summary.items.length,20);
 assert.ok(summary.items.every(o=>o.overdue&&o.unread));
 const list=(await f.admin('admin/orders?attention=unread')).data;assert.equal(list.total,33);assert.equal(list.orders.length,30);assert.ok(list.orders.every(o=>o.unread));
 assert.equal((await f.admin('admin/orders?attention=overdue&page=2')).data.orders.length,5);
 assert.equal((await f.admin(`admin/orders?attention=overdue&memberId=${f.otherSupplier.id}`)).data.total,0);
 assert.equal((await f.admin('admin/orders?attention=invalid')).status,400);
 assert.equal((await f.supplier.api(`orders/${id}`,{action:'message',version:base.version,message:'문의 답변은 견적이 아닙니다.'},'PATCH')).status,200);
 assert.equal((await get(f,id)).response_requested_at,past);assert.equal((await f.supplier.api('orders/attention')).data.overdue,35);
 const newest=await direct(f),latest=(await f.supplier.api('orders/attention')).data;assert.equal(latest.pending,36);assert.equal(latest.latestUnread.id,newest);assert.equal(latest.latestUnread.unread,true);assert.equal(latest.items.some(o=>o.id===newest),false);
});

test('revision starts a new unread round and stale or racing acknowledgments cannot consume it',async()=>{
 const f=await fixture(),id=await direct(f),past=new Date(Date.now()-25*3600000).toISOString();
 f.DB.raw.prepare('UPDATE orders SET response_requested_at=? WHERE id=?').run(past,id);
 let row=await get(f,id);assert.equal((await f.supplier.api(`orders/${id}`,{action:'quote',version:row.version,totalPrice:10000,deliveryDate:'2030-12-01',terms:'테스트 조건'},'PATCH')).status,200);
 row=await get(f,id);assert.ok(row.supplier_seen_at);assert.equal((await f.brand.api(`orders/${id}`,{action:'revise',version:row.version,message:'수량 확인해주세요.'},'PATCH')).status,200);
 row=await get(f,id);assert.equal(row.unread,true);assert.equal(row.overdue,false);assert.notEqual(row.response_requested_at,past);
 assert.equal((await f.supplier.api(`orders/${id}`,{action:'seen',responseRequestedAt:past},'PATCH')).status,409);assert.equal((await get(f,id)).unread,true);
 const next=new Date(Date.parse(row.response_requested_at)+1000).toISOString();f.DB.beforeBatch=()=>f.DB.raw.prepare('UPDATE orders SET response_requested_at=?,supplier_seen_at=NULL WHERE id=?').run(next,id);
 assert.equal((await f.supplier.api(`orders/${id}`,{action:'seen',responseRequestedAt:row.response_requested_at},'PATCH')).status,409);
 assert.equal((await get(f,id)).unread,true);assert.equal(f.DB.raw.prepare("SELECT count(*) AS n FROM order_events WHERE order_id=? AND action='제작 업체 발주 확인'").get(id).n,0);
 row=await get(f,id);await f.brand.api(`orders/${id}`,{action:'cancel',version:row.version,message:'검증용 취소'},'PATCH');assert.equal((await f.supplier.api('orders/attention')).data.pending,0);
});

test('a new response round gets a distinct token even inside the same millisecond',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-21T00:00:00.000Z')});
 const f=await fixture(),id=await direct(f),first=await get(f,id);
 assert.equal((await f.supplier.api(`orders/${id}`,{action:'quote',version:first.version,totalPrice:10000,deliveryDate:'2030-12-01',terms:'테스트 조건'},'PATCH')).status,200);
 const quoted=await get(f,id);assert.equal((await f.brand.api(`orders/${id}`,{action:'revise',version:quoted.version,message:'수량 확인'},'PATCH')).status,200);
 const revised=await get(f,id);assert.equal(Date.parse(revised.response_requested_at),Date.parse(first.response_requested_at)+1);
 assert.equal((await f.supplier.api(`orders/${id}`,{action:'seen',responseRequestedAt:first.response_requested_at},'PATCH')).status,409);assert.equal((await get(f,id)).unread,true);
});
