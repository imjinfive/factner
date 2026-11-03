import {fail,json,now,stmt,text} from './http.js';
import {approvedMarketMember,marketConsent} from './policy.js';
import {authorIdentity,validateAnonymous} from './market-review.js';

export async function reviewOffer(env,user,id,input,{live=true,postId=null}={}){
 const states={approve:'approved',reject:'rejected',withdraw:'withdrawn'},action=input.action;
 if(!Object.hasOwn(states,action)||input.confirmed!==true||!Number.isSafeInteger(input.version)||input.version<1)
   fail(400,'입찰과 심사 버전을 다시 확인해주세요.');
 const reason=text(input.reason,500,action!=='approve');
 const guard=live?` AND EXISTS(SELECT 1 FROM members b JOIN members s ON s.id=o.supplier_id WHERE b.id=p.brand_id
   AND b.role='brand' AND s.role='supplier' AND ${marketConsent('b')} AND ${marketConsent('s')})`:'';
 const row=await stmt(env,`SELECT o.*,p.brand_id,p.review_status AS post_review FROM market_offers o JOIN market_posts p ON p.id=o.post_id
   WHERE o.id=?${postId?' AND p.id=?':''}${guard}`,id,...(postId?[postId]:[])).first();
 if(!row)fail(404,'입찰을 찾을 수 없습니다.');
 if(row.review_version!==input.version||row.review_status==='withdrawn'||(action!=='withdraw'&&row.review_status!=='pending'))
   fail(409,'입찰 심사 상태가 변경되었습니다. 다시 확인해주세요.');
 let identity=null;
 if(action==='approve'){
   if(row.post_review!=='approved')fail(409,'공개 승인된 공고의 입찰만 승인할 수 있습니다.');
   identity=live?await authorIdentity(env,{id:row.supplier_id},true):
     await stmt(env,'SELECT name,email FROM market_accounts WHERE id=?',row.supplier_id).first();
   if(identity)validateAnonymous(row.note,identity);
 }
 const eligibility=action==='approve'?` AND EXISTS(SELECT 1 FROM market_posts p ${live?'JOIN members b ON b.id=p.brand_id JOIN members s ON s.id=market_offers.supplier_id':''}
   WHERE p.id=market_offers.post_id AND p.review_status='approved'${live?` AND b.role='brand' AND s.role='supplier' AND ${approvedMarketMember('b')} AND ${approvedMarketMember('s')} AND s.version=?`:''})`:'';
 const time=now(),next=states[action];
 const result=await env.DB.batch([
   stmt(env,`UPDATE market_offers SET review_status=?,review_reason=?,reviewed_at=?,review_version=review_version+1
     WHERE id=? AND post_id=? AND review_version=? AND review_status=?${eligibility}`,next,reason,time,id,row.post_id,input.version,row.review_status,...(live&&action==='approve'?[identity.version]:[])),
   stmt(env,`INSERT INTO market_offer_reviews(offer_id,version,action,actor_id,reason,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1`,
     id,input.version+1,action,user.id,reason,time)
 ]);
 if(!result[0].meta.changes)fail(409,'회원·공고 또는 입찰 상태가 변경되었습니다. 다시 확인해주세요.');
 return json({id,reviewStatus:next,reviewVersion:input.version+1});
}
