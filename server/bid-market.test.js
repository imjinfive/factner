import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { BID_TERMS } from '../shared/bid-terms.js';
import { marketApi } from './bid-market.js';
import { HttpError } from './http.js';
import {SUBMISSION_AGREEMENT} from '../shared/submission-agreement.js';
import {biddingDeadline,reviewPost} from './market-review.js';
import {reviewOffer} from './offer-review.js';

function fixture(t, consultation=true) {
  const sql = new DatabaseSync(':memory:');
  t.after(()=>sql.close());
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(readFileSync(new URL('../migrations/0013_bid_market.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0015_market_post_review.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0018_market_offer_review.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0019_submission_agreements.sql',import.meta.url),'utf8'));
  if(consultation)sql.exec(readFileSync(new URL('../migrations/0022_post_consultation.sql',import.meta.url),'utf8'));
  const env = { BID_DEMO:true, DB:{
    prepare(query) {
      const statement = sql.prepare(query);
      return { bind(...args) { return {
        run:()=>statement.columns().length?{results:statement.all(...args)}:{ meta:{ changes:statement.run(...args).changes } },
        all:()=>({ results:statement.all(...args) }),
        first:()=>statement.get(...args)
      }; } };
    },
    batch(items) { sql.exec('BEGIN');try{const rows=items.map(item=>item.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;} }
  } };
  const accounts = {};
  for (const [key,kind] of Object.entries({ brand:'brand',otherBrand:'brand',design:'design',box:'packaging',both:'both' })) {
    const account = { id:crypto.randomUUID(),kind,name:key+' 비공개 상호',email:key+'@example.test' };
    sql.prepare('INSERT INTO market_accounts VALUES(?,?,?,?,?)').run(account.id,account.email,account.name,kind,'test');
    accounts[key] = account;
  }
  accounts.admin = { id:'test-admin',kind:'admin',name:'운영 담당',email:'admin@example.test' };
  async function api(user, path, input) {
    const url = new URL('https://example.test/api/bid/'+path);
    const req = new Request(url,input===undefined?{}:{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input) });
    try {
      const response = await marketApi(req,env,url,user);
      return { status:response.status,data:await response.json() };
    } catch(e) {
      if (!(e instanceof HttpError)) throw e;
      return { status:e.status,error:e.message };
    }
  }
  return { ...accounts,sql,env,api };
}
const agreement={accepted:true,version:SUBMISSION_AGREEMENT.version,signature:'서명 검증자'};
const post = { category:'packaging',title:'칼선에 맞춘 상자',quantity:500,unitPrice:2100,size:'80×50×30㎜',description:'동일 사양으로 견적을 요청합니다.',agreement };
const offer = { tiers:[{quantity:1000,unitPrice:1800},{quantity:500,unitPrice:2000}],note:'운임 별도',agreement };
const consent = { accepted:true, version:BID_TERMS.version,signature:'비공개 서명자' };

test('consultation migration preserves referenced offers, contracts, reviews and signatures',async t=>{
  const f=fixture(t,false),postId=await approvedPost(f);
  const offerId=(await f.api(f.box,'posts/'+postId+'/offers',offer)).data.id;
  f.sql.exec("UPDATE market_offers SET review_status='approved'");
  assert.equal((await f.api(f.brand,'offers/'+offerId+'/select',{...consent,quantity:500})).status,201);
  f.sql.prepare('INSERT INTO market_post_reviews VALUES(?,?,?,?,?,?,?)').run(postId,1,'approve','admin','operator','확인','2026-11-03');
  const tables=['market_posts','market_offers','market_contracts','market_post_reviews','submission_agreements'];
  const before=tables.map(name=>f.sql.prepare(`SELECT * FROM ${name}`).all());
  f.sql.exec('BEGIN');
  f.sql.exec(readFileSync(new URL('../migrations/0022_post_consultation.sql',import.meta.url),'utf8'));
  f.sql.exec('COMMIT');
  assert.deepEqual(tables.map(name=>f.sql.prepare(`SELECT * FROM ${name}`).all()),before);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(f.sql.prepare('PRAGMA table_info(market_posts)').all().find(row=>row.name==='quantity').notnull,0);
});

