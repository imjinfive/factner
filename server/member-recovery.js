import {body,fail,json,now,stmt,text,rate} from './http.js';
import {digest,passwordHash,randomToken,memberPassword} from './security.js';

const phoneSql="REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'-',''),' ',''),'(',''),')',''),'+','')";
function emailInput(value){
 const email=text(value,254,true).toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'이메일을 확인해주세요.');
 return email;
}
function identityInput(input){
 const name=text(input.name,100,true),contact=text(input.contact,60,true),raw=text(input.phone,30,true);
 if(!/^[+0-9 ()-]{7,30}$/.test(raw))fail(400,'가입 시 등록한 연락처를 입력해주세요.');
 const phone=raw.replace(/[+ ()-]/g,'');
 if(phone.length<7)fail(400,'가입 시 등록한 연락처를 입력해주세요.');
 return {name,contact,phone};
}
const maskedEmail=email=>{const [local,domain]=email.split('@');return `${local.slice(0,Math.min(2,local.length-1))}***@${domain}`;};

export async function memberRecoveryApi(req,env,path){
 if(req.method!=='POST'||!['/api/member/find-id','/api/member/recovery-request','/api/member/reset-password'].includes(path))return null;
 await rate(env,`member-recovery-ip:${await digest(req.headers.get('CF-Connecting-IP')||'local')}`,20,3600);
 const input=await body(req);
 if(path==='/api/member/find-id'){
  const {name,contact,phone}=identityInput(input);
  await rate(env,`member-find-id:${await digest(phone)}`,5,3600);
  const rows=await stmt(env,`SELECT email FROM members WHERE name=? AND contact=? AND ${phoneSql}=? LIMIT 10`,name,contact,phone).all();
  return json({emails:[...new Set(rows.results.map(row=>maskedEmail(row.email)))]});
 }
 const email=emailInput(input.email);
 if(path==='/api/member/recovery-request'){
  const {name,contact,phone}=identityInput(input);
  await rate(env,`member-recovery-request:${await digest(email)}`,3,3600);
  const member=await stmt(env,`SELECT id FROM members WHERE email=? AND name=? AND contact=? AND ${phoneSql}=?`,email,name,contact,phone).first();
  if(member)await stmt(env,'INSERT INTO member_recovery(member_id,requested_at) VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET requested_at=excluded.requested_at',member.id,now()).run();
  return json({message:'입력하신 정보가 가입 정보와 일치하면 운영팀이 등록된 연락처로 본인 확인 후 복구 코드를 안내합니다.'});
 }
 await rate(env,`member-reset:${await digest(email)}`,10,1800);
 const code=text(input.code,128,true).replace(/[\s-]/g,'').toLowerCase();
 if(!/^[a-f0-9]{24}$/.test(code))fail(400,'복구 코드를 확인해주세요.');
 const password=memberPassword(input.newPassword),hash=await digest(code),time=Date.now();
 const member=await stmt(env,'SELECT id,version FROM members WHERE email=?',email).first();
 const password_hash=await passwordHash(password);
 if(!member)fail(400,'복구 코드가 올바르지 않거나 만료되었습니다. 다시 발급받아주세요.');
 const date=now();
 // Consume the version-bound code in the same transaction as the password change.
 const result=await env.DB.batch([
  stmt(env,'UPDATE members SET password_hash=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM member_recovery WHERE member_id=? AND token_hash=? AND expires_at>? AND member_version=? AND used_at IS NULL)',password_hash,date,member.id,member.version,member.id,hash,time,member.version),
  stmt(env,'UPDATE member_recovery SET used_at=?,token_hash=NULL,requested_at=NULL WHERE member_id=? AND changes()=1',date,member.id),
  stmt(env,'DELETE FROM member_sessions WHERE member_id=? AND changes()=1',member.id),
 ]);
 if(!result[0].meta.changes)fail(400,'복구 코드가 올바르지 않거나 만료되었습니다. 다시 발급받아주세요.');
 return json({ok:true});
}

// Called only after memberAdminApi has checked the owner role.
export async function memberRecoveryAdminApi(req,env,path,user){
 if(path==='/api/admin/members/recovery'&&req.method==='GET'){
  const rows=await stmt(env,'SELECT r.member_id,m.name,m.email,m.contact,m.phone,r.requested_at FROM member_recovery r JOIN members m ON m.id=r.member_id WHERE r.requested_at IS NOT NULL ORDER BY r.requested_at LIMIT 100').all();
  return json({requests:rows.results});
 }
 const match=path.match(/^\/api\/admin\/members\/([a-f0-9-]{36})\/recovery-code$/);
 if(!match||req.method!=='POST')return null;
 await rate(env,`member-recovery-issue:${user.id}`,30,3600);
 const input=await body(req);
 if(input.verified!==true)fail(400,'등록된 연락처로 본인 확인 후 발급해주세요.');
 if(!Number.isSafeInteger(input.version))fail(400,'회원정보를 새로고침해주세요.');
 const member=await stmt(env,'SELECT id,version FROM members WHERE id=?',match[1]).first();
 if(!member)fail(404,'회원을 찾을 수 없습니다.');
 if(member.version!==input.version)fail(409,'회원정보가 변경되었습니다. 새로고침해주세요.');
 const code=randomToken().slice(0,24),expiresAt=Date.now()+30*60*1000;
 const result=await stmt(env,'INSERT INTO member_recovery(member_id,token_hash,expires_at,member_version,issued_by,issued_at) SELECT id,?,?,?,?,? FROM members WHERE id=? AND version=? ON CONFLICT(member_id) DO UPDATE SET requested_at=NULL,token_hash=excluded.token_hash,expires_at=excluded.expires_at,member_version=excluded.member_version,issued_by=excluded.issued_by,issued_at=excluded.issued_at,used_at=NULL',await digest(code),expiresAt,member.version,user.id,now(),member.id,member.version).run();
 if(!result.meta.changes)fail(409,'회원정보가 변경되었습니다. 새로고침해주세요.');
 return json({code,expiresAt});
}
