import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from './worker.js';
import {digest,randomToken} from './security.js';
import {marketApi} from './bid-market.js';

const date='2026-11-02T01:00:00.000Z',policy='published-member-terms',base='/api/admin/market/posts';
const tiers=[{quantity:500,unitPrice:240},{quantity:1000,unitPrice:200}];
async function fixture(t){
 const raw=new DatabaseSync(':memory:');t.after(()=>raw.close());
 const dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())raw.exec(readFileSync(new URL(name,dir),'utf8'));
 const DB={prepare(sql){return {bind(...args){const s=raw.prepare(sql);return {
   first:()=>s.get(...args),all:()=>({results:s.all(...args)}),run:()=>({meta:{changes:s.run(...args).changes}})};}};},
   async batch(items){this.beforeBatch?.();this.beforeBatch=null;raw.exec('BEGIN');
     try{const rows=items.map(s=>s.run());raw.exec('COMMIT');return rows;}catch(e){raw.exec('ROLLBACK');throw e;}}};
 const env={DB,APP_KIND:'admin',BID_ROOMS:{get(){throw new Error('관리자 API가 시연 공간을 호출했습니다.');}}};
 raw.prepare('INSERT INTO policy_versions VALUES(?,?,?,?,?)').run(policy,'{}',1,'owner',date);
 async function adminToken(role){
   const id=crypto.randomUUID(),token=randomToken();
   raw.prepare('INSERT INTO admins(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(id,role,role,'!',role,date);
   raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)').run(await digest(token),id,Date.now()+600000);
   return token;
 }
 const owner=await adminToken('owner'),staff=await adminToken('staff');
 async function api(path,data,method=data?'POST':'GET',token=owner,host='admin'){
   const origin='https://'+host+'.example.test',url=new URL(path,origin);
   const response=await worker.fetch(new Request(url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:token?'factner_session='+token:''},
     body:data?JSON.stringify(data):undefined}),{...env,APP_KIND:host});
   return {status:response.status,data:await response.json()};
 }
 function member(role,name,{consent=policy,status='approved',real=true}={}){
   const id=crypto.randomUUID();
   if(real)raw.prepare('INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,status,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
     .run(id,id+'@example.test','!',role,'individual',name,'비공개담당자','01012345678',status,consent,date,date);
   raw.prepare('INSERT INTO market_accounts VALUES(?,?,?,?,?)').run(id,id+'@member.invalid','',role==='brand'?'brand':'packaging','!');
   return id;
 }
 const brand=member('brand','새봄 브랜드'),supplier=member('supplier','제작 공방');
 function post(brandId=brand,title='재활용 단상자',deadline='2099-01-01'){
   const id=crypto.randomUUID();
   raw.prepare('INSERT INTO market_posts VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,brandId,'packaging',title,500,300,'40 × 50','무광 인쇄',deadline,date);
   return id;
 }
 function offer(postId,supplierId=supplier,alias='제안사 A'){
   const id=crypto.randomUUID();
   raw.prepare('INSERT INTO market_offers VALUES(?,?,?,?,?,?,?)').run(id,postId,supplierId,alias,JSON.stringify(tiers),'배송 포함',date);return id;
 }
 async function select(offerId,quantity=500){
   const url=new URL('https://main.example.test/api/bid/offers/'+offerId+'/select');
   const req=new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted:true,quantity})});
   const response=await marketApi(req,env,url,{id:brand,kind:'brand'},{live:true});
   return response.json();
 }
 return {raw,DB,api,owner,staff,member,brand,supplier,post,offer,select};
}

test('only the owner sees real submitted work, bounded searchable pages and an off-page selected tier',async t=>{
 const f=await fixture(t),post=f.post(),other=f.post(f.brand,'별도 공고'),expired=f.post(f.brand,'만료 공고','2000-01-01');
 const fake=f.member('brand','샘플',{real:false}),pilot=f.member('brand','구회원',{consent:'pilot'});
 f.post(fake,'공개되지 않을 예시');f.post(pilot,'공개되지 않을 파일럿');
 f.member('brand','가입대기',{status:'pending'});f.member('brand','구가입대기',{status:'pending',consent:'pilot'});
 const ids=[];
 for(let i=0;i<26;i++)ids.push(f.offer(post,f.member('supplier','공방 '+i),'제안사 '+i));
 ids.sort();await f.select(ids[25],1000);
 f.offer(post,f.member('supplier','시연자',{real:false}),'시연');
 f.offer(post,f.member('supplier','동의 미제출',{consent:'pilot'}),'구회원');
 assert.equal((await f.api(base,undefined,'GET','')).status,401);assert.equal((await f.api(base,undefined,'GET',f.staff)).status,403);
 assert.equal((await f.api(base,undefined,'GET',f.owner,'main')).status,404);
 const list=await f.api(base),q=await f.api(base+'?q='+encodeURIComponent('별도')+'&status=open');
 assert.equal(list.status,200);assert.equal(list.data.total,3);assert.equal(list.data.posts.find(p=>p.id===expired).status,'expired');
 assert.deepEqual(list.data.counts,{pendingRegistrations:1,openPosts:1,offers:26,pendingConnections:1,reviewingConnections:0});
 assert.equal(q.data.total,1);assert.equal(q.data.posts[0].id,other);assert.deepEqual(q.data.counts,list.data.counts);
 const details=(await f.api(base+'/'+post)).data;
 assert.equal(details.total,26);assert.equal(details.offers.length,25);assert.equal(details.offers.some(o=>o.id===ids[25]),false);
 assert.equal(details.selectedOffer.id,ids[25]);assert.deepEqual(details.selectedOffer.tiers,tiers);
 assert.equal(details.post.connection.quantity,1000);assert.equal(details.post.connection.unitPrice,200);
 assert.equal((await f.api(base+'/'+post+'?page=2')).data.offers.length,1);
 assert.equal((await f.api(base+'?page=-1')).status,400);assert.equal((await f.api(base+'?status=unknown')).status,400);
 assert.doesNotMatch(JSON.stringify([list.data,details]),/@|01012345678|비공개담당자|password|구회원|시연자/);
});

