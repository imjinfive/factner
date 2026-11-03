import {body,fail,json,rate,stmt,text} from './http.js';
import {owner} from './auth.js';
import {marketConsent} from './policy.js';
import {createPartner} from './partners.js';
import {reviewPost} from './market-review.js';
import {reviewOffer} from './offer-review.js';

const pageSize=25;
const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const offerRows=`FROM market_offers o JOIN market_posts p ON p.id=o.post_id
 JOIN members b ON b.id=p.brand_id AND b.role='brand' AND ${marketConsent('b')}
 JOIN members s ON s.id=o.supplier_id AND s.role='supplier' AND ${marketConsent('s')}`;
const postRows=`FROM market_posts p JOIN members b ON b.id=p.brand_id AND b.role='brand' AND ${marketConsent('b')}
 LEFT JOIN market_connection_requests c ON c.post_id=p.id
 LEFT JOIN market_offers chosen ON chosen.post_id=p.id AND chosen.id=c.offer_id
 LEFT JOIN members s ON s.id=chosen.supplier_id AND s.role='supplier' AND ${marketConsent('s')}
 LEFT JOIN matching_requests r ON r.id=c.request_id AND r.requester_id=b.id AND r.target_id=s.id
 LEFT JOIN member_partners partner ON partner.brand_id=b.id AND partner.supplier_id=s.id`;
const postFields=`p.id,p.category,p.title,p.quantity,p.unit_price,p.size,p.description,p.deadline,p.created_at,p.review_status,p.review_version,p.review_reason,p.reviewed_at,
 b.id AS brand_id,b.name AS brand_name,b.contact AS brand_contact,b.phone AS brand_phone,b.email AS brand_email,b.business_number AS brand_business_number,
 b.status AS brand_status,s.status AS supplier_status,chosen.review_status AS selected_review,
 (SELECT count(*) FROM market_offers o JOIN members m ON m.id=o.supplier_id AND m.role='supplier' AND ${marketConsent('m')} WHERE o.post_id=p.id) AS offer_count,
 c.post_id AS selected,c.offer_id,c.quantity AS selected_qty,c.unit_price AS selected_price,
 r.id AS request_id,r.status AS request_status,r.version AS request_version,
 (SELECT count(*) FROM market_connection_requests linked WHERE linked.request_id=r.id) AS linked_count,
 partner.id AS partner_id,partner.status AS partner_status`;
const offerFields=`o.id,o.post_id,o.alias,o.tiers,o.note,o.created_at,o.review_status,o.review_version,o.review_reason,o.reviewed_at,
 s.id AS supplier_id,s.name AS supplier_name,s.contact AS supplier_contact,s.phone AS supplier_phone,s.email AS supplier_email,s.business_number AS supplier_business_number,
 s.status AS supplier_status,b.status AS brand_status,p.review_status AS post_review`;

