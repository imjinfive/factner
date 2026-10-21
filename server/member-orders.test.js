import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {randomToken} from './security.js';

function database(){
 const raw=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())raw.exec(readFileSync(new URL(name,dir),'utf8'));
 return {raw,prepare(sql){return {bind(...values){const args=values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return {async first(){const row=raw.prepare(sql).get(...args)||null;if(row?.content instanceof Uint8Array)row.content=Array.from(row.content);return row;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}};}};},async batch(items){raw.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}}};
}
function client(env){
 let cookie='';const host=env.APP_KIND==='admin'?'https://admin.example.test':'https://example.test';
 return async(path,data,method=data?'POST':'GET',headers={})=>{
  const response=await worker.fetch(new Request(`${host}/api/${path}`,{method,headers:{Origin:host,'Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':'test-ip',...headers},body:data?JSON.stringify(data):undefined}),env);
  if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];
  const json=response.headers.get('Content-Type')?.includes('application/json');return {status:response.status,data:json?await response.json():new Uint8Array(await response.arrayBuffer()),headers:response.headers};
 };
}
const password='test-only-password-1234';
const png={name:'sample.png',mime:'image/png',kind:'workplace',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ZkAAAAASUVORK5CYII='};
const certificate={name:'certificate.pdf',mime:'application/pdf',kind:'certificate',data:btoa('%PDF-1.4\nTest certificate only\n%%EOF')};
const signup=(email,role='brand')=>({email,password,role,legalType:'individual',name:email.split('@')[0],contact:'테스트 담당자',phone:'010-0000-0000',files:[png],consent:true,testOnly:true,consentVersion:'member-pilot-2026-10-21'});
async function fixture(){
 const DB=database(),common={DB,BOOTSTRAP_TOKEN:randomToken()},admin=client({...common,APP_KIND:'admin'}),brand=client({...common,APP_KIND:'main'}),supplier=client({...common,APP_KIND:'main'}),other=client({...common,APP_KIND:'main'});
 assert.equal((await admin('auth/setup',{username:'owner',password,displayName:'테스트 운영자',setupToken:common.BOOTSTRAP_TOKEN})).status,200);
 return {DB,common,admin,brand,supplier,other};
}
async function approve(admin,client,email,role='brand'){
 assert.equal((await client('member/register',signup(email,role))).status,201);
 const list=await admin(`admin/members?q=${encodeURIComponent(email)}`),member=list.data.members[0];
 assert.equal((await admin(`admin/members/${member.id}`,{status:'approved',note:'테스트 자료 확인',version:member.version},'PATCH')).status,200);
 assert.equal((await client('member/login',{email,password})).status,200);return member.id;
}
const spec=files=>({name:'수분크림 단상자',size:'60 × 60 × 80 mm',material:'종이 350g',printing:'로고 1도',finish:'무광',description:'샘플 기준',files});
const request=(s)=>({id:crypto.randomUUID(),spec:s,quantity:3000,requestedDate:'2030-06-30',address:'테스트 배송지',note:'샘플과 동일하게 제작'});

test('signup requires business documents, consent, private review and explicit approval before login',async()=>{
 const {admin,brand,supplier,DB,common}=await fixture();
 assert.equal((await brand('member/register',{...signup('brand@test.test'),legalType:'corporate',businessNumber:'123-45-67890'})).status,400);
 assert.equal((await brand('member/register',{...signup('brand@test.test'),testOnly:false})).status,400);
 assert.equal((await brand('member/register',{...signup('brand@test.test'),legalType:'sole',businessNumber:'1234',files:[certificate]})).status,400);
 assert.equal((await brand('member/register',{...signup('brand@test.test'),legalType:'sole',businessNumber:'123-45-67890',files:[certificate,png]})).status,201);
 const pending=await brand('member/login',{email:'brand@test.test',password});assert.equal(pending.status,403);assert.equal(pending.data.status,'pending');assert.equal(pending.headers.has('Set-Cookie'),false);
 assert.equal((await brand('member/me')).status,401);assert.equal((await brand('packagings')).status,401);
 const list=await admin('admin/members');const m=list.data.members[0];assert.equal('password_hash' in m,false);
 const detail=await admin(`admin/members/${m.id}`);assert.equal(detail.data.files.length,2);
 const cert=detail.data.files.find(f=>f.kind==='certificate');assert.equal((await brand(`member/files/${cert.id}`)).status,401);
 const pdf=await admin(`admin/members/files/${cert.id}`);assert.equal(pdf.status,200);assert.equal(new TextDecoder().decode(pdf.data).slice(0,5),'%PDF-');assert.match(pdf.headers.get('Content-Disposition'),/^attachment/);assert.equal(pdf.headers.get('Cache-Control'),'no-store');
 assert.equal((await admin(`admin/members/${m.id}`,{status:'approved',version:1,note:'확인'},'PATCH')).status,200);
 assert.equal((await admin(`admin/members/${m.id}`,{status:'rejected',version:1,note:'오래된 요청'},'PATCH')).status,409);
 assert.equal((await brand('member/login',{email:'brand@test.test',password})).status,200);
 assert.equal((await brand(`member/files/${cert.id}`)).status,200);
 await approve(admin,supplier,'supplier@test.test','supplier');assert.equal((await supplier(`member/files/${cert.id}`)).status,404);
 const invalid=await brand('member/files',{...png,kind:'design',data:btoa('<script>bad</script>')});assert.equal(invalid.status,400);
 assert.equal((await brand('member/files',{...png,kind:'certificate'})).status,400);
 assert.equal((await brand('member/logout',{},'POST',{Origin:'https://evil.test'})).status,403);
 assert.equal(DB.raw.prepare('SELECT count(*) n FROM member_reviews WHERE member_id=?').get(m.id).n,1);
 const stranger=client({...common,APP_KIND:'main'});assert.equal((await stranger(`admin/members/${m.id}`)).status,404);
});

test('full order workflow isolates accounts, shares only after consent, preserves approved snapshots and supports repeat requests',async()=>{
 const {admin,brand,supplier,other,DB}=await fixture();
 const brandId=await approve(admin,brand,'brand@test.test'),supplierId=await approve(admin,supplier,'supplier@test.test','supplier');await approve(admin,other,'other@test.test');
 const uploaded=await brand('member/files',{...png,kind:'design'});assert.equal(uploaded.status,201);const file=uploaded.data.file;
 assert.equal((await other(`member/files/${file.id}`)).status,404);
 const saved=await brand('packagings',{spec:spec([file]),favorite:true});assert.equal(saved.status,201);
 assert.equal((await supplier('packagings',{spec:spec([])})).status,403);
 assert.equal((await other('packagings',{spec:spec([file])})).status,400);
 assert.equal((await brand('packagings',{spec:spec([null])})).status,400);
 const input=request(spec([file]));assert.equal((await brand('orders',input)).status,201);assert.equal((await brand('orders',input)).status,200);
 assert.equal((await brand('orders')).data.total,1);assert.equal((await other('orders')).data.total,0);
 assert.equal((await other(`orders/${input.id}`)).status,404);
 assert.equal((await admin(`admin/orders/${input.id}`,{action:'assign',supplierId,version:1},'PATCH')).status,200);
 assert.equal((await supplier('orders')).data.total,0);assert.equal((await supplier(`orders/${input.id}`)).status,404);assert.equal((await supplier(`member/files/${file.id}`)).status,404);
 assert.equal((await brand(`orders/${input.id}`,{action:'share',version:2,consent:true},'PATCH')).status,200);
 assert.equal((await supplier(`member/files/${file.id}`)).status,200);
 let o=(await supplier(`orders/${input.id}`)).data.order;
 assert.equal((await supplier(`orders/${input.id}`,{action:'produce',version:o.version},'PATCH')).status,409);
 const quote={action:'quote',totalPrice:650000,deliveryDate:'2030-06-29',terms:'부가세·배송비 포함. 샘플 기준.',version:o.version};
 assert.equal((await supplier(`orders/${input.id}`,quote,'PATCH')).status,200);
 assert.equal((await supplier(`orders/${input.id}`,quote,'PATCH')).status,409);
 o=(await brand(`orders/${input.id}`)).data.order;
 assert.equal((await brand(`orders/${input.id}`,{action:'approve',consent:true,version:o.version-1},'PATCH')).status,409);
 assert.equal((await brand(`orders/${input.id}`,{action:'approve',consent:true,version:o.version},'PATCH')).status,200);
 const snapshot=(await brand(`orders/${input.id}`)).data.order.approved_snapshot;
 assert.equal(snapshot.proposal.totalPrice,650000);assert.equal(snapshot.spec.files[0].id,file.id);assert.equal(snapshot.approvedBy,brandId);
 assert.equal((await brand(`packagings/${saved.data.id}`,{spec:{...spec([]),name:'새 로고 패키징'},version:1},'PATCH')).status,200);
 assert.deepEqual((await brand(`orders/${input.id}`)).data.order.approved_snapshot,snapshot);
 assert.equal((await other(`packagings/${saved.data.id}`,{favorite:false,version:2},'PATCH')).status,404);
 o=(await supplier(`orders/${input.id}`)).data.order;
 assert.equal((await supplier(`orders/${input.id}`,{...quote,version:o.version},'PATCH')).status,409);
 assert.equal((await brand(`orders/${input.id}`,{action:'cancel',version:o.version,message:'확정 후 취소 시도'},'PATCH')).status,409);
 assert.equal((await supplier(`orders/${input.id}`,{action:'produce',version:o.version},'PATCH')).status,200);
 o=(await supplier(`orders/${input.id}`)).data.order;
 assert.equal((await supplier(`orders/${input.id}`,{action:'ship',version:o.version,carrier:'테스트 택배',tracking:'TEST-1234'},'PATCH')).status,200);
 o=(await brand(`orders/${input.id}`)).data.order;
 assert.equal((await brand(`orders/${input.id}`,{action:'receive',version:o.version},'PATCH')).status,200);
 const repeat={...request(snapshot.spec),sourceId:input.id,quantity:5000};assert.equal((await brand('orders',repeat)).status,201);
 const second=(await brand(`orders/${repeat.id}`)).data.order;assert.equal(second.status,'requested');assert.equal(second.proposal,null);assert.equal(second.approved_snapshot,null);assert.equal(second.supplier_id,null);
 const final=(await admin(`admin/orders/${input.id}`)).data;assert.equal(final.order.status,'received');assert.equal(final.events.length,8);assert.equal(final.events.filter(e=>e.action==='브랜드 최종 승인').length,1);
 assert.equal(DB.raw.prepare('SELECT count(*) n FROM order_files').get().n,2);
});

test('quote revision logs old terms, supplier cannot approve, and suspension immediately revokes sessions',async()=>{
 const {admin,brand,supplier}=await fixture();await approve(admin,brand,'brand@test.test');const sid=await approve(admin,supplier,'supplier@test.test','supplier');
 const input=request(spec([]));await brand('orders',input);await admin(`admin/orders/${input.id}`,{action:'assign',supplierId:sid,version:1},'PATCH');await brand(`orders/${input.id}`,{action:'share',version:2,consent:true},'PATCH');
 assert.equal((await supplier(`orders/${input.id}`,{action:'quote',totalPrice:-1,deliveryDate:'2030-02-31',terms:'조건',version:3},'PATCH')).status,400);
 await supplier(`orders/${input.id}`,{action:'quote',totalPrice:100000,deliveryDate:'2030-05-01',terms:'첫 견적',version:3},'PATCH');
 assert.equal((await supplier(`orders/${input.id}`,{action:'approve',version:4,consent:true},'PATCH')).status,409);
 assert.equal((await brand(`orders/${input.id}`,{action:'revise',version:4,message:'납기 조정 부탁드립니다.'},'PATCH')).status,200);
 const detail=(await brand(`orders/${input.id}`)).data;assert.equal(detail.order.status,'assigned');assert.equal(detail.order.proposal,null);assert.equal(detail.events.find(e=>e.action==='업체 견적 제안').details.totalPrice,100000);
 assert.equal((await admin(`admin/members/${sid}`,{status:'suspended',version:2,note:'테스트 이용 중지'},'PATCH')).status,200);
 assert.equal((await supplier(`orders/${input.id}`)).status,401);assert.equal((await supplier('member/login',{email:'supplier@test.test',password})).status,403);
});

test('password changes invalidate all member sessions without affecting admin sessions',async()=>{
 const {admin,brand,common}=await fixture();await approve(admin,brand,'brand@test.test');const second=client({...common,APP_KIND:'main'});
 await second('member/login',{email:'brand@test.test',password});
 assert.equal((await brand('member/password',{currentPassword:'wrong',newPassword:'replacement-password-123'})).status,400);
 assert.equal((await brand('member/password',{currentPassword:password,newPassword:'replacement-password-123'})).status,200);
 assert.equal((await second('member/me')).status,401);assert.equal((await brand('member/me')).status,401);assert.equal((await admin('admin/members')).status,200);
 assert.equal((await brand('member/login',{email:'brand@test.test',password:'replacement-password-123'})).status,200);
});

test('member management searches literal text and normalized numbers, combines filters and paginates without losing counts',async()=>{
 const {admin,DB}=await fixture();
 const insert=DB.raw.prepare('INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,business_number,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const seed=(overrides={})=>{
  const m={id:crypto.randomUUID(),email:`${crypto.randomUUID()}@test.test`,role:'brand',legal:'individual',name:'관리 브랜드',contact:'담당자',phone:'010-0000-0000',number:'',status:'pending',date:'2026-10-21T00:00:00.000Z',...overrides};
  insert.run(m.id,m.email,'unused-test-hash',m.role,m.legal,m.name,m.contact,m.phone,m.number,m.status,'test',m.date,m.date);return m;
 };
 const target=seed({name:'관리 100%_\\브랜드',email:'literal-brand@test.test',contact:'김담당',phone:'010-1234-5678',number:'1234567890',legal:'corporate',status:'approved'});
 seed({name:'관리 100XX브랜드',role:'supplier',legal:'sole',status:'pending'});
 seed({status:'rejected'});seed({status:'suspended'});
 const find=async(q,suffix='')=>{const r=await admin(`admin/members?q=${encodeURIComponent(q)}${suffix}`);assert.equal(r.status,200);return r.data;};
 for(const q of ['100%','_','\\','김담당','literal-brand@','01012345678','010 1234 5678','123-45-67890']){
  const data=await find(q);assert.deepEqual(data.members.map(m=>m.id),[target.id],q);assert.equal(data.total,1,q);
 }
 const all=await find('관리');assert.equal(all.total,4);assert.deepEqual(all.counts,{all:4,pending:1,approved:1,rejected:1,suspended:1});
 const brands=await find('관리','&role=brand&status=approved');assert.equal(brands.total,1);assert.deepEqual(brands.counts,{all:3,pending:0,approved:1,rejected:1,suspended:1});
 const corporate=await find('관리','&role=brand&legalType=corporate&status=pending');assert.equal(corporate.total,0);assert.deepEqual(corporate.counts,{all:1,pending:0,approved:1,rejected:0,suspended:0});
 for(const filter of ['role=owner','legalType=unknown','status=deleted'])assert.equal((await admin(`admin/members?${filter}`)).status,400,filter);
 for(let i=0;i<32;i++)seed({name:`페이지 ${i}`,date:new Date(Date.UTC(2026,9,21,0,i)).toISOString()});
 const first=await find('페이지','&page=1'),second=await find('페이지','&page=2');
 assert.equal(first.total,32);assert.equal(first.members.length,30);assert.equal(second.members.length,2);assert.equal(second.page,2);assert.equal(second.counts.all,32);
 assert.equal(new Set([...first.members,...second.members].map(m=>m.id)).size,32);
 assert.ok(first.members.every(m=>!('password_hash' in m)&&!('consent_version' in m)));
});

test('member management remains owner-only while ordinary administrators can manage orders',async()=>{
 const {admin,brand,common}=await fixture();const id=await approve(admin,brand,'managed@test.test');
 const file=(await admin(`admin/members/${id}`)).data.files[0];
 assert.equal((await admin('admin/users',{username:'staff',password,displayName:'테스트 직원'})).status,201);
 const staff=client({...common,APP_KIND:'admin'}),nextPassword='staff-replacement-password-123';
 assert.equal((await staff('auth/login',{username:'staff',password})).status,200);
 assert.equal((await staff('auth/password',{currentPassword:password,newPassword:nextPassword})).status,200);
 assert.equal((await staff('auth/login',{username:'staff',password:nextPassword})).status,200);
 assert.equal((await staff('admin/orders')).status,200);
 for(const path of ['admin/members',`admin/members/${id}`,`admin/members/files/${file.id}`])assert.equal((await staff(path)).status,403,path);
 assert.equal((await staff(`admin/members/${id}`,{status:'suspended',version:2,note:'허용되지 않은 변경'},'PATCH')).status,403);
 assert.equal((await brand('member/me')).status,200);
});

test('member order summaries and filters preserve ownership and history across suspension and reactivation',async()=>{
 const {admin,brand,supplier,other,DB,common}=await fixture();
 const bid=await approve(admin,brand,'managed-brand@test.test'),sid=await approve(admin,supplier,'managed-supplier@test.test','supplier'),oid=await approve(admin,other,'other-brand@test.test');
 const states=['producing','received','cancelled'],ids=[];
 for(const status of states){
  const input=request(spec([]));assert.equal((await brand('orders',input)).status,201);ids.push(input.id);
  DB.raw.prepare('UPDATE orders SET supplier_id=?,status=?,approved_snapshot=? WHERE id=?').run(sid,status,JSON.stringify({spec:input.spec,quantity:input.quantity,proposal:{totalPrice:650000}}),input.id);
 }
 const unrelated=request(spec([]));assert.equal((await other('orders',unrelated)).status,201);
 for(const id of [bid,sid]){
  const detail=await admin(`admin/members/${id}`);assert.deepEqual(detail.data.orderCounts,{total:3,active:1,received:1,cancelled:1});
  const list=await admin(`admin/orders?memberId=${id}`);assert.equal(list.status,200);assert.equal(list.data.total,3);assert.deepEqual(new Set(list.data.orders.map(o=>o.id)),new Set(ids));
 }
 assert.deepEqual((await admin(`admin/members/${oid}`)).data.orderCounts,{total:1,active:1,received:0,cancelled:0});
 assert.equal((await admin(`admin/orders?memberId=${bid}&status=received`)).data.total,1);
 assert.equal((await admin('admin/orders?memberId=not-a-uuid')).status,400);
 assert.equal((await admin(`admin/orders?memberId=${crypto.randomUUID()}`)).status,404);
 const own=await other(`orders?memberId=${bid}`);assert.equal(own.data.total,1);assert.equal(own.data.orders[0].id,unrelated.id);
 const supplierOwn=await supplier(`orders?memberId=${oid}`);assert.equal(supplierOwn.data.total,2);assert.ok(supplierOwn.data.orders.every(o=>o.supplier_id===sid));
 const oldSession=client({...common,APP_KIND:'main'});assert.equal((await oldSession('member/login',{email:'managed-brand@test.test',password})).status,200);
 const before=DB.raw.prepare('SELECT * FROM orders ORDER BY id').all();
 assert.equal((await admin(`admin/members/${bid}`,{status:'suspended',version:2,note:'상태 변경 검증'},'PATCH')).status,200);
 assert.equal((await oldSession('orders')).status,401);
 assert.equal((await admin(`admin/members/${bid}`,{status:'approved',version:3,note:'이용 재개'},'PATCH')).status,200);
 assert.equal((await oldSession('orders')).status,401);
 assert.equal((await brand('member/login',{email:'managed-brand@test.test',password})).status,200);
 assert.equal((await brand('orders')).data.total,3);
 assert.deepEqual(DB.raw.prepare('SELECT * FROM orders ORDER BY id').all(),before);
 const reviews=(await admin(`admin/members/${bid}`)).data.reviews;assert.equal(reviews.length,3);assert.deepEqual(reviews.map(r=>r.status),['approved','suspended','approved']);
});
