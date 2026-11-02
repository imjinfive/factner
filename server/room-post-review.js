import {body,fail,json,rate,stmt} from './http.js';
import {owner} from './auth.js';
import {roomDatabase} from './bid-auth.js';
import {reviewPost} from './market-review.js';

const internalOrigin='https://factner-review.internal';
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const externalPath=new RegExp('^/api/admin/review-room/posts/('+uuid+')$');
const internalPath=new RegExp('^/internal/post-review/('+uuid+')$');

// The only public entry is on the administrator host. Forward only a checked owner ID and this one post.
export async function adminRoomPostReview(req,env,url,user){
 owner(user);
 const postId=externalPath.exec(url.pathname)?.[1];
 if(!postId)fail(404,'공유한 공고를 찾을 수 없습니다.');
 if(!['GET','POST'].includes(req.method))fail(405,'지원하지 않는 검토 요청입니다.');
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
 const request=new Request(internalOrigin+'/internal/post-review/'+postId,{method:req.method,headers,body:payload});
 return env.REVIEW_ROOMS.get(env.REVIEW_ROOMS.idFromName(key)).fetch(request);
}

export async function isolatedPostReview(req,env){
 const url=new URL(req.url),id=internalPath.exec(url.pathname)?.[1],actor=req.headers.get('X-Factner-Reviewer');
 if(url.origin!==internalOrigin||!id||!actor||env[roomDatabase]!==env.DB)fail(404,'공유한 공고를 찾을 수 없습니다.');
 if(req.method==='POST'){
   if(req.headers.get('Origin')!==internalOrigin)fail(403,'허용되지 않은 요청입니다.');
   return reviewPost(env,{id:actor},id,await body(req),{admin:true});
 }
 if(req.method!=='GET')fail(405,'지원하지 않는 검토 요청입니다.');
 const post=await stmt(env,`SELECT p.id,p.title,a.name AS brandName,p.category,p.quantity,p.unit_price AS unitPrice,p.size,p.description,p.deadline,
   p.review_status AS reviewStatus,p.review_version AS reviewVersion,p.review_reason AS reviewReason,p.reviewed_at AS reviewedAt
   FROM market_posts p JOIN market_accounts a ON a.id=p.brand_id AND a.kind='brand' WHERE p.id=?`,id).first();
 if(!post)fail(404,'공유한 공고를 찾을 수 없습니다.');
 return json({post});
}
