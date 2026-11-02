import {body,fail,json,now,stmt,text,rate} from './http.js';
import {owner} from './auth.js';
import {memberIdentity} from './members.js';
import {marketConsent} from './policy.js';
import {currentMember} from './member-lifecycle.js';

const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const select=`SELECT p.*,b.name AS brand_name,b.contact AS brand_contact,b.phone AS brand_phone,CASE WHEN ${currentMember('b')} THEN b.status ELSE 'suspended' END AS brand_status,s.name AS supplier_name,s.contact AS supplier_contact,s.phone AS supplier_phone,CASE WHEN ${currentMember('s')} THEN s.status ELSE 'suspended' END AS supplier_status FROM member_partners p JOIN members b ON b.id=p.brand_id JOIN members s ON s.id=p.supplier_id`;
const available=row=>row.status==='active'&&row.brand_status==='approved'&&row.supplier_status==='approved';
async function eligible(env,brandId,supplierId){
 if(!uuid(brandId)||!uuid(supplierId))fail(400,'연결할 브랜드와 제작 업체를 선택해주세요.');
 const row=await stmt(env,`SELECT b.id FROM members b JOIN members s ON s.id=? WHERE b.id=? AND b.role='brand' AND s.role='supplier' AND b.status='approved' AND s.status='approved' AND ${currentMember('b')} AND ${currentMember('s')}`,supplierId,brandId).first();
 if(!row)fail(400,'이용 중인 브랜드와 제작 업체만 연결할 수 있습니다.');
}
function completeMatchingRequests(env,brandId,supplierId,actor,eventId,time){
 const note='운영팀이 거래를 연결했습니다.',prefix=crypto.randomUUID();
 // A partner audit event guards completion inside the same transaction.
 return [
  stmt(env,`INSERT INTO matching_request_events(id,request_id,actor,status,note,created_at) SELECT ? || ':' || id,id,?,'completed',?,? FROM matching_requests WHERE status IN ('pending','reviewing') AND ((requester_id=? AND target_id=?) OR (requester_id=? AND target_id=?)) AND EXISTS(SELECT 1 FROM member_partner_events WHERE id=?)`,prefix,actor,note,time,brandId,supplierId,supplierId,brandId,eventId),
  stmt(env,`UPDATE matching_requests SET status='completed',note=?,version=version+1,updated_at=? WHERE EXISTS(SELECT 1 FROM matching_request_events WHERE id=? || ':' || matching_requests.id)`,note,time,prefix),
 ];
}

// A legacy connection has its own consent rules. If there is an open market selection,
// connecting this pair also completes that selection and requires both market consents.
const marketGate=`(NOT EXISTS(SELECT 1 FROM matching_requests r JOIN market_connection_requests c ON c.request_id=r.id
 WHERE r.requester_id=b.id AND r.target_id=s.id AND r.status IN ('pending','reviewing'))
 OR (${marketConsent('b')} AND ${marketConsent('s')}))`;
export async function createPartner(env,user,brandId,supplierId,note,selection=null){
 await eligible(env,brandId,supplierId);
 const id=crypto.randomUUID(),time=now(),eventId=crypto.randomUUID();
 const chosen=selection?` AND EXISTS(SELECT 1 FROM matching_requests r JOIN market_connection_requests c ON c.request_id=r.id
   JOIN market_posts p ON p.id=c.post_id JOIN market_offers o ON o.post_id=p.id AND o.id=c.offer_id
   WHERE c.post_id=? AND r.id=? AND r.version=? AND r.status IN ('pending','reviewing') AND r.requester_id=b.id
   AND r.target_id=s.id AND p.brand_id=b.id AND o.supplier_id=s.id)`:'';
 const args=selection?[selection.postId,selection.id,selection.version]:[];
 const pair=`b.role='brand' AND s.role='supplier' AND b.status='approved' AND s.status='approved' AND ${currentMember('b')} AND ${currentMember('s')} AND ${marketGate}${chosen}`;
 const result=await env.DB.batch([
   stmt(env,`INSERT OR IGNORE INTO member_partners(id,brand_id,supplier_id,created_at,updated_at) SELECT ?,b.id,s.id,?,? FROM members b JOIN members s ON s.id=? WHERE b.id=? AND ${pair}`,id,time,time,supplierId,brandId,...args),
   stmt(env,'INSERT INTO member_partner_events SELECT ?,?,?,?,?,? WHERE changes()=1',eventId,id,user.display_name,'매칭 등록',note,time),
   stmt(env,`INSERT INTO member_partner_events SELECT ?,p.id,?,'매칭 연결 확인',?,? FROM member_partners p JOIN members b ON b.id=p.brand_id JOIN members s ON s.id=p.supplier_id WHERE p.brand_id=? AND p.supplier_id=? AND p.status='active' AND ${pair} AND NOT EXISTS(SELECT 1 FROM member_partner_events WHERE id=?) AND EXISTS(SELECT 1 FROM matching_requests WHERE status IN ('pending','reviewing') AND ((requester_id=p.brand_id AND target_id=p.supplier_id) OR (requester_id=p.supplier_id AND target_id=p.brand_id)))`,eventId,user.display_name,note,time,brandId,supplierId,...args,eventId),
   ...completeMatchingRequests(env,brandId,supplierId,user.display_name,eventId,time),
 ]);
 if(result[0].meta.changes)return {id,created:true};
 const existing=await stmt(env,`SELECT p.id,p.status,(${marketGate} AND b.status='approved' AND s.status='approved' AND ${currentMember('b')} AND ${currentMember('s')}) AS eligible FROM member_partners p JOIN members b ON b.id=p.brand_id JOIN members s ON s.id=p.supplier_id WHERE p.brand_id=? AND p.supplier_id=?`,brandId,supplierId).first();
 if(existing?.status==='active'){
   if(!existing.eligible)fail(409,'회원 상태나 정식 동의를 다시 확인해주세요.');
   if(selection&&!await stmt(env,"SELECT id FROM matching_requests WHERE id=? AND status='completed'",selection.id).first())
     fail(409,'연결 요청이나 회원 상태가 변경되었습니다. 다시 확인해주세요.');
   return {id:existing.id,created:false};
 }
 if(existing)fail(409,'종료된 매칭입니다. 기존 매칭에서 다시 연결해주세요.');
 fail(409,'연결 요청이나 회원 상태가 변경되었습니다. 다시 확인해주세요.');
}

