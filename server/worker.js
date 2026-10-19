import { validateRequest } from '../rebate-ui/src/model.js';
import { credentials, digest, passwordHash, randomToken, safeEqual, verifyPassword } from './security.js';
export const statuses = {received:'접수', reviewing:'검토 중', consulting:'상담 중', quoted:'견적 안내', completed:'완료', cancelled:'취소'};
const json = (data, status = 200, headers = {}) => Response.json(data, {status, headers:{'Cache-Control':'no-store', ...headers}});
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const now = () => new Date().toISOString();
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
async function body(req) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON 형식으로 보내주세요.');
  // Bound the stream before parsing; Content-Length can be absent or misleading.
  const reader = req.body?.getReader();
  if (!reader) fail(400, '내용이 비어 있습니다.');
  let size = 0, chunks = [];
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 20000) { await reader.cancel(); fail(413, '입력 내용이 너무 큽니다.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, '입력 내용을 확인해주세요.'); }
  if (!data || Array.isArray(data) || typeof data !== 'object') fail(400, '입력 내용을 확인해주세요.');
  return data;
}
function text(value, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, '필수 입력 또는 글자 수를 확인해주세요.');
  return value.trim();
}
async function service(env) {
  const row = await stmt(env, "SELECT value FROM settings WHERE key='service'").first();
  return JSON.parse(row.value);
}
async function rate(env, key, limit, seconds) {
  const t = Math.floor(Date.now() / 1000);
  const row = await stmt(env, `INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
    reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count`, key, t + seconds, t, t).first();
  if (row.count > limit) fail(429, '잠시 후 다시 시도해주세요.');
}
async function identity(req, env) {
  const token = req.headers.get('cookie')?.match(/(?:^|;\s*)factner_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) fail(401, '로그인이 필요합니다.');
  const user = await stmt(env, `SELECT a.id,a.username,a.display_name,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id
    WHERE s.token_hash=? AND s.expires_at>? AND a.active=1`, await digest(token), Date.now()).first();
  if (!user) fail(401, '로그인이 만료되었습니다. 다시 로그인해주세요.');
  return user;
}
function owner(user) { if (user.role !== 'owner') fail(403, '대표 관리자만 사용할 수 있습니다.'); }
function sessionCookie(req, token, seconds) {
  return `factner_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function quoteInput(input) {
  const data = {
    brand:text(input.brand,60,true), category:text(input.category,30,true), quantity:Number(input.quantity),
    size:text(input.size,100), deadline:text(input.deadline,10), description:text(input.description,1500,true),
    supplier:text(input.supplier,100), contactName:text(input.contactName,60,true),
    email:text(input.email,254,true).toLowerCase(), phone:text(input.phone,30), referenceUrl:text(input.referenceUrl,2000),
  };
  const errors = validateRequest(data);
  if (Object.keys(errors).length) fail(400, Object.values(errors)[0]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fail(400, '연락받을 이메일을 확인해주세요.');
  if (data.phone && !/^[+0-9 ()-]{7,30}$/.test(data.phone)) fail(400, '전화번호를 확인해주세요.');
  if (data.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(data.deadline) || !Number.isFinite(Date.parse(data.deadline)) || new Date(data.deadline).toISOString().slice(0,10) !== data.deadline || data.deadline < new Date().toISOString().slice(0,10))) fail(400, '희망 납기를 확인해주세요.');
  if (data.referenceUrl) {
    try { const u = new URL(data.referenceUrl); if (u.protocol !== 'https:' || u.username || u.password) throw new Error(); }
    catch { fail(400, '참고 자료는 https:// 주소로 입력해주세요.'); }
  }
  if (input.consent !== true) fail(400, '견적 상담을 위한 정보 수집에 동의해주세요.');
  if (!/^[a-f0-9]{64}$/.test(input.receiptToken || '')) fail(400, '접수 키가 올바르지 않습니다.');
  if (!/^[a-f0-9-]{36}$/.test(input.id || '')) fail(400, '접수 번호가 올바르지 않습니다.');
  return data;
}
async function mainApi(req, env, url) {
  if (url.pathname === '/api/config' && req.method === 'GET') {
    const config = await service(env);
    return json({...config, mode:config.accepting ? 'live' : 'test', consentVersion:'2026-10-19'});
  }
  if (url.pathname === '/api/quotes' && req.method === 'POST') {
    await rate(env, `quote:${await digest(req.headers.get('CF-Connecting-IP') || 'local')}`, 10, 3600);
    const input = await body(req), data = quoteInput(input);
    const config = await service(env);
    if (!config.accepting && input.testOnly !== true) fail(503, '현재 테스트 접수만 가능합니다.');
    const hash = await digest(input.receiptToken);
    const existing = await stmt(env, 'SELECT id,receipt_hash FROM quotes WHERE id=?', input.id).first();
    if (existing) {
      if (!safeEqual(hash, existing.receipt_hash)) fail(409, '접수 번호를 다시 생성해주세요.');
      return json({id:existing.id, created:true}, 200);
    }
    const date = now();
    await env.DB.batch([
      stmt(env, `INSERT INTO quotes(id,receipt_hash,brand,category,quantity,size,deadline,description,supplier,contact_name,email,phone,reference_url,consent_version,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, input.id,hash,data.brand,data.category,data.quantity,data.size,data.deadline,data.description,data.supplier,data.contactName,data.email,data.phone,data.referenceUrl,'2026-10-19',date,date),
      stmt(env, 'INSERT INTO quote_events VALUES(?,?,?,?,?)',crypto.randomUUID(),input.id,'고객', config.accepting ? '견적 접수' : '테스트 견적 접수',date),
    ]);
    return json({id:input.id, created:true}, 201);
  }
  const match = url.pathname.match(/^\/api\/quotes\/([a-f0-9-]{36})$/);
  if (match && req.method === 'GET') {
    const token = req.headers.get('Authorization')?.replace(/^Bearer /,'');
    if (!/^[a-f0-9]{64}$/.test(token || '')) fail(401, '접수 키가 필요합니다.');
    const row = await stmt(env, 'SELECT id,status,brand,category,quantity,size,deadline,description,supplier,customer_message,created_at,updated_at,receipt_hash FROM quotes WHERE id=?',match[1]).first();
    if (!row || !safeEqual(row.receipt_hash, await digest(token))) fail(404, '요청을 찾을 수 없습니다.');
    delete row.receipt_hash;
    return json(row);
  }
  fail(404, '없는 API입니다.');
}
async function adminApi(req, env, url) {
  const path = url.pathname;
  if (path === '/api/auth/state' && req.method === 'GET') {
    const row = await stmt(env, 'SELECT count(*) AS count FROM admins').first();
    return json({setupRequired:row.count === 0});
  }
  if ((path === '/api/auth/login' || path === '/api/auth/setup') && req.method === 'POST') {
    await rate(env, `auth:${await digest(req.headers.get('CF-Connecting-IP') || 'local')}`, 15, 900);
    const input = await body(req);
    let cred;
    // Only the explicitly provisioned admin account accepts its shorter existing password.
    const provisionedAdminLogin = path === '/api/auth/login' && typeof input.username === 'string' && input.username.trim().toLowerCase() === 'admin';
    try { cred = credentials(input, provisionedAdminLogin ? 5 : 12); } catch (err) { fail(400,err.message); }
    let user;
    if (path.endsWith('setup')) {
      if (!env.BOOTSTRAP_TOKEN || !safeEqual(input.setupToken,env.BOOTSTRAP_TOKEN)) fail(403, '초기 설정 키가 일치하지 않습니다.');
      // Fixed owner ID and UNIQUE constraint close concurrent first-account registration.
      const row = await stmt(env, 'SELECT count(*) AS count FROM admins').first();
      if (row.count) fail(409, '초기 계정이 이미 생성되었습니다.');
      user = {id:'initial-owner',username:cred.username,display_name:text(input.displayName,60,true),role:'owner'};
      await stmt(env, 'INSERT INTO admins(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',user.id,user.username,user.display_name,await passwordHash(cred.password),user.role,now()).run();
    } else {
      user = await stmt(env, 'SELECT * FROM admins WHERE username=? AND active=1',cred.username).first();
      // Always perform PBKDF2, including when the username doesn't exist.
      const hash = user?.password_hash || `${'0'.repeat(64)}:${'0'.repeat(64)}`;
      if (!(await verifyPassword(cred.password,hash)) || !user) fail(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    const token = randomToken();
    await env.DB.batch([
      stmt(env, 'DELETE FROM sessions WHERE expires_at<?',Date.now()),
      stmt(env, 'INSERT INTO sessions VALUES(?,?,?)',await digest(token),user.id,Date.now()+8*3600*1000),
    ]);
    return json({user:{id:user.id,username:user.username,display_name:user.display_name,role:user.role}},200,{'Set-Cookie':sessionCookie(req,token,8*3600)});
  }
  const user = await identity(req,env);
  if (path === '/api/auth/me' && req.method === 'GET') return json({user});
  if (path === '/api/auth/logout' && req.method === 'POST') {
    const token = req.headers.get('cookie')?.match(/factner_session=([a-f0-9]{64})/)?.[1];
    if (token) await stmt(env, 'DELETE FROM sessions WHERE token_hash=?',await digest(token)).run();
    return json({ok:true},200,{'Set-Cookie':sessionCookie(req,'',0)});
  }
  if (path === '/api/auth/password' && req.method === 'POST') {
    await rate(env,`password:${user.id}`,10,900);
    const input = await body(req);
    try { credentials({username:user.username,password:input.newPassword}); } catch(err) {fail(400,err.message);}
    const row = await stmt(env,'SELECT password_hash FROM admins WHERE id=?',user.id).first();
    if (typeof input.currentPassword !== 'string' || input.currentPassword.length>128 || !(await verifyPassword(input.currentPassword,row.password_hash))) fail(400,'현재 비밀번호가 올바르지 않습니다.');
    await env.DB.batch([
      stmt(env,'UPDATE admins SET password_hash=? WHERE id=?',await passwordHash(input.newPassword),user.id),
      stmt(env,'DELETE FROM sessions WHERE admin_id=?',user.id),
    ]);
    return json({ok:true},200,{'Set-Cookie':sessionCookie(req,'',0)});
  }
  if (path === '/api/admin/users') {
    owner(user);
    if (req.method === 'GET') return json({users:(await stmt(env,'SELECT id,username,display_name,role,active,created_at FROM admins ORDER BY created_at').all()).results});
    if (req.method === 'POST') {
      const input = await body(req); let cred;
      try { cred = credentials(input); } catch(err) {fail(400,err.message);}
      if (await stmt(env,'SELECT id FROM admins WHERE username=?',cred.username).first()) fail(409,'이미 사용 중인 아이디입니다.');
      await stmt(env, "INSERT INTO admins(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,'staff',?)",crypto.randomUUID(),cred.username,text(input.displayName,60,true),await passwordHash(cred.password),now()).run();
      return json({ok:true},201);
    }
  }
  const userMatch = path.match(/^\/api\/admin\/users\/([a-z0-9-]+)$/);
  if (userMatch && req.method === 'PATCH') {
    owner(user);
    const input = await body(req);
    if (typeof input.active !== 'boolean') fail(400,'계정 상태를 확인해주세요.');
    const target = await stmt(env,'SELECT role FROM admins WHERE id=?',userMatch[1]).first();
    if (!target) fail(404,'계정을 찾을 수 없습니다.');
    if (target.role === 'owner') fail(400,'대표 관리자 계정은 비활성화할 수 없습니다.');
    await env.DB.batch([
      stmt(env,'UPDATE admins SET active=? WHERE id=?',Number(input.active),userMatch[1]),
      stmt(env,'DELETE FROM sessions WHERE admin_id=?',userMatch[1]),
    ]);
    return json({ok:true});
  }
  if (path === '/api/admin/settings') {
    owner(user);
    if (req.method === 'GET') return json(await service(env));
    if (req.method === 'PUT') {
      const input = await body(req);
      const config = {operator:text(input.operator,100),contactEmail:text(input.contactEmail,254),accepting:input.accepting === true};
      if (config.accepting && (!config.operator || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail))) fail(400,'정식 접수 전 운영자명과 문의 이메일을 설정해주세요.');
      await stmt(env,"UPDATE settings SET value=? WHERE key='service'",JSON.stringify(config)).run();
      return json(config);
    }
  }
  if (path === '/api/admin/quotes' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').slice(0,100);
    const status = url.searchParams.get('status') || '';
    const page = Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page'),10)||1));
    const args = [status,status,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`];
    const where = "WHERE (?='' OR status=?) AND (brand LIKE ? OR email LIKE ? OR contact_name LIKE ? OR id LIKE ?)";
    const rows = await stmt(env,`SELECT id,brand,category,quantity,status,contact_name,email,assignee,created_at,updated_at FROM quotes ${where} ORDER BY created_at DESC LIMIT 30 OFFSET ?`,...args,(page-1)*30).all();
    const total = await stmt(env,`SELECT count(*) AS total FROM quotes ${where}`,...args).first();
    const counts = await stmt(env,'SELECT status,count(*) AS count FROM quotes GROUP BY status').all();
    return json({quotes:rows.results,total:total.total,page,counts:counts.results});
  }
  const match = path.match(/^\/api\/admin\/quotes\/([a-f0-9-]{36})$/);
  if (match) {
    if (req.method === 'GET') {
      const row = await stmt(env,'SELECT * FROM quotes WHERE id=?',match[1]).first();
      if (!row) fail(404,'요청을 찾을 수 없습니다.');
      delete row.receipt_hash;
      const events = await stmt(env,'SELECT actor,action,created_at FROM quote_events WHERE quote_id=? ORDER BY created_at DESC',match[1]).all();
      return json({quote:row,events:events.results});
    }
    if (req.method === 'PATCH') {
      const input = await body(req);
      if (!Object.hasOwn(statuses,input.status)) fail(400,'진행 상태를 확인해주세요.');
      if (!Number.isSafeInteger(input.version)) fail(400,'요청 버전을 확인해주세요.');
      const note = text(input.internalNote,5000), message = text(input.customerMessage,2000), assignee = text(input.assignee,60);
      const date = now();
      const result = await env.DB.batch([
        stmt(env,`UPDATE quotes SET status=?,internal_note=?,customer_message=?,assignee=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,input.status,note,message,assignee,date,match[1],input.version),
        stmt(env,`INSERT INTO quote_events(id,quote_id,actor,action,created_at) SELECT ?,?,?,?,? WHERE changes()=1`,crypto.randomUUID(),match[1],user.display_name,`${statuses[input.status]} · 담당: ${assignee||'미지정'} · 상담 기록 저장`,date),
      ]);
      if (!result[0].meta.changes) fail(409,'다른 관리자가 수정했습니다. 새로고침 후 다시 저장해주세요.');
      return json({ok:true});
    }
  }
  fail(404,'없는 API입니다.');
}
export default {
  async scheduled(_event, env) {
    // Consent promises one-year retention. Cascade removes the associated history.
    const cutoff = new Date(Date.now() - 365 * 86400000).toISOString();
    await env.DB.batch([
      stmt(env, 'DELETE FROM quotes WHERE created_at < ?', cutoff),
      stmt(env, 'DELETE FROM sessions WHERE expires_at < ?', Date.now()),
      stmt(env, 'DELETE FROM rate_limits WHERE reset_at < ?', Math.floor(Date.now()/1000)),
    ]);
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const localAdmin = env.DEV_ORIGIN === 'http://127.0.0.1:5178' && url.pathname.startsWith('/_local-admin/api/');
    if (localAdmin) url.pathname = url.pathname.replace('/_local-admin','');
    let response;
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!['GET','POST','PATCH','PUT'].includes(req.method)) fail(405,'지원하지 않는 요청입니다.');
        const localDev = env.DEV_ORIGIN === 'http://127.0.0.1:5178' && [env.DEV_ORIGIN,'http://127.0.0.1:5179'].includes(req.headers.get('Origin'));
        if (req.method !== 'GET' && req.headers.get('Origin') !== url.origin && !localDev) fail(403,'허용되지 않은 요청 출처입니다.');
        response = env.APP_KIND === 'admin' || localAdmin ? await adminApi(req,env,url) : await mainApi(req,env,url);
        if (ctx) ctx.waitUntil(stmt(env,'DELETE FROM rate_limits WHERE reset_at<?',Math.floor(Date.now()/1000)-86400).run().catch(()=>{}));
      } else {
        response = await env.ASSETS.fetch(req);
      }
    } catch(err) {
      if (!(err instanceof HttpError)) console.error('Factner request failed:',err.name);
      response = json({error:err instanceof HttpError ? err.message : '처리하지 못했습니다. 잠시 후 다시 시도해주세요.'},err.status || 500);
    }
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    headers.set('X-Frame-Options','DENY');
    headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if (url.protocol === 'https:') headers.set('Strict-Transport-Security','max-age=31536000');
    if (env.APP_KIND === 'admin') {
      headers.set('X-Robots-Tag','noindex, nofollow');
      headers.set('Cache-Control','no-store');
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    }
    return new Response(response.body,{status:response.status,headers});
  },
};
