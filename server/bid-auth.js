import { body, fail, json, rate, stmt, text } from './http.js';
import { isReviewEmail } from '../scripts/bid-seed.mjs';
import { digest, memberPassword, randomToken, verifyPassword } from './security.js';
import { marketApi } from './bid-market.js';
import { designerNotice, isPackagingPartner, isDesignerTestAccount } from '../shared/partner-roles.js';

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
async function current(req, env) {
  const token = req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  const hash = await digest(token);
  const user = await stmt(env, 'SELECT a.id,a.email,a.name,a.kind FROM market_accounts a JOIN market_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?',hash,Date.now()).first();
  return user && user.id.startsWith('seed-') && isReviewEmail(user.email) && canSignIn(user) ? {...user, hash} : null;
}
async function issue(env,user) {
  if(!canSignIn(user))fail(403,designerNotice);
  const token=randomToken(), hash=await digest(token), until=Date.now()+lifetime;
  await env.DB.batch([
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
  const user=await current(req,env);
  if(path==='/register'||path==='/demo')fail(404,'없는 페이지입니다.');
  if(!user && path!=='/login')fail(401,'다시 로그인해주세요.');
  if(path==='/session' && req.method==='GET')return json({user:asUser(user),mode:'review',demo:true,hosted,accounts:[]});
  if(path==='/logout' && req.method==='POST'){
    await stmt(env,'DELETE FROM market_sessions WHERE token_hash=?',user.hash).run();
    return json({ok:true});
  }
  if(path==='/login' && req.method==='POST'){
    const data=await body(req), email=text(data.email,254,true).toLowerCase(), pw=memberPassword(data.password);
    await rate(env,'bid-auth:'+await digest(req.headers.get('CF-Connecting-IP')||'local'),25,600);
    if(!isReviewEmail(email))fail(401,'이메일 또는 비밀번호를 확인해 주세요.');
    const row=await stmt(env,'SELECT * FROM market_accounts WHERE email=?',email).first();
    if(!await verifyPassword(pw,row?.password_hash||'0'.repeat(64)+':'+'0'.repeat(64))||!row||!row.id.startsWith('seed-'))fail(401,'이메일 또는 비밀번호를 확인해 주세요.');
    if(!canSignIn(row))fail(403,designerNotice);
    const loginRole=isPackagingPartner(row.kind)?'packaging':row.kind;
    if(data.role!==undefined && data.role!==loginRole)fail(403,'선택한 회원 유형과 계정이 일치하지 않습니다.');
    return issue(env,row);
  }
  return marketApi(req,env,url,user ? asUser(user):null);
}
