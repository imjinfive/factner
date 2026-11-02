import { body, fail, json, rate, stmt, text } from './http.js';
import { digest, memberPassword, passwordHash, randomToken, verifyPassword } from './security.js';
import { marketApi } from './bid-market.js';
import { designerNotice, isPackagingPartner, isDesignerTestAccount } from '../shared/partner-roles.js';

const kinds = new Set(['brand', 'design', 'packaging', 'both']);
const lifetime = 8 * 3600 * 1000;
const localHost = url => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
export function isLocalPreview(env, url) {
  return env.BID_DEMO === '1' && localHost(url);
}
// A request header or a string Worker binding cannot grant this capability.
export const roomDatabase = Symbol('isolated bid room database');
function isIsolatedReview(env) {
  return Boolean(env[roomDatabase] && env[roomDatabase] === env.DB);
}
const asUser = ({id, email, name, kind}) => ({id, email, name, kind});
function canSignIn(account) {
  return account.kind !== 'design' || isDesignerTestAccount(account);
}
async function current(req, env, preview) {
  const token = req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  const hash = await digest(token);
  if (preview && env.previewAdminSessions?.get(hash) > Date.now()) {
    return {id:'preview-ops', kind:'admin', name:'팩트너 운영팀', email:'', hash};
  }
  const user = await stmt(env, 'SELECT a.id,a.email,a.name,a.kind FROM market_accounts a JOIN market_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?',hash,Date.now()).first();
  return user && canSignIn(user) ? {...user, hash} : null;
}
async function issue(env,user,admin=false) {
  if(!canSignIn(user))fail(403,designerNotice);
  const token=randomToken(), hash=await digest(token), until=Date.now()+lifetime;
  if(admin) env.previewAdminSessions.set(hash,until);
  else await env.DB.batch([
    stmt(env,'DELETE FROM market_sessions WHERE expires_at<=?',Date.now()),
    stmt(env,'INSERT INTO market_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)',hash,user.id,until)
  ]);
  return json({user:asUser(user), token});
}
export async function bidApi(req,env,url) {
  if(!url.pathname.startsWith('/api/bid/'))return null;
  const hosted=isIsolatedReview(env), preview=hosted || isLocalPreview(env,url);
  if(!preview)fail(503,'현재 파트너 찾기는 체험 공간에서만 이용할 수 있습니다.');
  const path=url.pathname.slice('/api/bid'.length);
  const user=await current(req,env,preview);
  if(path==='/session' && req.method==='GET'){
    const demoAccounts=preview ? (await stmt(env,"SELECT id,name,email,kind FROM market_accounts WHERE id LIKE 'seed-%' ORDER BY kind,length(email),email").all()).results : [];
    return json({user:user ? asUser(user) : null,demo:preview,hosted,accounts:demoAccounts});
  }
  if(path==='/logout' && req.method==='POST'){
    if(user?.kind==='admin')env.previewAdminSessions?.delete(user.hash);
    else if(user)await stmt(env,'DELETE FROM market_sessions WHERE token_hash=?',user.hash).run();
    return json({ok:true});
  }
  if(path==='/demo' && req.method==='POST'){
    if(!preview)fail(404,'없는 페이지입니다.');
    const input=await body(req);
    if(input.role==='admin' && env.previewAdminSessions)return issue(env,{id:'preview-ops',name:'팩트너 운영팀',email:'',kind:'admin'},true);
    const row=await stmt(env,"SELECT * FROM market_accounts WHERE email=? AND id LIKE 'seed-%'",String(input.email||'').toLowerCase()).first();
    if(!row)fail(404,'체험 계정을 찾을 수 없습니다.');
    return issue(env,row);
  }
  if((path==='/login'||path==='/register') && req.method==='POST'){
    const data=await body(req), email=text(data.email,254,true).toLowerCase(), pw=memberPassword(data.password);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'이메일 주소를 확인해 주세요.');
    await rate(env,'bid-auth:'+await digest(req.headers.get('CF-Connecting-IP')||'local'),preview?120:25,600);
    if(path==='/register'){
      const name=text(data.name,60,true), kind=data.kind;
      if(!kinds.has(kind))fail(400,'회원 유형을 선택해 주세요.');
      if(kind==='design')fail(403,designerNotice);
      if(kind==='both')fail(400,'패키징 제작업체 유형으로 가입해주세요.');
      const id=crypto.randomUUID();
      const result=await stmt(env,'INSERT INTO market_accounts(id,email,name,kind,password_hash) VALUES(?,?,?,?,?) ON CONFLICT(email) DO NOTHING',id,email,name,kind,await passwordHash(pw)).run();
      if(!result.meta.changes)fail(409,'이미 사용 중인 이메일입니다.');
      return issue(env,{id,email,name,kind});
    }
    const row=await stmt(env,'SELECT * FROM market_accounts WHERE email=?',email).first();
    if(!await verifyPassword(pw,row?.password_hash||'0'.repeat(64)+':'+'0'.repeat(64))||!row)fail(401,'이메일 또는 비밀번호를 확인해 주세요.');
    if(!canSignIn(row))fail(403,designerNotice);
    const loginRole=isPackagingPartner(row.kind)?'packaging':row.kind;
    if(data.role!==undefined && data.role!==loginRole)fail(403,'선택한 회원 유형과 계정이 일치하지 않습니다.');
    return issue(env,row);
  }
  return marketApi(req,env,url,user ? asUser(user):null);
}
