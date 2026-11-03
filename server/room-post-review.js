import {body,fail,json,rate,stmt} from './http.js';
import {owner} from './auth.js';
import {roomDatabase} from './bid-auth.js';
import {reviewPost} from './market-review.js';
import {reviewOffer} from './offer-review.js';

const internalOrigin='https://factner-review.internal';
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const externalPath=new RegExp('^/api/admin/review-room/posts/('+uuid+')(?:/offers/('+uuid+')/review)?$');
const internalPath=new RegExp('^/internal/post-review/('+uuid+')(?:/offers/('+uuid+')/review)?$');

// The only public entry is on the administrator host. Forward only a checked owner ID and this one post.
export async function adminRoomPostReview(req,env,url,user){
 owner(user);
 const match=externalPath.exec(url.pathname),postId=match?.[1],offerId=match?.[2];
 if(!postId)fail(404,'공유한 공고를 찾을 수 없습니다.');
 if(!['GET','POST'].includes(req.method)||(offerId&&req.method!=='POST'))fail(405,'지원하지 않는 검토 요청입니다.');
 const key=req.headers.get('X-Factner-Review');
 if(!/^[a-f0-9]{64}$/.test(key||''))fail(400,'공유받은 공간 코드와 공고 번호를 확인해주세요.');
 if(!env.REVIEW_ROOMS)fail(503,'지정 공간을 확인할 수 없습니다.');
 await rate(env,'isolated-post-review:'+user.id,120,3600);
 const headers={'X-Factner-Reviewer':user.id};
 let payload;
 if(req.method==='POST'){
   const {action,version,confirmed,reason}=await body(req);
   headers.Origin=internalOrigin;headers['Content-Type']='application/json';
   payload=JSON.stringify({action,version,confirmed,reason});
 }
 const page=Number(url.searchParams.get('page')||1);
 if(!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'페이지 번호를 확인해주세요.');
 const request=new Request(internalOrigin+'/internal/post-review/'+postId+(offerId?'/offers/'+offerId+'/review':'')+'?page='+page,{method:req.method,headers,body:payload});
 return env.REVIEW_ROOMS.get(env.REVIEW_ROOMS.idFromName(key)).fetch(request);
}

export async function isolatedPostReview(req,env){
 const url=new URL(req.url),match=internalPath.exec(url.pathname),id=match?.[1],offerId=match?.[2],actor=req.headers.get('X-Factner-Reviewer');
 if(url.origin!==internalOrigin||!id||!actor||env[roomDatabase]!==env.DB)fail(404,'공유한 공고를 찾을 수 없습니다.');
 if(req.method==='POST'){
   if(req.headers.get('Origin')!==internalOrigin)fail(403,'허용되지 않은 요청입니다.');
   if(offerId)return reviewOffer(env,{id:actor},offerId,await body(req),{live:false,postId:id});
   return reviewPost(env,{id:actor},id,await body(req),{admin:true});
 }
 if(req.method!=='GET')fail(405,'지원하지 않는 검토 요청입니다.');
 const post=await stmt(env,`SELECT p.id,p.title,a.name AS brandName,a.email AS brandEmail,p.category,p.quantity,p.unit_price AS unitPrice,p.size,p.description,p.deadline,p.created_at AS createdAt,
   p.review_status AS reviewStatus,p.review_version AS reviewVersion,p.review_reason AS reviewReason,p.reviewed_at AS reviewedAt
   FROM market_posts p JOIN market_accounts a ON a.id=p.brand_id AND a.kind='brand' WHERE p.id=?`,id).first();
 if(!post)fail(404,'공유한 공고를 찾을 수 없습니다.');
 const page=Number(url.searchParams.get('page')||1),pageSize=25;
 if(!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'페이지 번호를 확인해주세요.');
 const [rows,total,events,reviews,agreements]=await Promise.all([
   stmt(env,`SELECT o.*,a.name,a.email FROM market_offers o JOIN market_accounts a ON a.id=o.supplier_id WHERE o.post_id=? ORDER BY o.created_at,o.id LIMIT ? OFFSET ?`,id,pageSize,(page-1)*pageSize).all(),
   stmt(env,'SELECT count(*) AS n FROM market_offers WHERE post_id=?',id).first(),
   stmt(env,'SELECT r.offer_id AS offerId,r.version,r.action,r.reason,r.created_at AS createdAt FROM market_offer_reviews r JOIN market_offers o ON o.id=r.offer_id WHERE o.post_id=? ORDER BY r.version DESC',id).all(),
   stmt(env,'SELECT version,action,actor,reason,created_at AS createdAt FROM market_post_reviews WHERE post_id=? ORDER BY version DESC',id).all(),
   stmt(env,"SELECT purpose,resource_id AS resourceId,version,document_json,signature,signed_at AS signedAt FROM submission_agreements WHERE (purpose='post' AND resource_id=?) OR (purpose='offer' AND resource_id IN (SELECT id FROM market_offers WHERE post_id=?)) ORDER BY signed_at",id,id).all()
 ]);
 const {brandEmail,...detail}=post;
 return json({post:{...detail,brand:{name:post.brandName,email:brandEmail},eligible:true},
   offers:rows.results.map(o=>({id:o.id,postId:id,alias:o.alias,supplierId:o.supplier_id,supplierName:o.name,supplier:{name:o.name,email:o.email},
     tiers:JSON.parse(o.tiers),note:o.note,createdAt:o.created_at,eligible:post.reviewStatus==='approved',reviewStatus:o.review_status,reviewVersion:o.review_version,
     reviewReason:o.review_reason,reviewedAt:o.reviewed_at,reviewEvents:events.results.filter(e=>e.offerId===o.id)})),
   selectedOffer:null,total:total.n,page,pageSize,reviewEvents:reviews.results,
   agreements:agreements.results.map(({document_json,...row})=>({...row,document:JSON.parse(document_json)}))});
}