test('unknown request quantity and budget are explicit nulls while bids require actual positive quotes',async t=>{
  const f=fixture(t);
  const created=await f.api(f.brand,'posts',{...post,quantity:null,unitPrice:null});
  assert.equal(created.status,201);
  assert.equal(created.data.reviewStatus,'pending');
  const mine=(await f.api(f.brand,'state')).data.posts[0];
  assert.equal(mine.quantity,null);assert.equal(mine.unitPrice,null);
  assert.deepEqual((await f.api(null,'state')).data.posts,[]);
  f.sql.exec("UPDATE market_posts SET review_status='approved'");
  assert.equal((await f.api(f.box,'posts/'+created.data.id+'/offers',{...offer,tiers:[{quantity:null,unitPrice:null}]})).status,400);
  const bid=await f.api(f.box,'posts/'+created.data.id+'/offers',offer);
  assert.equal(bid.status,201);
  f.sql.exec("UPDATE market_offers SET review_status='approved'");
  assert.equal((await f.api(f.brand,'offers/'+bid.data.id+'/select',{...consent,quantity:null})).status,400);
  assert.equal((await f.api(f.brand,'offers/'+bid.data.id+'/select',{...consent,quantity:500})).status,201);
  const contract=(await f.api(f.brand,'state')).data.contracts[0];
  assert.equal(contract.quantity,500);assert.equal(contract.unitPrice,2000);
  assert.equal((await f.api(f.brand,'posts',{...post,quantity:undefined})).status,400);
});
async function approvedPost(f){
  const draft=await f.api(f.brand,'posts',post);
  assert.equal(draft.data.reviewStatus,'pending');
  f.sql.prepare("UPDATE market_posts SET review_status='approved' WHERE id=?").run(draft.data.id);
  return draft.data.id;
}

test('bid board restricts participation by category and excludes identities and rival offers',async t=>{
  const f=fixture(t);
  assert.equal((await f.api(null,'posts',post)).status,401);
  assert.equal((await f.api(f.box,'posts',post)).status,403);
  for (const title of [f.brand.name,'문 의 ０１０－１２３４－５６７８','문의 info@private.co.kr','공식 www.example.com']) {
    assert.equal((await f.api(f.brand,'posts',{...post,title})).status,400);
  }
  for (const change of [{quantity:-1},{unitPrice:'100'}]) {
    assert.equal((await f.api(f.brand,'posts',{...post,...change})).status,400);
  }
  const id=await approvedPost(f);
  assert.equal((await f.api(f.otherBrand,'posts',{...post,category:'design'})).status,403);
  assert.deepEqual((await f.api(f.design,'state')).data.posts,[]);
  assert.equal((await f.api(f.design,'posts/'+id+'/offers',offer)).status,403);
  assert.equal((await f.api(f.box,'posts/'+id+'/offers',{...offer,tiers:[offer.tiers[0],offer.tiers[0]]})).status,400);
  assert.equal((await f.api(f.box,'posts/'+id+'/offers',{...offer,note:f.box.email})).status,400);
  assert.equal((await f.api(f.box,'posts/'+id+'/offers',offer)).status,201);
  assert.equal((await f.api(f.box,'posts/'+id+'/offers',offer)).status,409);
  assert.equal((await f.api(f.both,'posts/'+id+'/offers',offer)).status,201);
  assert.equal((await f.api(null,'state')).data.posts[0].offerCount,0);
  assert.deepEqual((await f.api(f.brand,'state')).data.offers,[]);
  assert.equal((await f.api(f.box,'state')).data.offers[0].reviewStatus,'pending');
  f.sql.exec("UPDATE market_offers SET review_status='approved'");
  const publicBoard=(await f.api(null,'state')).data;
  assert.equal(publicBoard.posts.find(p=>p.id===id).offerCount,2);
  assert.deepEqual(publicBoard.offers,[]);
  const brandBoard=(await f.api(f.brand,'state')).data;
  assert.deepEqual(brandBoard.offers.map(o=>o.alias).sort(),['제안사 A','제안사 B']);
  f.sql.prepare("UPDATE market_offers SET alias='입찰사 A' WHERE post_id=? AND alias='제안사 A'").run(id);
  assert.deepEqual((await f.api(f.brand,'state')).data.offers.map(o=>o.alias).sort(),['제안사 A','제안사 B']);
  assert.deepEqual(brandBoard.offers[0].tiers.map(x=>x.quantity),[500,1000]);
  assert.equal((await f.api(f.otherBrand,'state')).data.offers.length,0);
  assert.equal((await f.api(f.box,'state')).data.offers.length,1);
  for (const account of [f.brand,f.box,f.both]) {
    for (const secret of [account.name,account.email,account.id]) assert.ok(!JSON.stringify(brandBoard).includes(secret));
  }
  f.sql.prepare('UPDATE market_posts SET deadline=? WHERE id=?').run('2000-01-01',id);
  assert.equal((await f.api(f.box,'posts/'+id+'/offers',offer)).status,409);
});