function postView(p,date){
 const eligible=p.brand_status==='approved';
 return {id:p.id,title:p.title,category:p.category,quantity:p.quantity,unitPrice:p.unit_price,deadline:p.deadline,createdAt:p.created_at,
   brandName:p.brand_name,brandId:p.brand_id,eligible,offerCount:p.offer_count,
   reviewStatus:p.review_status,reviewVersion:p.review_version,reviewReason:p.review_reason,reviewedAt:p.reviewed_at,
   status:p.selected?'selected':!eligible||p.review_status!=='approved'?'inactive':p.deadline<date?'expired':'open',
   connection:p.request_id?{id:p.request_id,offerId:p.offer_id,quantity:p.selected_qty,unitPrice:p.selected_price,status:p.request_status,
     version:p.request_version,partnerId:p.partner_id,partnerStatus:p.partner_status,eligible:eligible&&p.supplier_status==='approved'&&p.selected_review==='approved',linkedPostCount:p.linked_count}:null};
}
function offerView(o){
 return {id:o.id,postId:o.post_id,alias:o.alias,supplierId:o.supplier_id,supplierName:o.supplier_name,eligible:o.supplier_status==='approved'&&o.brand_status==='approved'&&o.post_review==='approved',
   supplier:{name:o.supplier_name,contact:o.supplier_contact,phone:o.supplier_phone,email:o.supplier_email,businessNumber:o.supplier_business_number},
   tiers:JSON.parse(o.tiers),note:o.note,createdAt:o.created_at,reviewStatus:o.review_status,reviewVersion:o.review_version,reviewReason:o.review_reason,reviewedAt:o.reviewed_at};
}
async function counts(env,date){
 const rows=await stmt(env,`SELECT
   (SELECT count(*) FROM members m WHERE m.status='pending' AND ${marketConsent('m')}) AS pendingRegistrations,
   (SELECT count(*) FROM market_posts p JOIN members b ON b.id=p.brand_id AND b.role='brand' AND ${marketConsent('b')}
     WHERE p.review_status='pending') AS pendingPosts,
   (SELECT count(*) FROM market_posts p JOIN members b ON b.id=p.brand_id AND b.role='brand' AND b.status='approved' AND ${marketConsent('b')}
     WHERE p.review_status='approved' AND p.deadline>=? AND NOT EXISTS(SELECT 1 FROM market_connection_requests c WHERE c.post_id=p.id)) AS openPosts,
   (SELECT count(*) ${offerRows}) AS offers,
   (SELECT count(*) ${offerRows} WHERE o.review_status='pending') AS pendingOffers,
   count(DISTINCT CASE WHEN r.status='pending' THEN r.id END) AS pendingConnections,
   count(DISTINCT CASE WHEN r.status='reviewing' THEN r.id END) AS reviewingConnections
   ${postRows} WHERE b.status='approved' AND s.status='approved'`,date).first();
 return rows;
}
async function list(env,url,page,date){
 const status=url.searchParams.get('status')||'all',q=text(url.searchParams.get('q')||'',100);
 const filters={all:'1',open:"p.review_status='approved' AND c.post_id IS NULL AND b.status='approved' AND p.deadline>=?",expired:"p.review_status='approved' AND c.post_id IS NULL AND b.status='approved' AND p.deadline<?",
   inactive:"c.post_id IS NULL AND (b.status<>'approved' OR p.review_status<>'approved')",selected:'c.post_id IS NOT NULL',pending:'r.status=?',reviewing:'r.status=?',completed:'r.status=?',rejected:'r.status=?'};
 if(!Object.hasOwn(filters,status))fail(400,'공고 상태를 확인해주세요.');
 const args=status==='open'||status==='expired'?[date]:filters[status]==='r.status=?'?[status]:[];
 let where=' WHERE '+filters[status];
 const review=url.searchParams.get('review');
 if(review&&review!=='all'){
   if(!['pending','approved','rejected','withdrawn'].includes(review))fail(400,'공개 검토 상태를 확인해주세요.');
   where+=' AND p.review_status=?';args.push(review);
 }
 if(q){where+=" AND (instr(lower(p.title),lower(?)) OR instr(lower(b.name),lower(?)) OR p.id=?)";args.push(q,q,q);}
 const [rows,total,summary]=await Promise.all([
   stmt(env,`SELECT ${postFields} ${postRows}${where} ORDER BY p.created_at DESC,p.id DESC LIMIT ? OFFSET ?`,...args,pageSize,(page-1)*pageSize).all(),
   stmt(env,`SELECT count(*) AS n ${postRows}${where}`,...args).first(),counts(env,date)]);
 return json({posts:rows.results.map(p=>postView(p,date)),total:total.n,page,pageSize,counts:summary});
}
async function detail(env,id,page,date){
 const p=await stmt(env,`SELECT ${postFields} ${postRows} WHERE p.id=?`,id).first();
 if(!p)fail(404,'공고를 찾을 수 없습니다.');
 const [offers,selected,events,offerEvents,agreements]=await Promise.all([
   stmt(env,`SELECT ${offerFields} ${offerRows} WHERE p.id=? ORDER BY o.created_at,o.id LIMIT ? OFFSET ?`,id,pageSize,(page-1)*pageSize).all(),
   p.request_id?stmt(env,`SELECT ${offerFields} ${offerRows} WHERE p.id=? AND o.id=?`,id,p.offer_id).first():null,
   stmt(env,'SELECT version,action,actor,reason,created_at AS createdAt FROM market_post_reviews WHERE post_id=? ORDER BY version DESC',id).all(),
   stmt(env,'SELECT r.offer_id AS offerId,r.version,r.action,r.reason,r.created_at AS createdAt FROM market_offer_reviews r JOIN market_offers o ON o.id=r.offer_id WHERE o.post_id=? ORDER BY r.version DESC',id).all(),
   stmt(env,"SELECT purpose,resource_id AS resourceId,version,document_json,signature,signed_at AS signedAt FROM submission_agreements WHERE (purpose='post' AND resource_id=?) OR (purpose='offer' AND resource_id IN (SELECT id FROM market_offers WHERE post_id=?)) ORDER BY signed_at",id,id).all()]);
 return json({post:{...postView(p,date),size:p.size,description:p.description,
   brand:{name:p.brand_name,contact:p.brand_contact,phone:p.brand_phone,email:p.brand_email,businessNumber:p.brand_business_number}},
   offers:offers.results.map(o=>({...offerView(o),reviewEvents:offerEvents.results.filter(e=>e.offerId===o.id)})),selectedOffer:selected?offerView(selected):null,
   total:p.offer_count,page,pageSize,reviewEvents:events.results,agreements:agreements.results.map(({document_json,...row})=>({...row,document:JSON.parse(document_json)}))});
}
async function offerList(env,url,page){
 const review=url.searchParams.get('review')||'pending',q=text(url.searchParams.get('q')||'',100);
 if(!['all','pending','approved','rejected','withdrawn'].includes(review))fail(400,'입찰 심사 상태를 확인해주세요.');
 const args=[],filters=[];
 if(review!=='all'){filters.push('o.review_status=?');args.push(review);}
 if(q){filters.push('(instr(lower(p.title),lower(?)) OR instr(lower(b.name),lower(?)) OR instr(lower(s.name),lower(?)))');args.push(q,q,q);}
 const where=filters.length?' WHERE '+filters.join(' AND '):'';
 const [rows,total]=await Promise.all([
   stmt(env,`SELECT ${offerFields},p.title,b.name AS brand_name,
     (SELECT count(*) FROM market_offers earlier JOIN members m ON m.id=earlier.supplier_id AND m.role='supplier' AND ${marketConsent('m')}
       WHERE earlier.post_id=o.post_id AND (earlier.created_at<o.created_at OR (earlier.created_at=o.created_at AND earlier.id<=o.id))) AS position
     ${offerRows}${where} ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?`,...args,pageSize,(page-1)*pageSize).all(),
   stmt(env,`SELECT count(*) AS n ${offerRows}${where}`,...args).first()
 ]);
 return json({offers:rows.results.map(o=>({...offerView(o),title:o.title,brandName:o.brand_name,offerPage:Math.ceil(o.position/pageSize)})),total:total.n,page,pageSize});
}
async function connect(req,env,user,id){
 const input=await body(req);
 if(input.confirmed!==true||input.explained!==true||!Number.isSafeInteger(input.version)||input.version<1)fail(400,'선정 조건과 양측 유선 안내 완료 여부를 확인해주세요.');
 const note=text(input.note,1000);
 const row=await stmt(env,`SELECT r.id,r.status,r.version,p.review_status,chosen.review_status AS offer_review,b.id AS brand_id,s.id AS supplier_id,b.status AS brand_status,s.status AS supplier_status,
   partner.id AS partner_id,partner.status AS partner_status ${postRows} WHERE p.id=? AND r.id IS NOT NULL`,id).first();
 if(!row)fail(404,'연결할 선정 제안을 찾을 수 없습니다.');
 if(row.brand_status!=='approved'||row.supplier_status!=='approved')fail(409,'승인 상태인 브랜드와 제작업체만 연결할 수 있습니다.');
 if(row.status==='completed'&&row.partner_status==='active')return json({id:row.id,partnerId:row.partner_id,status:'completed'});
 if(row.review_status!=='approved'||row.offer_review!=='approved')fail(409,'공고와 입찰의 공개 승인을 먼저 확인해주세요.');
 if(!['pending','reviewing'].includes(row.status)||row.version!==input.version)fail(409,'연결 요청이 변경되었습니다. 다시 확인해주세요.');
 const created=await createPartner(env,user,row.brand_id,row.supplier_id,note,{id:row.id,postId:id,version:input.version},true);
 return json({id:row.id,partnerId:created.id,status:'completed'});
}