export async function partnerApi(req,env,url,adminUser){
 const admin=!!adminUser,base=admin?'/api/admin/partners':'/api/partners',path=url.pathname;
 if(path!==base&&!path.startsWith(`${base}/`))return null;
 const user=adminUser||await memberIdentity(req,env);if(admin)owner(user);
 if(req.method!=='GET')await rate(env,`partners-write:${user.id}`,60,3600);
 if(path===base&&req.method==='GET'){
  const memberId=admin?url.searchParams.get('memberId'):user.id;
  if(memberId!==null&&!uuid(memberId))fail(400,'회원을 확인해주세요.');
  if(admin&&memberId!==null&&!await stmt(env,'SELECT id FROM members WHERE id=?',memberId).first())fail(404,'회원을 찾을 수 없습니다.');
  const where=memberId===null?'':'WHERE p.brand_id=? OR p.supplier_id=?';
  const rows=await stmt(env,`${select} ${where} ORDER BY p.created_at DESC,p.id DESC`,...(memberId===null?[]:[memberId,memberId])).all();
  const partners=[];
  for(const row of rows.results){
   if(admin){
    const events=await stmt(env,'SELECT actor,action,note,created_at FROM member_partner_events WHERE partner_id=? ORDER BY created_at DESC,rowid DESC',row.id).all();
    partners.push({...row,available:available(row),events:events.results});
   }else{
    const counterpart=user.role==='brand'?'supplier':'brand';
    partners.push({id:row.id,brand_id:row.brand_id,supplier_id:row.supplier_id,brand_name:row.brand_name,supplier_name:row.supplier_name,partner_name:row[`${counterpart}_name`],partner_contact:row[`${counterpart}_contact`],partner_phone:row[`${counterpart}_phone`],status:row.status,available:available(row),version:row.version,created_at:row.created_at,updated_at:row.updated_at});
   }
  }
  return json({partners});
 }
 if(admin&&path===base&&req.method==='POST'){
  const input=await body(req),result=await createPartner(env,user,input.brandId,input.supplierId,text(input.note,1000));
  return json({id:result.id},result.created?201:200);
 }
 const match=path.match(/^\/api\/admin\/partners\/([a-f0-9-]{36})$/);
 if(admin&&match&&req.method==='PATCH'){
  const input=await body(req),note=text(input.note,1000);
  if(!['active','ended'].includes(input.status)||!Number.isSafeInteger(input.version))fail(400,'매칭 상태와 버전을 확인해주세요.');
  const row=await stmt(env,'SELECT * FROM member_partners WHERE id=?',match[1]).first();if(!row)fail(404,'매칭을 찾을 수 없습니다.');
  if(row.version!==input.version)fail(409,'매칭 내용이 변경되었습니다. 새로고침해주세요.');
  if(row.status===input.status)return json({ok:true});
  if(input.status==='active')await eligible(env,row.brand_id,row.supplier_id);
  const time=now(),eventId=crypto.randomUUID(),result=await env.DB.batch([
   stmt(env,`UPDATE member_partners SET status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND (?='ended' OR EXISTS(SELECT 1 FROM members b JOIN members s ON s.id=member_partners.supplier_id WHERE b.id=member_partners.brand_id AND b.role='brand' AND s.role='supplier' AND b.status='approved' AND s.status='approved' AND ${currentMember('b')} AND ${currentMember('s')} AND ${marketGate}))`,input.status,time,row.id,input.version,input.status),
   stmt(env,'INSERT INTO member_partner_events SELECT ?,?,?,?,?,? WHERE changes()=1',eventId,row.id,user.display_name,input.status==='active'?'매칭 재개':'매칭 종료',note,time),
   ...(input.status==='active'?completeMatchingRequests(env,row.brand_id,row.supplier_id,user.display_name,eventId,time):[]),
  ]);
  if(!result[0].meta.changes)fail(409,'매칭 또는 회원 상태가 변경되었습니다. 새로고침해주세요.');
  return json({ok:true});
 }
 fail(404,'없는 매칭 기능입니다.');
}
