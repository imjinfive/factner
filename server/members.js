import {body,fail,json,now,stmt,text,rate} from './http.js';
import {digest,passwordHash,verifyPassword,randomToken} from './security.js';
import {owner} from './auth.js';
import {verifyQuoteSubmission} from './spam.js';

const consentVersion='member-pilot-2026-10-21';
const fields='id,email,role,legal_type,name,contact,phone,business_number,status,review_note,created_at,updated_at,version';
const labels={pending:'가입 심사 중입니다. 승인 후 로그인할 수 있어요.',rejected:'가입이 보류되었습니다.',suspended:'이용이 중지된 계정입니다.'};
const cookie=(req,value,seconds)=>`factner_member=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
const sessionToken=req=>req.headers.get('Cookie')?.match(/(?:^|;\s*)factner_member=([a-f0-9]{64})(?:;|$)/)?.[1];
export async function memberIdentity(req,env) {
 const token=sessionToken(req);
 if(!token)fail(401,'로그인이 필요합니다.');
 const row=await stmt(env,`SELECT m.* FROM member_sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at>? AND s.member_version=m.version AND m.status='approved'`,await digest(token),Date.now()).first();
 if(!row)fail(401,'다시 로그인해주세요.');
 delete row.password_hash;delete row.consent_version;return row;
}
export function requireRole(user,role){if(user.role!==role)fail(403,'이 계정에서 사용할 수 없는 기능입니다.');}
function loginInput(input){
 const email=text(input.email,254,true).toLowerCase(),password=input.password;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'이메일을 확인해주세요.');
 if(typeof password!=='string'||password.length<12||password.length>128)fail(400,'비밀번호는 12~128자로 입력해주세요.');
 return {email,password};
}
export function fileInput(input,allowed){
 if(!input||!allowed.includes(input.kind))fail(400,'파일 종류를 확인해주세요.');
 const name=text(input.name,150,true),mime=input.mime;
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(mime)||((input.kind==='workplace'||input.kind==='sample')&&mime==='application/pdf'))fail(400,'JPG, PNG, WEBP 또는 PDF 파일을 선택해주세요.');
 if(typeof input.data!=='string'||input.data.length>2097152||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))fail(400,'파일은 1.5MB 이하로 선택해주세요.');
 let bytes;try{bytes=Uint8Array.from(atob(input.data),c=>c.charCodeAt(0));}catch{fail(400,'파일을 읽을 수 없습니다.');}
 if(!bytes.length||bytes.length>1572864)fail(400,'파일은 1.5MB 이하로 선택해주세요.');
 const prefix=new TextDecoder().decode(bytes.slice(0,12));
 const valid=mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):mime==='image/webp'?prefix.startsWith('RIFF')&&prefix.slice(8)==='WEBP':prefix.startsWith('%PDF-');
 if(!valid)fail(400,'파일 내용과 형식이 일치하지 않습니다.');
 return {id:crypto.randomUUID(),kind:input.kind,name,mime,size:bytes.length,bytes};
}
export const fileStatement=(env,memberId,file)=>stmt(env,'INSERT INTO member_files VALUES(?,?,?,?,?,?,?,?)',file.id,memberId,file.kind,file.name,file.mime,file.size,file.bytes.buffer,now());
export async function memberFile(req,env,id,user,admin=false){
 const file=await stmt(env,'SELECT * FROM member_files WHERE id=?',id).first();
 if(!file)fail(404,'파일을 찾을 수 없습니다.');
 if(!admin&&file.member_id!==user.id){
  const shared=await stmt(env,`SELECT o.id FROM order_files f JOIN orders o ON o.id=f.order_id WHERE f.file_id=? AND o.supplier_id=? AND (o.status NOT IN ('requested','matched','cancelled') OR (o.status='cancelled' AND o.shared_at IS NOT NULL))`,id,user.id).first();
  if(!shared||!['design','sample'].includes(file.kind))fail(404,'파일을 찾을 수 없습니다.');
 }
 const bytes=file.content instanceof ArrayBuffer?file.content:new Uint8Array(file.content);
 return new Response(bytes,{headers:{'Content-Type':file.mime,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${file.mime==='application/pdf'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g,'%27')}`}});
}
export async function memberApi(req,env,url){
 const path=url.pathname;
 if(!path.startsWith('/api/member/'))return null;
 if(path==='/api/member/config'&&req.method==='GET')return json({pilot:true,consentVersion,turnstileSiteKey:env.TURNSTILE_SECRET_KEY?env.TURNSTILE_SITE_KEY||'':''});
 if(path==='/api/member/register'&&req.method==='POST'){
  await rate(env,`signup:${await digest(req.headers.get('CF-Connecting-IP')||'local')}`,10,3600);
  const input=await body(req,11000000),{email,password}=loginInput(input);
  if(input.testOnly!==true||input.consent!==true||input.consentVersion!==consentVersion)fail(400,'테스트 가입 안내와 개인정보 수집 내용을 확인해주세요.');
  if(!['brand','supplier'].includes(input.role)||!['individual','sole','corporate'].includes(input.legalType))fail(400,'가입 유형을 선택해주세요.');
  const name=text(input.name,100,true),contact=text(input.contact,60,true),phone=text(input.phone,30,true),number=text(input.businessNumber,12).replace(/-/g,'');
  if(!/^[+0-9 ()-]{7,30}$/.test(phone))fail(400,'연락처를 확인해주세요.');
  if(input.legalType!=='individual'&&!/^\d{10}$/.test(number))fail(400,'사업자등록번호 10자리를 입력해주세요.');
  if(!Array.isArray(input.files)||input.files.length>5)fail(400,'첨부 파일은 최대 5개입니다.');
  const files=input.files.map(f=>fileInput(f,['certificate','workplace']));
  if(input.legalType!=='individual'&&!files.some(f=>f.kind==='certificate'))fail(400,'사업자등록증을 첨부해주세요.');
  await verifyQuoteSubmission(req,env,{...input,email},{accepting:false},'signup');
  const existing=await stmt(env,'SELECT id FROM members WHERE email=?',email).first();
  if(existing)fail(409,'이 이메일로 접수된 가입 신청이 있습니다. 로그인에서 심사 상태를 확인해주세요.');
  const id=crypto.randomUUID(),date=now();
  try{await env.DB.batch([
   stmt(env,`INSERT INTO members(id,email,password_hash,role,legal_type,name,contact,phone,business_number,consent_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,id,email,await passwordHash(password),input.role,input.legalType,name,contact,phone,input.legalType==='individual'?'':number,consentVersion,date,date),
   ...files.map(f=>fileStatement(env,id,f)),
  ]);}catch(error){if(String(error.message).includes('UNIQUE'))fail(409,'이미 접수된 이메일입니다.');throw error;}
  return json({status:'pending'},201);
 }
 if(path==='/api/member/login'&&req.method==='POST'){
  await rate(env,`member-login:${await digest(req.headers.get('CF-Connecting-IP')||'local')}`,30,900);
  const {email,password}=loginInput(await body(req));
  await rate(env,`member-login-email:${await digest(email)}`,10,900);
  const row=await stmt(env,'SELECT * FROM members WHERE email=?',email).first();
  const valid=await verifyPassword(password,row?.password_hash||`${'0'.repeat(64)}:${'0'.repeat(64)}`);
  if(!row||!valid)fail(401,'이메일 또는 비밀번호를 확인해주세요.');
  if(row.status!=='approved')return json({error:labels[row.status],status:row.status,note:row.review_note},403);
  const token=randomToken();
  await stmt(env,'INSERT INTO member_sessions VALUES(?,?,?,?)',await digest(token),row.id,Date.now()+8*3600000,row.version).run();
  delete row.password_hash;delete row.consent_version;
  return json({member:row},200,{'Set-Cookie':cookie(req,token,8*3600)});
 }
 if(path==='/api/member/logout'&&req.method==='POST'){
  const token=sessionToken(req);if(token)await stmt(env,'DELETE FROM member_sessions WHERE token_hash=?',await digest(token)).run();
  return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});
 }
 const user=await memberIdentity(req,env);
 if(path==='/api/member/me'&&req.method==='GET')return json({member:user});
 if(path==='/api/member/password'&&req.method==='POST'){
  await rate(env,`member-password:${user.id}`,10,3600);
  const input=await body(req),{password}=loginInput({email:user.email,password:input.newPassword});
  const row=await stmt(env,'SELECT password_hash FROM members WHERE id=?',user.id).first();
  if(typeof input.currentPassword!=='string'||input.currentPassword.length>128||!await verifyPassword(input.currentPassword,row.password_hash))fail(400,'현재 비밀번호를 확인해주세요.');
  await env.DB.batch([stmt(env,'UPDATE members SET password_hash=?,updated_at=?,version=version+1 WHERE id=?',await passwordHash(password),now(),user.id),stmt(env,'DELETE FROM member_sessions WHERE member_id=?',user.id)]);
  return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});
 }
 if(path==='/api/member/files'&&req.method==='POST'){
  await rate(env,`member-files:${user.id}`,40,3600);
  const count=await stmt(env,'SELECT count(*) AS n FROM member_files WHERE member_id=?',user.id).first();
  if(count.n>=200)fail(400,'파일 보관 한도에 도달했습니다. 운영팀에 문의해주세요.');
  const file=fileInput(await body(req,2200000),['design','sample']);
  await fileStatement(env,user.id,file).run();
  return json({file:{id:file.id,name:file.name,mime:file.mime,kind:file.kind}},201);
 }
 const file=path.match(/^\/api\/member\/files\/([a-f0-9-]{36})$/);
 if(file&&req.method==='GET')return memberFile(req,env,file[1],user);
 fail(404,'없는 회원 기능입니다.');
}
export async function memberAdminApi(req,env,url,user){
 const path=url.pathname;if(!path.startsWith('/api/admin/members'))return null;owner(user);
 if(path==='/api/admin/members'&&req.method==='GET'){
  const query=text(url.searchParams.get('q')||'',100),q=`%${query.replace(/[\\%_]/g,'\\$&')}%`,status=url.searchParams.get('status')||'',role=url.searchParams.get('role')||'',legalType=url.searchParams.get('legalType')||'';
  if(!['','pending','approved','rejected','suspended'].includes(status)||!['','brand','supplier'].includes(role)||!['','individual','sole','corporate'].includes(legalType))fail(400,'회원 검색 조건을 확인해주세요.');
  const digits=query.replace(/[+ ()-]/g,''),number=/^\d+$/.test(digits)?`%${digits}%`:'';
  const page=Math.max(1,Math.min(10000,Number.parseInt(url.searchParams.get('page'),10)||1));
  const where=`WHERE (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR contact LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR business_number LIKE ? ESCAPE '\\' OR (?<>'' AND (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'-',''),' ',''),'(',''),')',''),'+','') LIKE ? OR business_number LIKE ?))) AND (?='' OR role=?) AND (?='' OR legal_type=?)`;
  const args=[q,q,q,q,q,number,number,number,role,role,legalType,legalType];
  const grouped=await stmt(env,`SELECT status,count(*) AS n FROM members ${where} GROUP BY status`,...args).all();
  const counts={all:0,pending:0,approved:0,rejected:0,suspended:0};for(const row of grouped.results){counts[row.status]=row.n;counts.all+=row.n;}
  const total=status?counts[status]:counts.all,lastPage=Math.max(1,Math.ceil(total/30)),currentPage=Math.min(page,lastPage);
  const rows=await stmt(env,`SELECT ${fields} FROM members ${where} AND (?='' OR status=?) ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ?`,...args,status,status,(currentPage-1)*30).all();
  return json({members:rows.results,total,page:currentPage,counts});
 }
 const file=path.match(/^\/api\/admin\/members\/files\/([a-f0-9-]{36})$/);
 if(file&&req.method==='GET')return memberFile(req,env,file[1],user,true);
 const match=path.match(/^\/api\/admin\/members\/([a-f0-9-]{36})$/);
 if(match){
  const member=await stmt(env,`SELECT ${fields} FROM members WHERE id=?`,match[1]).first();if(!member)fail(404,'회원을 찾을 수 없습니다.');
  if(req.method==='GET'){
   const files=await stmt(env,"SELECT id,name,mime,kind FROM member_files WHERE member_id=? AND kind IN ('certificate','workplace')",member.id).all();
   const reviews=await stmt(env,'SELECT actor,status,note,created_at FROM member_reviews WHERE member_id=? ORDER BY created_at DESC,rowid DESC',member.id).all();
   const orderCounts=await stmt(env,`SELECT count(*) AS total,COALESCE(SUM(status NOT IN ('received','cancelled')),0) AS active,COALESCE(SUM(status='received'),0) AS received,COALESCE(SUM(status='cancelled'),0) AS cancelled FROM orders WHERE ${member.role==='brand'?'brand_id':'supplier_id'}=?`,member.id).first();
   const profileEvents=await stmt(env,'SELECT actor,changes,created_at FROM member_profile_events WHERE member_id=? ORDER BY created_at DESC,rowid DESC LIMIT 50',member.id).all();
   return json({member,files:files.results,reviews:reviews.results,orderCounts,profileEvents:profileEvents.results.map(e=>({...e,changes:JSON.parse(e.changes)}))});
  }
  if(req.method==='PATCH'){
   const input=await body(req),note=text(input.note,1000);
   if(input.action==='profile'){
    if(Object.keys(input).some(key=>!['action','version','name','contact','phone'].includes(key)))fail(400,'업체명·담당자·연락처만 수정할 수 있습니다.');
    const values={name:text(input.name,100,true),contact:text(input.contact,60,true),phone:text(input.phone,30,true)};
    if(!/^[+0-9 ()-]{7,30}$/.test(values.phone))fail(400,'연락처를 확인해주세요.');
    if(!Number.isSafeInteger(input.version)||input.version!==member.version)fail(409,'회원정보가 변경되었습니다. 새로고침해주세요.');
    const changes=Object.fromEntries(Object.entries(values).filter(([key,value])=>value!==member[key]).map(([key,value])=>[key,{before:member[key],after:value}]));
    if(!Object.keys(changes).length)return json({ok:true});
    const time=now(),result=await env.DB.batch([
     stmt(env,'UPDATE members SET name=?,contact=?,phone=?,updated_at=?,version=version+1 WHERE id=? AND version=?',values.name,values.contact,values.phone,time,member.id,input.version),
     stmt(env,'INSERT INTO member_profile_events SELECT ?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),member.id,user.display_name,JSON.stringify(changes),time),
     stmt(env,'UPDATE member_sessions SET member_version=? WHERE member_id=? AND member_version=? AND changes()=1',input.version+1,member.id,input.version),
    ]);
    if(!result[0].meta.changes)fail(409,'회원정보가 변경되었습니다. 새로고침해주세요.');
    return json({ok:true});
   }
   if(!['approved','rejected','suspended'].includes(input.status))fail(400,'심사 결과를 선택해주세요.');
   if(input.status!=='approved'&&!note)fail(400,'회원에게 안내할 사유를 입력해주세요.');
   if(!Number.isSafeInteger(input.version))fail(400,'심사 버전을 확인해주세요.');
   const result=await env.DB.batch([
    stmt(env,'UPDATE members SET status=?,review_note=?,updated_at=?,version=version+1 WHERE id=? AND version=?',input.status,note,now(),member.id,input.version),
    stmt(env,'INSERT INTO member_reviews SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),member.id,user.display_name,input.status,note,now()),
    stmt(env,'DELETE FROM member_sessions WHERE member_id=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status<>?)',member.id,member.id,'approved'),
   ]);
   if(!result[0].meta.changes)fail(409,'심사 내용이 변경되었습니다. 새로고침해주세요.');
   return json({ok:true});
  }
 }
 fail(404,'없는 회원 관리 기능입니다.');
}
