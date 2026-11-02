import {fail,json,now,stmt,text} from './http.js';
import {approvedMarketMember,marketConsent,service} from './policy.js';

const norm=s=>String(s||'').normalize('NFKC').replace(/\p{Cf}/gu,'').toLowerCase();
const folded=s=>norm(s).replace(/[^\p{L}\p{N}]/gu,'');
const phone=/(?:\+82(?:0)?|0082(?:0)?|0)(?:1[016789]|2|[3-6]\d|70|50[2-8]|80)\d{7,8}|(?:15|16|18)\d{6}/;
const internationalPhone=/\+\s*\(?[1-9](?:[\s()./·‐‑–—-]*\d){7,14}(?![\s()./·‐‑–—-]*\d)/u;
const companyLabel=/(?:주식회사|유한(?:책임)?회사|\(주\))\s*[\p{L}\d]{2,}|[\p{L}\d]{2,}\s*(?:주식회사|유한(?:책임)?회사|\(주\))|[\p{L}\d]{2,}\s+(?:co(?:mpany)?[.,\s]+(?:ltd|limited)|ltd|llc|inc|corp|gmbh)\b/iu;
const contactLabel=/(?:성명|담당자명?|대표자명?|대표이사)\s*[:=]\s*[\p{L}]{2,}|(?:담당자|대표자|대표이사)\s+[김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노][가-힣]{1,2}(?=$|[\s,./()])/u;
export async function authorIdentity(env,user,live){
 if(!live)return user;
 const [member,settings]=await Promise.all([stmt(env,'SELECT name,contact,phone,email,version FROM members WHERE id=?',user.id).first(),service(env)]);
 return {...member,operator:settings.operator};
}
export function validateAnonymous(value,author){
 const clean=norm(value),compact=folded(clean),dial=clean.replace(/[\s()./·‐‑–—-]/gu,'');
 const names=[author.name,author.contact,author.operator].filter(Boolean).flatMap(name=>{
   const stripped=norm(name).replace(/주식회사|유한회사|\(주\)/gu,'');
   return [name,...stripped.split(/[()[\]]/u)];
 }).map(folded).filter(Boolean);
 const phoneDigits=norm(author.phone).replace(/\D/g,'');
 if(clean.includes('@') || /(?:https?\s*:|www\s*\.|카카오톡|오픈채팅|카톡\s*(?:id|아이디))/iu.test(clean) ||
    (clean.includes('.')&&/[a-z\d-]+\s*\.\s*(?:[a-z]{2,24}|xn--[a-z\d-]+)(?![a-z\d-])/iu.test(clean)) ||
    phone.test(dial)||internationalPhone.test(clean)||companyLabel.test(clean)||contactLabel.test(clean) ||
    names.some(name=>compact.includes(name)) || (phoneDigits.length>=7&&dial.includes(phoneDigits)) ||
    (author.email && compact.includes(folded(author.email)))){
   fail(400,'익명 공고와 제안에 상호·담당자명·전화번호·이메일·링크를 넣을 수 없습니다.');
 }
}

export async function reviewPost(env,user,id,input,{admin=false,live=false}={}){
 const action=admin?input.action:'withdraw';
 const states={approve:'approved',reject:'rejected',withdraw:'withdrawn'};
 if(!Object.hasOwn(states,action)||input.confirmed!==true||!Number.isSafeInteger(input.version)||input.version<1)fail(400,'공고와 검토 버전을 다시 확인해주세요.');
 const reason=text(input.reason,500,admin&&action!=='approve');
 const authorGuard=admin?(live?` AND EXISTS(SELECT 1 FROM members m WHERE m.id=p.brand_id AND m.role='brand' AND ${marketConsent('m')})`:
   " AND EXISTS(SELECT 1 FROM market_accounts a WHERE a.id=p.brand_id AND a.kind='brand')"):' AND p.brand_id=?';
 const row=await stmt(env,`SELECT p.* FROM market_posts p WHERE p.id=?${authorGuard}`,id,...(admin?[]:[user.id])).first();
 if(!row)fail(404,'공고를 찾을 수 없습니다.');
 if(row.review_version!==input.version||row.review_status==='withdrawn'||(action!=='withdraw'&&row.review_status!=='pending'))fail(409,'공고 검토 상태가 변경되었습니다. 다시 확인해주세요.');
 let identity=null;
 if(action==='approve')identity=live?await authorIdentity(env,{id:row.brand_id},true):
   await stmt(env,"SELECT name,email FROM market_accounts WHERE id=? AND kind='brand'",row.brand_id).first();
 if(identity)validateAnonymous([row.title,row.size,row.description].join(' '),identity);
 const time=now(),next=states[action];
 const eligibility=live&&(action==='approve'||!admin)?` AND EXISTS(SELECT 1 FROM members m WHERE m.id=market_posts.brand_id AND m.role='brand' AND ${approvedMarketMember('m')}${identity?' AND m.version=?':''})`:'';
 const result=await env.DB.batch([
   stmt(env,`UPDATE market_posts SET review_status=?,review_reason=?,reviewed_at=?,review_version=review_version+1
     WHERE id=? AND brand_id=? AND review_version=? AND review_status=?${eligibility}`,next,reason,time,id,row.brand_id,input.version,row.review_status,...(live&&identity?[identity.version]:[])),
   stmt(env,'INSERT INTO market_post_reviews(post_id,version,action,actor,actor_id,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1',
     id,input.version+1,action,admin?'admin':'author',user.id,reason,time)]);
 if(!result[0].meta.changes)fail(409,'회원 또는 공고 상태가 변경되었습니다. 다시 확인해주세요.');
 return json({id,reviewStatus:next,reviewVersion:input.version+1,visibilityChanged:(next==='approved')!==(row.review_status==='approved')});
}