test('a historic design brief stays readable while its offers and contracts cannot advance',async t=>{
  const f=fixture(t);
  const postId=await approvedPost(f);
  const offerId=(await f.api(f.both,'posts/'+postId+'/offers',offer)).data.id;
  f.sql.exec("UPDATE market_offers SET review_status='approved'");
  const contractId=(await f.api(f.brand,'offers/'+offerId+'/select',{...consent,quantity:500})).data.id;
  f.sql.prepare("UPDATE market_posts SET category='design' WHERE id=?").run(postId);
  assert.equal((await f.api(null,'state')).data.posts[0].category,'design');
  assert.equal((await f.api(f.both,'state')).data.posts.length,0);
  assert.equal((await f.api(f.brand,'state')).data.contracts[0].category,'design');
  assert.equal((await f.api(f.both,'posts/'+postId+'/offers',offer)).status,403);
  assert.equal((await f.api(f.brand,'offers/'+offerId+'/select',{...consent,quantity:500})).status,403);
  for (const [user,action,input] of [[f.both,'sign',consent],[f.admin,'reveal',{accepted:true}],[f.brand,'pay',{kind:'sample',amount:100}]]) {
    assert.equal((await f.api(user,'contracts/'+contractId+'/'+action,input)).status,403);
  }
  assert.equal((await f.api(f.brand,'state')).data.contracts[0].status,'awaiting_supplier');
});