export async function adminMarketApi(req,env,url,user){
 const offers=url.pathname.match(/^\/api\/admin\/market\/offers(?:\/([a-f0-9-]{36})\/review)?$/);
 if(offers){
   owner(user);
   if(offers[1]&&req.method==='POST'){
     await rate(env,'market-admin:'+user.id,60,3600);
     return reviewOffer(env,user,offers[1],await body(req));
   }
   if(offers[1]||req.method!=='GET')fail(405,'지원하지 않는 입찰 요청입니다.');
   const page=Number(url.searchParams.get('page')||1);
   if(!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'페이지 번호를 확인해주세요.');
   return offerList(env,url,page);
 }
 const match=url.pathname.match(/^\/api\/admin\/market\/posts(?:\/([a-f0-9-]{36})(\/(?:connect|review))?)?$/);
 if(!match)return null;
 owner(user);
 if(req.method==='POST'&&match[2]){
   await rate(env,'market-admin:'+user.id,60,3600);
   return match[2]==='/review'?reviewPost(env,user,match[1],await body(req),{admin:true,live:true}):connect(req,env,user,match[1]);
 }
 if(req.method!=='GET'||match[2])fail(405,'지원하지 않는 공고 요청입니다.');
 const page=Number(url.searchParams.get('page')||1);
 if(!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'페이지 번호를 확인해주세요.');
 return match[1]?detail(env,match[1],page,today()):list(env,url,page,today());
}
