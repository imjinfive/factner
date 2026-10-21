import { validateRequest } from '../rebate-ui/src/model.js';
import {digest,safeEqual} from './security.js';
import {json,HttpError,fail,now,stmt,body,text,rate} from './http.js';
import {authApi,identity,owner} from './auth.js';
import {supplierPublicApi,supplierAdminApi} from './suppliers.js';
import {quoteNotificationStatement,operationsApi,drainNotifications,recordFailure,cleanOperations} from './operations.js';
import {service,policy,policyApi,readiness} from './policy.js';
import {verifyQuoteSubmission} from './spam.js';
import {memberApi,memberAdminApi} from './members.js';
import {orderApi} from './orders.js';
export const statuses = {received:'접수', reviewing:'검토 중', consulting:'상담 중', quoted:'견적 안내', completed:'완료', cancelled:'취소'};
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
  const memberResult=await memberApi(req,env,url)||await orderApi(req,env,url);
  if(memberResult)return memberResult;
  const publicResult=await supplierPublicApi(req,env,url)||(url.pathname==='/api/policy'?await policyApi(req,env,url):null);
  if(publicResult)return publicResult;
  if (url.pathname === '/api/config' && req.method === 'GET') {
    const config = await service(env);
    const doc=await policy(env);
    return json({...config, mode:config.accepting ? 'live' : 'test', consentVersion:doc.version,turnstileSiteKey:env.TURNSTILE_SECRET_KEY?env.TURNSTILE_SITE_KEY||'':''});
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
    const doc=await policy(env);
    if(input.consentVersion!==doc.version||input.termsConsent!==true)fail(409,'운영 안내가 변경되었습니다. 창을 다시 열고 동의 내용을 확인해주세요.');
    if(config.accepting&&!doc.published)fail(503,'정식 접수 준비 중입니다.');
    await verifyQuoteSubmission(req,env,input,config);
    const date = now();
    await env.DB.batch([
      stmt(env, `INSERT INTO quotes(id,receipt_hash,brand,category,quantity,size,deadline,description,supplier,contact_name,email,phone,reference_url,consent_version,created_at,updated_at,terms_version,intake_mode)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, input.id,hash,data.brand,data.category,data.quantity,data.size,data.deadline,data.description,data.supplier,data.contactName,data.email,data.phone,data.referenceUrl,doc.version,date,date,doc.version,config.accepting?'live':'test'),
      stmt(env, 'INSERT INTO quote_events VALUES(?,?,?,?,?)',crypto.randomUUID(),input.id,'고객', config.accepting ? '견적 접수' : '테스트 견적 접수',date),
      quoteNotificationStatement(env,input.id,date),
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
  const authResult=await authApi(req,env,url);
  if(authResult)return authResult;
  const user=await identity(req,env);
  const moduleResult=await memberAdminApi(req,env,url,user)||await orderApi(req,env,url,user)||await supplierAdminApi(req,env,url,user)||await operationsApi(req,env,url,user)||await policyApi(req,env,url,user);
  if(moduleResult)return moduleResult;
  if (path === '/api/admin/settings') {
    owner(user);
    if (req.method === 'GET') {const config=await service(env);return json({...config,readiness:await readiness(env,config)});}
    if (req.method === 'PUT') {
      const input = await body(req);
      const config = {operator:text(input.operator,100),contactEmail:text(input.contactEmail,254),accepting:input.accepting === true};
      if(config.accepting){const missing=(await readiness(env,config)).filter(item=>!item.ready);if(missing.length)fail(400,`정식 접수 전 확인: ${missing.map(item=>item.label).join(', ')}`);}
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
  async scheduled(event, env) {
    try {
      await drainNotifications(env);
      if(!event.cron||event.cron==='0 18 * * *') {
        const cutoff=new Date(Date.now()-365*86400000).toISOString();
        await env.DB.batch([
          stmt(env,'DELETE FROM quotes WHERE created_at < ?',cutoff),
          stmt(env,'DELETE FROM sessions WHERE expires_at < ?',Date.now()),
          stmt(env,'DELETE FROM member_sessions WHERE expires_at < ?',Date.now()),
          stmt(env,'DELETE FROM rate_limits WHERE reset_at < ?',Math.floor(Date.now()/1000)),
        ]);
        await cleanOperations(env);
      }
    }catch(error){await recordFailure(env,'SCHEDULED_FAILED','cron').catch(()=>{});throw error;}
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
      if (!(err instanceof HttpError)) {
        console.error('Factner request failed:',err.name);
        const incident=recordFailure(env,'REQUEST_FAILED',env.APP_KIND==='admin'?'admin-api':'main-api').catch(()=>{});
        if(ctx)ctx.waitUntil(incident);else await incident;
      }
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