test('one awarded tier, signatures and an admin decision precede private reveal and simulated payment',async t=>{
  const f=fixture(t),postId=await approvedPost(f);
  const a=(await f.api(f.box,'posts/'+postId+'/offers',offer)).data.id;
  const b=(await f.api(f.both,'posts/'+postId+'/offers',offer)).data.id;
  f.sql.exec("UPDATE market_offers SET review_status='approved'");
  const select=(user,id,extra={})=>f.api(user,'offers/'+id+'/select',{...consent,quantity:500,...extra});
  assert.equal((await select(f.otherBrand,a)).status,404);
  assert.equal((await select(f.brand,a,{version:'invalid'})).status,409);
  assert.equal((await select(f.brand,a,{quantity:7})).status,400);
  const attempts=await Promise.all([select(f.brand,a),select(f.brand,b)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
  const aWon=attempts[0].status===201;
  const winner=aWon?f.box:f.both,loser=aWon?f.both:f.box;
  const id=attempts.find(r=>r.status===201).data.id;
  const action=(user,path,input)=>f.api(user,'contracts/'+id+'/'+path,input);
  const view=async user=>(await f.api(user,'state')).data.contracts;
  assert.equal((await view(f.brand))[0].unitPrice,2000);
  assert.deepEqual((await view(f.brand))[0].terms,BID_TERMS);
  assert.equal((await view(f.brand))[0].parties,undefined);
  assert.deepEqual((await view(f.admin))[0].parties.brand,{name:f.brand.name,email:f.brand.email});
  assert.equal((await view(loser)).length,0);
  assert.equal((await view(f.otherBrand)).length,0);
  assert.equal((await action(f.admin,'reveal',{accepted:true})).status,409);
  assert.equal((await action(f.brand,'pay',{kind:'sample',amount:5000})).status,409);
  assert.equal((await action(loser,'sign',consent)).status,404);
  assert.equal((await action(f.brand,'sign',consent)).status,403);
  assert.equal((await action(winner,'sign',{...consent,version:'invalid'})).status,409);
  assert.equal((await action(winner,'sign',consent)).status,200);
  assert.equal((await view(winner))[0].status,'signed');
  assert.equal((await view(f.brand))[0].parties,undefined);
  assert.ok(!JSON.stringify(await view(f.brand)).includes(consent.signature));
  assert.equal((await action(f.brand,'reveal',{accepted:true})).status,403);
  assert.equal((await action(f.admin,'reveal',{accepted:true})).status,200);
  const contract=(await view(f.brand))[0];
  assert.equal(contract.status,'revealed');
  assert.deepEqual(contract.parties.supplier,{name:winner.name,email:winner.email});
  assert.deepEqual((await view(null)),[]);
  assert.equal((await action(winner,'pay',{kind:'production'})).status,403);
  assert.equal((await action(f.brand,'pay',{kind:'production',amount:1})).status,400);
  f.env.BID_DEMO='false';
  assert.equal((await action(f.brand,'pay',{kind:'production'})).status,403);
  f.env.BID_DEMO='1';
  const paid=await Promise.all([action(f.brand,'pay',{kind:'production'}),action(f.brand,'pay',{kind:'production'})]);
  assert.deepEqual(paid.map(r=>r.status).sort(),[200,201]);
  assert.equal(paid[0].data.id,paid[1].data.id);
  assert.equal(paid[0].data.amount,1000000);
  assert.equal((await action(f.brand,'pay',{kind:'sample',amount:0})).status,400);
  assert.equal((await action(f.brand,'pay',{kind:'sample',amount:5000})).status,201);
  assert.equal((await action(f.brand,'pay',{kind:'sample',amount:5001})).status,409);
  assert.equal((await view(f.brand))[0].payments.length,2);
  assert.ok((await view(f.brand))[0].payments.every(p=>p.simulated));
});

test('identical selection and signature retries return the existing record and its current status',async t=>{
  const f = fixture(t);
  const postId = await approvedPost(f);
  const offerId = (await f.api(f.box,'posts/'+postId+'/offers',offer)).data.id;
  const alternative = (await f.api(f.both,'posts/'+postId+'/offers',offer)).data.id;
  f.sql.exec("UPDATE market_offers SET review_status='approved'");
  const select = (extra={}, id=offerId) => f.api(f.brand,'offers/'+id+'/select',{...consent,quantity:500,...extra});
  const selections = await Promise.all([select(),select()]);
  assert.deepEqual(selections.map(r=>r.status).sort(),[200,201]);
  const id = selections[0].data.id;
  assert.deepEqual(selections.map(r=>r.data),Array(2).fill({id,status:'awaiting_supplier'}));
  assert.equal((await select({quantity:1000})).status,409);
  assert.equal((await select({signature:'다른 서명'})).status,409);
  assert.equal((await select({accepted:false})).status,409);
  assert.equal((await select({},alternative)).status,409);

  const sign = extra => f.api(f.box,'contracts/'+id+'/sign',{...consent,...extra});
  const signatures = await Promise.all([sign(),sign()]);
  assert.ok(signatures.every(r=>r.status===200 && r.data.id===id && r.data.status==='signed'));
  const original = f.sql.prepare('SELECT brand_signed_at,supplier_signed_at FROM market_contracts WHERE id=?').get(id);
  assert.equal((await sign({signature:'변경 요청'})).status,409);
  assert.equal((await select()).data.status,'signed');
  await f.api(f.admin,'contracts/'+id+'/reveal',{accepted:true});
  assert.deepEqual((await select()).data,{id,status:'revealed'});
  assert.deepEqual((await sign()).data,{id,status:'revealed'});
  assert.deepEqual(f.sql.prepare('SELECT brand_signed_at,supplier_signed_at FROM market_contracts WHERE id=?').get(id),original);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM market_contracts').get().n,1);

  // Existing terms snapshots remain authoritative even after a new version is published.
  f.sql.prepare('UPDATE market_contracts SET version=?,terms_json=? WHERE id=?').run('older-version',JSON.stringify({...BID_TERMS,version:'older-version'}),id);
  assert.deepEqual((await select({version:'older-version'})).data,{id,status:'revealed'});
  assert.equal((await select()).status,409);
});

test('signed submissions keep server documents and atomic snapshots, with a fresh seven-day public period',async t=>{
 const f=fixture(t);
 for(const invalid of [undefined,{...agreement,accepted:false},{...agreement,version:'old'},{...agreement,signature:'  '}]){
   assert.ok([400,409].includes((await f.api(f.brand,'posts',{...post,agreement:invalid})).status));
 }
 assert.equal(f.sql.prepare('SELECT count(*) n FROM market_posts').get().n,0);
 const id=(await f.api(f.brand,'posts',{...post,deadline:'2099-01-01',agreement:{...agreement,document:{body:'forged'},signedAt:'1900-01-01'}})).data.id;
 assert.equal(f.sql.prepare('SELECT deadline FROM market_posts WHERE id=?').get(id).deadline,biddingDeadline());
 f.sql.prepare("UPDATE market_posts SET deadline='2000-01-01' WHERE id=?").run(id);
 const approval=await reviewPost(f.env,f.admin,id,{action:'approve',version:1,confirmed:true},{admin:true});
 assert.equal(approval.status,200);
 assert.equal(f.sql.prepare('SELECT deadline FROM market_posts WHERE id=?').get(id).deadline,biddingDeadline());
 assert.equal(biddingDeadline('2026-11-03T14:59:59Z'),'2026-11-10');
 assert.equal(biddingDeadline('2026-11-03T15:00:00Z'),'2026-11-11');
 const record=f.sql.prepare('SELECT * FROM submission_agreements WHERE resource_id=?').get(id);
 assert.deepEqual(JSON.parse(record.document_json),SUBMISSION_AGREEMENT);
 assert.equal(record.signature,agreement.signature);assert.equal(record.member_id,f.brand.id);
 assert.equal(JSON.parse(record.submission_json).description,post.description);
 assert.equal(JSON.parse(record.submission_json).biddingPeriodDays,7);
 assert.ok(Math.abs(Date.now()-Date.parse(record.signed_at))<5000);
 assert.throws(()=>f.sql.prepare('UPDATE submission_agreements SET signature=?').run('다른 이름'),/immutable/);
 assert.throws(()=>f.sql.exec('DELETE FROM submission_agreements'),/immutable/);
 const a=(await f.api(f.box,'posts/'+id+'/offers',offer)).data.id;
 assert.equal((await f.api(f.brand,'offers/'+a+'/select',{...consent,quantity:500})).status,404);
 await reviewOffer(f.env,f.admin,a,{action:'approve',confirmed:true,version:1},{live:false});
 assert.equal((await f.api(f.brand,'state')).data.offers.length,1);
 await reviewOffer(f.env,f.admin,a,{action:'withdraw',confirmed:true,version:2,reason:'확인 후 비공개'},{live:false});
 assert.deepEqual((await f.api(f.brand,'state')).data.offers,[]);
 assert.equal((await f.api(f.box,'state')).data.offers[0].reviewReason,'확인 후 비공개');
 assert.equal((await f.api(f.brand,'offers/'+a+'/select',{...consent,quantity:500})).status,404);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM submission_agreements').get().n,2);
 f.sql.exec("CREATE TRIGGER reject_test_signature BEFORE INSERT ON submission_agreements BEGIN SELECT RAISE(ABORT,'signature unavailable'); END;");
 await assert.rejects(()=>f.api(f.brand,'posts',post),/signature unavailable/);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM market_posts').get().n,1);
 await assert.rejects(()=>f.api(f.both,'posts/'+id+'/offers',offer),/signature unavailable/);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM market_offers').get().n,1);
});
