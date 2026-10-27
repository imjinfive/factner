import {body,fail,json,now,stmt,text,rate} from './http.js';
import {owner} from './auth.js';
import {memberIdentity,requireRole} from './members.js';

const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export async function specInput(env,user,input){
 if(!input||typeof input!=='object')fail(400,'패키징 사양을 입력해주세요.');
 const spec={name:text(input.name,100,true),size:text(input.size,100,true),material:text(input.material,100,true),printing:text(input.printing,200),finish:text(input.finish,200),description:text(input.description,2000),files:[]};
 if(!Array.isArray(input.files)||input.files.length>6)fail(400,'첨부 파일은 최대 6개입니다.');
 for(const id of [...new Set(input.files.map(f=>typeof f==='string'?f:f?.id))]){
  if(!uuid(id))fail(400,'첨부 파일을 확인해주세요.');
  const file=await stmt(env,"SELECT id,name,mime,kind FROM member_files WHERE id=? AND member_id=? AND kind IN ('design','sample')",id,user.id).first();
  if(!file)fail(400,'사용할 수 없는 첨부 파일입니다.');spec.files.push(file);
 }
 return spec;
}
const parseReview=row=>({...row,spec:JSON.parse(row.spec)});
async function listPackagings(env,brandId){
 const rows=await stmt(env,'SELECT * FROM packagings WHERE brand_id=? AND archived=0 ORDER BY favorite DESC,updated_at DESC',brandId).all();
 const reviews=await stmt(env,'SELECT * FROM packaging_reviews WHERE brand_id=? ORDER BY created_at DESC,rowid DESC',brandId).all();
 return rows.results.map(p=>{
  const pending=reviews.results.find(r=>r.packaging_id===p.id&&r.status==='pending'),last=reviews.results.find(r=>r.packaging_id===p.id);
  return {...p,spec:JSON.parse(p.spec),status:p.approval_status,pendingReview:pending?parseReview(pending):null,reviewNote:last?.note||'',lastReviewStatus:last?.status||null};
 });
}
async function brandMember(env,id){
 const member=await stmt(env,"SELECT id,role,status FROM members WHERE id=? AND role='brand'",id).first();if(!member)fail(404,'브랜드 회원을 찾을 수 없습니다.');return member;
}
export async function packagingApi(req,env,url,adminUser){
 const path=url.pathname,admin=!!adminUser;
 const managed=path.match(/^\/api\/admin\/members\/([a-f0-9-]{36})\/packagings(?:\/([a-f0-9-]{36}))?$/);
 const own=path.match(/^\/api\/packagings(?:\/([a-f0-9-]{36}))?$/);
 const review=path.match(/^\/api\/admin\/packaging-reviews(?:\/([a-f0-9-]{36}))?$/);
 if(!managed&&!own&&!review)return null;
 if((managed||review)&&!admin)return null;
 if(admin&&own)return null;
 const user=adminUser||await memberIdentity(req,env);if(admin)owner(user);else requireRole(user,'brand');
 if(req.method!=='GET')await rate(env,`packaging-write:${user.id}`,100,3600);
 if(review){
  if(!review[1]&&req.method==='GET'){
   const brandId=url.searchParams.get('memberId'),status=url.searchParams.get('status')||'';
   if(brandId!==null&&!uuid(brandId))fail(400,'회원을 확인해주세요.');
   if(!['','pending','approved','rejected'].includes(status))fail(400,'검토 상태를 확인해주세요.');
   const rows=await stmt(env,`SELECT r.*,b.name AS brand_name,p.spec AS current_spec,p.approval_status FROM packaging_reviews r JOIN members b ON b.id=r.brand_id JOIN packagings p ON p.id=r.packaging_id WHERE (? IS NULL OR r.brand_id=?) AND (?='' OR r.status=?) ORDER BY (r.status='pending') DESC,r.created_at DESC,r.id DESC LIMIT 500`,brandId,brandId,status,status).all();
   return json({reviews:rows.results.map(row=>({...parseReview(row),current_spec:JSON.parse(row.current_spec)}))});
  }
  if(review[1]&&req.method==='PATCH'){
   const input=await body(req),note=text(input.note,1500);
   if(input.confirmed!==true||!['approve','reject'].includes(input.action)||!Number.isSafeInteger(input.version))fail(400,'검토 결과와 내용을 다시 확인해주세요.');
   if(input.action==='reject'&&!note)fail(400,'보완할 내용을 입력해주세요.');
   const row=await stmt(env,'SELECT * FROM packaging_reviews WHERE id=?',review[1]).first();if(!row)fail(404,'검토 요청을 찾을 수 없습니다.');
   if(row.status!=='pending'||row.version!==input.version)fail(409,'이미 처리했거나 변경된 요청입니다.');
   const packaging=await stmt(env,'SELECT * FROM packagings WHERE id=?',row.packaging_id).first();
   if(packaging.archived||packaging.version!==row.base_version)fail(409,'패키징이 변경되었습니다. 새로고침해주세요.');
   const spec=await specInput(env,{id:row.brand_id},input.spec||JSON.parse(row.spec)),time=now(),status=input.action==='approve'?'approved':'rejected';
   const result=await env.DB.batch([
    stmt(env,`UPDATE packagings SET spec=CASE WHEN ?='approved' THEN ? ELSE spec END,approval_status=CASE WHEN ?='approved' THEN 'approved' ELSE approval_status END,version=version+1,updated_at=? WHERE id=? AND version=? AND archived=0 AND EXISTS(SELECT 1 FROM packaging_reviews WHERE id=? AND status='pending' AND version=?)`,status,JSON.stringify(spec),status,time,packaging.id,row.base_version,row.id,input.version),
    stmt(env,"UPDATE packaging_reviews SET status=?,spec=?,note=?,reviewed_by=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status='pending' AND changes()=1",status,JSON.stringify(spec),note,user.display_name,time,row.id,input.version),
    stmt(env,'INSERT INTO member_profile_events SELECT ?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),row.brand_id,user.display_name,JSON.stringify({packaging:{id:packaging.id,action:status,before:JSON.parse(packaging.spec),submitted:JSON.parse(row.spec),after:status==='approved'?spec:JSON.parse(packaging.spec),note}}),time),
   ]);if(!result[0].meta.changes)fail(409,'패키징 또는 검토 요청이 변경되었습니다. 다시 확인해주세요.');return json({ok:true,status});
  }
  fail(404,'없는 패키징 검토 기능입니다.');
 }
 const brand=admin?await brandMember(env,managed[1]):user,id=admin?managed[2]:own[1];
 if(!id&&req.method==='GET')return json({packagings:await listPackagings(env,brand.id)});
 if(!id&&req.method==='POST'){
  const input=await body(req),spec=await specInput(env,brand,input.spec),id=crypto.randomUUID(),time=now();
  if(input.confirmed!==true)fail(400,'등록할 패키징 정보를 다시 확인해주세요.');
  const count=await stmt(env,'SELECT count(*) AS n FROM packagings WHERE brand_id=? AND archived=0',brand.id).first();if(count.n>=200)fail(400,'패키징은 최대 200개까지 저장할 수 있어요.');
  await env.DB.batch([
   stmt(env,'INSERT INTO packagings(id,brand_id,spec,favorite,approval_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,brand.id,JSON.stringify(spec),input.favorite===true?1:0,admin?'approved':'pending',time,time),
   ...(admin?[stmt(env,'INSERT INTO member_profile_events VALUES(?,?,?,?,?)',crypto.randomUUID(),brand.id,user.display_name,JSON.stringify({packaging:{id,action:'approved',before:null,after:spec}}),time)]:[stmt(env,'INSERT INTO packaging_reviews(id,packaging_id,brand_id,spec,base_version,submitted_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),id,brand.id,JSON.stringify(spec),1,user.id,time,time)]),
  ]);return json({id,status:admin?'approved':'pending'},201);
 }
 if(id&&req.method==='PATCH'){
  const input=await body(req),row=await stmt(env,'SELECT * FROM packagings WHERE id=? AND brand_id=? AND archived=0',id,brand.id).first();if(!row)fail(404,'패키징을 찾을 수 없습니다.');
  if(!Number.isSafeInteger(input.version)||input.version!==row.version)fail(409,'패키징이 변경되었습니다. 다시 열어주세요.');
  const pending=await stmt(env,"SELECT id FROM packaging_reviews WHERE packaging_id=? AND status='pending'",row.id).first();
  if(input.spec){
   if(input.confirmed!==true)fail(400,'변경할 패키징 정보를 다시 확인해주세요.');
   if(pending)fail(409,'검토 중인 요청이 있습니다. 운영팀 검토 후 다시 수정해주세요.');
   const spec=await specInput(env,brand,input.spec),time=now();
   const result=await env.DB.batch([
    stmt(env,`UPDATE packagings SET spec=CASE WHEN ?=1 THEN ? ELSE spec END,approval_status=CASE WHEN ?=1 THEN 'approved' ELSE approval_status END,favorite=?,version=version+1,updated_at=? WHERE id=? AND brand_id=? AND version=? AND archived=0 AND NOT EXISTS(SELECT 1 FROM packaging_reviews WHERE packaging_id=? AND status='pending')`,admin?1:0,JSON.stringify(spec),admin?1:0,typeof input.favorite==='boolean'?Number(input.favorite):row.favorite,time,row.id,brand.id,input.version,row.id),
    admin?stmt(env,'INSERT INTO member_profile_events SELECT ?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),brand.id,user.display_name,JSON.stringify({packaging:{id:row.id,action:'approved',before:JSON.parse(row.spec),after:spec}}),time):stmt(env,'INSERT INTO packaging_reviews(id,packaging_id,brand_id,spec,base_version,submitted_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),row.id,brand.id,JSON.stringify(spec),input.version+1,user.id,time,time),
   ]);if(!result[0].meta.changes)fail(409,'패키징이 변경되었습니다. 다시 열어주세요.');return json({ok:true,status:admin?'approved':'pending'});
  }
  if(pending&&input.archived===true)fail(409,'검토 중인 패키징은 보관할 수 없습니다.');
  const archiving=input.archived===true?1:0;
  const result=await stmt(env,"UPDATE packagings SET favorite=?,archived=CASE WHEN ?=1 THEN 1 ELSE archived END,version=version+?,updated_at=? WHERE id=? AND brand_id=? AND version=? AND archived=0 AND (?<>1 OR NOT EXISTS(SELECT 1 FROM packaging_reviews WHERE packaging_id=? AND status='pending'))",typeof input.favorite==='boolean'?Number(input.favorite):row.favorite,archiving,archiving,now(),row.id,brand.id,input.version,archiving,row.id).run();
  if(!result.meta.changes)fail(409,'패키징이 변경되었습니다. 다시 열어주세요.');return json({ok:true});
 }
 fail(404,'없는 패키징 기능입니다.');
}
