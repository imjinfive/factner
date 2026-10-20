import {credentials,digest,passwordHash,randomToken,safeEqual,verifyPassword} from './security.js';
import {json,fail,now,stmt,body,text,rate} from './http.js';
const tokenFrom = req => req.headers.get('cookie')?.match(/(?:^|;\s*)factner_session=([a-f0-9]{64})(?:;|$)/)?.[1];
const cookie = (req, token, seconds) => `factner_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
const publicUser = user => ({id:user.id,username:user.username,display_name:user.display_name,role:user.role});
function state(user) {
  const mustChangePassword = Boolean(user.must_change_password);
  return {user:publicUser(user),security:{mustChangePassword,ready:!mustChangePassword}};
}
async function session(req, env) {
  const token = tokenFrom(req);
  if (!token) fail(401,'로그인이 필요합니다.');
  const hash = await digest(token);
  const user = await stmt(env,`SELECT a.* FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1 AND s.auth_version=a.auth_version`,hash,Date.now()).first();
  if (!user) fail(401,'로그인이 만료되었습니다. 다시 로그인해주세요.');
  return {...user,sessionHash:hash};
}
export async function identity(req, env) {
  const user = await session(req,env);
  if (!state(user).security.ready) fail(403,'초기 비밀번호를 변경해주세요.');
  return publicUser(user);
}
export function owner(user) { if (user.role !== 'owner') fail(403,'대표 관리자만 사용할 수 있습니다.'); }
function checkedCredentials(input) { try { return credentials(input); } catch(error) { fail(400,error.message); } }
async function throttle(req, env, userId, area='password') {
  await rate(env,`${area}:ip:${await digest(req.headers.get('CF-Connecting-IP')||'local')}`,30,900);
  if (userId) await rate(env,`${area}:user:${userId}`,10,900);
}
async function issue(req, env, user) {
  const token = randomToken(), seconds = user.must_change_password ? 600 : 8*3600;
  await env.DB.batch([
    stmt(env,'DELETE FROM sessions WHERE expires_at<?',Date.now()),
    ...(user.sessionHash ? [stmt(env,'DELETE FROM sessions WHERE token_hash=?',user.sessionHash)] : []),
    stmt(env,'INSERT INTO sessions(token_hash,admin_id,expires_at,auth_version) VALUES(?,?,?,?)',await digest(token),user.id,Date.now()+seconds*1000,user.auth_version),
  ]);
  return json(state(user),200,{'Set-Cookie':cookie(req,token,seconds)});
}
async function currentPassword(input, user) {
  if (typeof input.currentPassword !== 'string' || input.currentPassword.length>128 || !(await verifyPassword(input.currentPassword,user.password_hash))) fail(400,'현재 비밀번호가 올바르지 않습니다.');
}
// Returns null for the caller's other admin routes. Origin/JSON/body limits are shared with worker.js.
export async function authApi(req, env, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/auth/') && !path.startsWith('/api/admin/users')) return null;
  if (path === '/api/auth/state' && req.method === 'GET') {
    const row = await stmt(env,'SELECT count(*) AS count FROM admins').first();
    return json({setupRequired:row.count===0});
  }
  if (['/api/auth/login','/api/auth/setup'].includes(path) && req.method === 'POST') {
    await rate(env,`login:ip:${await digest(req.headers.get('CF-Connecting-IP')||'local')}`,30,900);
    const input = await body(req), cred = checkedCredentials(input);
    await rate(env,`login:user:${await digest(cred.username)}`,10,900);
    let user;
    if (path.endsWith('/setup')) {
      if (!env.BOOTSTRAP_TOKEN || !safeEqual(input.setupToken,env.BOOTSTRAP_TOKEN)) fail(403,'초기 설정 키가 일치하지 않습니다.');
      if ((await stmt(env,'SELECT count(*) AS count FROM admins').first()).count) fail(409,'초기 계정이 이미 생성되었습니다.');
      await stmt(env,'INSERT INTO admins(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)','initial-owner',cred.username,text(input.displayName,60,true),await passwordHash(cred.password),'owner',now()).run();
      user = await stmt(env,'SELECT * FROM admins WHERE id=?','initial-owner').first();
    } else {
      user = await stmt(env,'SELECT * FROM admins WHERE username=? AND active=1',cred.username).first();
      const hash = user?.password_hash || `${'0'.repeat(64)}:${'0'.repeat(64)}`;
      if (!(await verifyPassword(cred.password,hash)) || !user) fail(401,'아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    return issue(req,env,user);
  }
  const user = await session(req,env);
  if (path === '/api/auth/me' && req.method === 'GET') return json(state(user));
  if (path === '/api/auth/logout' && req.method === 'POST') {
    await stmt(env,'DELETE FROM sessions WHERE token_hash=?',user.sessionHash).run();
    return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});
  }
  if (path === '/api/auth/password' && req.method === 'POST') {
    await throttle(req,env,user.id,'password');
    const input = await body(req);
    checkedCredentials({username:user.username,password:input.newPassword});
    await currentPassword(input,user);
    if (safeEqual(input.currentPassword,input.newPassword)) fail(400,'기존과 다른 비밀번호를 입력해주세요.');
    await env.DB.batch([
      stmt(env,'UPDATE admins SET password_hash=?,must_change_password=0,auth_version=auth_version+1 WHERE id=? AND auth_version=?',await passwordHash(input.newPassword),user.id,user.auth_version),
      stmt(env,'DELETE FROM sessions WHERE admin_id=?',user.id),
    ]);
    return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});
  }
  if (user.must_change_password) fail(403,'먼저 초기 비밀번호를 변경해주세요.');
  if (path === '/api/admin/users') {
    owner(user);
    if (req.method === 'GET') return json({users:(await stmt(env,"SELECT id,username,display_name,role,active,created_at,must_change_password FROM admins ORDER BY created_at").all()).results});
    if (req.method === 'POST') {
      const input = await body(req), cred = checkedCredentials(input);
      if (await stmt(env,'SELECT id FROM admins WHERE username=?',cred.username).first()) fail(409,'이미 사용 중인 아이디입니다.');
      await stmt(env,"INSERT INTO admins(id,username,display_name,password_hash,role,created_at,must_change_password) VALUES(?,?,?,?,'staff',?,1)",crypto.randomUUID(),cred.username,text(input.displayName,60,true),await passwordHash(cred.password),now()).run();
      return json({ok:true},201);
    }
  }
  const match = path.match(/^\/api\/admin\/users\/([a-z0-9-]+)$/);
  if (match && req.method === 'PATCH') {
    owner(user);
    const input = await body(req);
    if (typeof input.active !== 'boolean') fail(400,'계정 상태를 확인해주세요.');
    const target = await stmt(env,'SELECT role FROM admins WHERE id=?',match[1]).first();
    if (!target) fail(404,'계정을 찾을 수 없습니다.');
    if (target.role === 'owner') fail(400,'대표 관리자 계정은 비활성화할 수 없습니다.');
    await env.DB.batch([
      stmt(env,'UPDATE admins SET active=?,auth_version=auth_version+1 WHERE id=?',Number(input.active),match[1]),
      stmt(env,'DELETE FROM sessions WHERE admin_id=?',match[1]),
    ]);
    return json({ok:true});
  }
  fail(404,'없는 API입니다.');
}