test('one real partner completes multiple selected posts with separate tier snapshots; retries neither duplicate nor reopen',async t=>{
 const f=await fixture(t),a=f.post(),b=f.post(),offerA=f.offer(a),offerB=f.offer(b);
 const request=await f.select(offerA),shared=await f.select(offerB,1000);assert.equal(request.id,shared.id);
 const list=(await f.api(base+'?status=pending')).data;
 assert.equal(list.total,2);assert.equal(list.counts.pendingConnections,1);
 const memberRequest=(await f.api('/api/admin/matching/requests?memberId='+f.brand)).data.requests[0];
 assert.equal(memberRequest.marketPostCount,2);assert.ok([a,b].includes(memberRequest.marketPostId));
 assert.deepEqual(list.posts.map(p=>p.connection.linkedPostCount),[2,2]);
 const reqPath='/api/admin/matching/requests/'+request.id,action={version:1,confirmed:true};
 assert.equal((await f.api(reqPath,{...action,status:'completed'},'PATCH')).status,409);
 assert.equal((await f.api(reqPath,{...action,status:'reviewing'},'PATCH')).status,200);
 assert.equal((await f.api(base)).data.counts.reviewingConnections,1);
 assert.equal((await f.api(base+'/'+a+'/connect',action)).status,409);
 assert.equal((await f.api(base+'/'+a+'/connect',{version:2,confirmed:false})).status,400);
 assert.equal((await f.api(base+'/'+a+'/connect',{version:2,confirmed:true},'POST',f.staff)).status,403);
 const linked=await f.api(base+'/'+a+'/connect',{version:2,confirmed:true,note:'양측 생산 일정 확인'});assert.equal(linked.status,200);
 assert.equal(linked.data.id,request.id);assert.equal(linked.data.status,'completed');
 assert.deepEqual((await f.api(base+'/'+b+'/connect',{version:2,confirmed:true})).data,linked.data);
 assert.equal(f.raw.prepare('SELECT count(*) AS n FROM member_partner_events').get().n,1);
 assert.equal(f.raw.prepare("SELECT count(*) AS n FROM matching_request_events WHERE status='completed'").get().n,1);
 const resolved=(await f.api(base+'?status=completed')).data;
 assert.equal(resolved.posts.length,2);assert.equal(resolved.counts.reviewingConnections,0);
 assert.deepEqual(resolved.posts.map(p=>p.connection.quantity).sort((a,b)=>a-b),[500,1000]);
 assert.equal((await f.api('/api/admin/partners/'+linked.data.partnerId,{version:1,status:'ended'},'PATCH')).status,200);
 assert.equal((await f.api(base+'/'+a+'/connect',{version:2,confirmed:true})).status,409);
 const c=f.post();await f.select(f.offer(c));
 assert.equal((await f.api(base+'/'+c+'/connect',action)).status,409);
 assert.equal((await f.api('/api/admin/partners/'+linked.data.partnerId,{version:2,status:'active'},'PATCH')).status,200);
 assert.equal((await f.api(base+'/'+c)).data.post.connection.status,'completed');
});

test('market actions recheck both participants inside the transaction; a rejected selection never creates a partner',async t=>{
 const f=await fixture(t),post=f.post(),selection=await f.select(f.offer(post)),action={version:1,confirmed:true};
 f.DB.beforeBatch=()=>f.raw.prepare("UPDATE members SET consent_version='pilot' WHERE id=?").run(f.supplier);
 assert.equal((await f.api(base+'/'+post+'/connect',action)).status,409);
 assert.equal((await f.api('/api/admin/partners',{brandId:f.brand,supplierId:f.supplier})).status,409);
 assert.equal(f.raw.prepare('SELECT count(*) AS n FROM member_partners').get().n,0);
 const match='/api/admin/matching/requests/'+selection.id;
 assert.equal((await f.api(match,{...action,status:'reviewing'},'PATCH')).status,409);
 f.raw.prepare("UPDATE members SET consent_version=?,status='suspended' WHERE id=?").run(policy,f.supplier);
 const detail=(await f.api(base+'/'+post)).data;
 assert.equal(detail.post.connection.eligible,false);assert.equal(detail.selectedOffer.eligible,false);
 assert.equal((await f.api(base)).data.counts.pendingConnections,0);
 assert.equal((await f.api(base+'/'+post+'/connect',action)).status,409);
 assert.equal((await f.api(match,{...action,status:'rejected'},'PATCH')).status,200);
 f.raw.prepare("UPDATE members SET status='approved' WHERE id=?").run(f.supplier);
 assert.equal((await f.api(base+'/'+post+'/connect',action)).status,409);
 assert.equal(f.raw.prepare('SELECT count(*) AS n FROM member_partners').get().n,0);
});
