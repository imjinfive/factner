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
