import {body,fail,json,now,stmt,text,rate} from './http.js';
import {owner} from './auth.js';
import {memberIdentity} from './members.js';

const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const select=`SELECT p.*,b.name AS brand_name,b.contact AS brand_contact,b.phone AS brand_phone,b.status AS brand_status,s.name AS supplier_name,s.contact AS supplier_contact,s.phone AS supplier_phone,s.status AS supplier_status FROM member_partners p JOIN members b ON b.id=p.brand_id JOIN members s ON s.id=p.supplier_id`;
const available=row=>row.status==='active'&&row.brand_status==='approved'&&row.supplier_status==='approved';
async function eligible(env,brandId,supplierId){
 if(!uuid(brandId)||!uuid(supplierId))fail(400,'연결할 브랜드와 제작 업체를 선택해주세요.');
 const row=await stmt(env,"SELECT b.id FROM members b JOIN members s ON s.id=? WHERE b.id=? AND b.role='brand' AND s.role='supplier' AND b.status='approved' AND s.status='approved'",supplierId,brandId).first();
 if(!row)fail(400,'이용 중인 브랜드와 제작 업체만 연결할 수 있습니다.');
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
  const input=await body(req),note=text(input.note,1000);await eligible(env,input.brandId,input.supplierId);
  const id=crypto.randomUUID(),time=now();
  const result=await env.DB.batch([
   stmt(env,`INSERT OR IGNORE INTO member_partners(id,brand_id,supplier_id,created_at,updated_at) SELECT ?,b.id,s.id,?,? FROM members b JOIN members s ON s.id=? WHERE b.id=? AND b.role='brand' AND s.role='supplier' AND b.status='approved' AND s.status='approved'`,id,time,time,input.supplierId,input.brandId),
   stmt(env,'INSERT INTO member_partner_events SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),id,user.display_name,'매칭 등록',note,time),
  ]);
  if(result[0].meta.changes)return json({id},201);
  const existing=await stmt(env,'SELECT id,status FROM member_partners WHERE brand_id=? AND supplier_id=?',input.brandId,input.supplierId).first();
  if(existing?.status==='active')return json({id:existing.id});
  if(existing)fail(409,'종료된 매칭입니다. 기존 매칭에서 다시 연결해주세요.');
  fail(409,'회원 상태가 변경되었습니다. 새로고침해주세요.');
 }
 const match=path.match(/^\/api\/admin\/partners\/([a-f0-9-]{36})$/);
 if(admin&&match&&req.method==='PATCH'){
  const input=await body(req),note=text(input.note,1000);
  if(!['active','ended'].includes(input.status)||!Number.isSafeInteger(input.version))fail(400,'매칭 상태와 버전을 확인해주세요.');
  const row=await stmt(env,'SELECT * FROM member_partners WHERE id=?',match[1]).first();if(!row)fail(404,'매칭을 찾을 수 없습니다.');
  if(row.version!==input.version)fail(409,'매칭 내용이 변경되었습니다. 새로고침해주세요.');
  if(row.status===input.status)return json({ok:true});
  if(input.status==='active')await eligible(env,row.brand_id,row.supplier_id);
  const time=now(),result=await env.DB.batch([
   stmt(env,`UPDATE member_partners SET status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND (?='ended' OR EXISTS(SELECT 1 FROM members b JOIN members s ON s.id=member_partners.supplier_id WHERE b.id=member_partners.brand_id AND b.role='brand' AND s.role='supplier' AND b.status='approved' AND s.status='approved'))`,input.status,time,row.id,input.version,input.status),
   stmt(env,'INSERT INTO member_partner_events SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),row.id,user.display_name,input.status==='active'?'매칭 재개':'매칭 종료',note,time),
  ]);
  if(!result[0].meta.changes)fail(409,'매칭 또는 회원 상태가 변경되었습니다. 새로고침해주세요.');
  return json({ok:true});
 }
 fail(404,'없는 매칭 기능입니다.');
}
