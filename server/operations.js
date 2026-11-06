const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FAILURE_CODES = new Set(['REQUEST_FAILED','SCHEDULED_FAILED','EMAIL_DELIVERY_FAILED','UPTIME_MAIN_FAILED','UPTIME_ADMIN_FAILED']);
const FAILURE_CONTEXTS = new Set(['main-api','admin-api','cron','email','main-site','admin-site']);
const EMAIL_ERRORS = new Set(['E_SENDER_NOT_VERIFIED','E_RECIPIENT_NOT_ALLOWED','E_RECIPIENT_SUPPRESSED','E_SENDER_DOMAIN_NOT_AVAILABLE','E_DELIVERY_FAILED','E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED','E_INTERNAL_SERVER_ERROR']);
const iso = () => new Date().toISOString();
const error = (status,message) => { throw Object.assign(new Error(message),{status}); };

// Include this statement in the quote transaction: an accepted quote always has its notification.
export function quoteNotificationStatement(env,quoteId,date) {
  return stmt(env,"INSERT INTO notification_outbox(id,event_key,kind,quote_id,created_at) VALUES(?,?,'quote',?,?)",crypto.randomUUID(),`quote:${quoteId}`,quoteId,date);
}

async function config(env) {
  const row = await stmt(env,"SELECT value FROM settings WHERE key='operations'").first();
  return row ? JSON.parse(row.value) : {recipient:'',enabled:false};
}
export function notificationReadiness(env,settings) {
  const recipient = settings.recipient || '';
  let reason = '';
  if (!recipient) reason='알림 수신 이메일이 미정입니다.';
  else if (recipient !== env.NOTIFY_TO) reason='수신 주소의 Cloudflare 인증과 발송 연결이 필요합니다.';
  else if (!env.EMAIL?.send) reason='이메일 발송 연결이 필요합니다.';
  else if (!EMAIL.test(env.NOTIFY_FROM || '') || !env.NOTIFY_FROM.endsWith('@factner.com')) reason='팩트너 발신 주소를 연결해주세요.';
  const configured = !reason;
  if (configured && !settings.enabled) reason='자동 알림이 꺼져 있습니다.';
  return {configured,ready:configured && settings.enabled === true,reason};
}

// Only constant codes and contexts are retained; never log errors, URLs, headers or request bodies.
export async function recordFailure(env,code,context) {
  code=FAILURE_CODES.has(code)?code:'REQUEST_FAILED';
  context=FAILURE_CONTEXTS.has(context)?context:'main-api';
  const date=iso(), id=`${code}:${context}:${date.slice(0,13)}`;
  try {
    const statements=[stmt(env,`INSERT INTO operational_incidents(id,code,context,first_at,last_at) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET occurrences=occurrences+1,last_at=excluded.last_at`,id,code,context,date,date)];
    // Email delivery failures remain on the dashboard, avoiding self-generating error emails.
    if(code!=='EMAIL_DELIVERY_FAILED') statements.push(stmt(env,"INSERT OR IGNORE INTO notification_outbox(id,event_key,kind,incident_id,created_at) VALUES(?,?,'incident',?,?)",crypto.randomUUID(),`incident:${id}`,id,date));
    statements.push(stmt(env,'DELETE FROM operational_incidents WHERE id IN (SELECT id FROM operational_incidents ORDER BY last_at DESC LIMIT -1 OFFSET 1000)'));
    await env.DB.batch(statements);
    return true;
  } catch {
    console.error('Factner operational recording unavailable',code,context);
    return false;
  }
}

function message(row) {
  if(row.kind==='quote') return {subject:'[팩트너] 새 견적이 접수되었습니다',text:`새 견적 접수 번호: ${row.quote_id}\n관리자 사이트에서 확인해주세요.\nhttps://admin.factner.com/`};
  if(row.kind==='incident') return {subject:'[팩트너] 운영 오류 확인이 필요합니다',text:'서비스 처리 중 오류가 기록되었습니다. 관리자 사이트의 알림·운영 상태에서 확인해주세요.\nhttps://admin.factner.com/'};
  return {subject:'[팩트너] 관리자 알림 연결 확인',text:'팩트너 운영 알림 테스트입니다. 새 견적과 운영 오류 알림을 이 주소로 받게 됩니다.\nhttps://admin.factner.com/'};
}

export async function drainNotifications(env) {
  const settings=await config(env), readiness=notificationReadiness(env,settings);
  await stmt(env,"INSERT INTO settings(key,value) VALUES('operations_last_run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",iso()).run();
  if(!readiness.ready) return {sent:0,failed:0,blocked:true,reason:readiness.reason};
  await stmt(env,"UPDATE notification_outbox SET status='failed',claim_token=NULL,lease_until=0,last_error='PROCESSING_INTERRUPTED' WHERE status='processing' AND lease_until<=? AND attempts>=8",Date.now()).run();
  let sent=0, failed=0;
  // ponytail: eight emails per run fits the D1 Free query budget; increase only with plan/volume changes.
  for(let i=0;i<8;i++) {
    const time=Date.now(),claim=crypto.randomUUID();
    const row=await stmt(env,`UPDATE notification_outbox SET status='processing',claim_token=?,lease_until=?,attempts=attempts+1
      WHERE id=(SELECT id FROM notification_outbox WHERE attempts<8 AND
      ((status='pending' AND next_attempt_at<=?) OR (status='processing' AND lease_until<=?))
      ORDER BY created_at,id LIMIT 1) RETURNING *`,claim,time+120000,time,time).first();
    if(!row) break;
    try {
      const result=await env.EMAIL.send({from:env.NOTIFY_FROM,to:settings.recipient,...message(row)});
      if(typeof result?.messageId!=='string' || !result.messageId || result.messageId.length>200) throw new Error('MISSING_PROVIDER_ACK');
      await stmt(env,"UPDATE notification_outbox SET status='sent',sent_at=?,message_id=?,last_error='',claim_token=NULL,lease_until=0 WHERE id=? AND claim_token=?",iso(),result.messageId,row.id,claim).run();
      sent++;
    } catch(cause) {
      const code=EMAIL_ERRORS.has(cause?.code)?cause.code:'DELIVERY_UNCONFIRMED';
      const next=time+Math.min(21600000,300000*2**(row.attempts-1));
      await stmt(env,"UPDATE notification_outbox SET status=?,next_attempt_at=?,last_error=?,claim_token=NULL,lease_until=0 WHERE id=? AND claim_token=?",row.attempts>=8?'failed':'pending',next,code,row.id,claim).run();
      await recordFailure(env,'EMAIL_DELIVERY_FAILED','email');
      failed++;
    }
  }
  return {sent,failed,blocked:false};
}

export async function cleanOperations(env) {
  const cutoff=new Date(Date.now()-90*86400000).toISOString();
  await env.DB.batch([
    stmt(env,'DELETE FROM operational_incidents WHERE last_at<?',cutoff),
    stmt(env,"DELETE FROM notification_outbox WHERE kind='test' AND created_at<?",cutoff),
    stmt(env,"DELETE FROM notification_outbox WHERE status='sent' AND sent_at<?",cutoff),
  ]);
}

async function body(req) {
  if(!req.headers.get('content-type')?.startsWith('application/json')) error(415,'JSON 형식으로 보내주세요.');
  const reader=req.body?.getReader();if(!reader) error(400,'입력 내용을 확인해주세요.');
  let size=0, chunks=[];
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();error(413,'입력 내용이 너무 큽니다.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{error(400,'입력 내용을 확인해주세요.');}
  if(!data || typeof data!=='object' || Array.isArray(data)) error(400,'입력 내용을 확인해주세요.');
  return data;
}
async function manualRate(env,user) {
  const time=Math.floor(Date.now()/1000);
  const row=await stmt(env,`INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count`,`notifications:${user.id}`,time+3600,time,time).first();
  if(row.count>20) error(429,'수동 발송은 시간당 20회까지 가능합니다. 잠시 후 다시 시도해주세요.');
}

export async function operationsApi(req,env,url,user) {
  const path=url.pathname;
  if(!path.startsWith('/api/admin/operations')) return null;
  if(user?.role!=='owner') return json({error:'대표 관리자만 사용할 수 있습니다.'},403);
  try {
    if(path==='/api/admin/operations' && req.method==='GET') {
      const settings=await config(env);
      const [counts,notifications,incidents,lastSent,lastRun]=await Promise.all([
        stmt(env,'SELECT status,count(*) AS count FROM notification_outbox GROUP BY status').all(),
        stmt(env,`SELECT id,kind,quote_id,status,attempts,next_attempt_at,last_error,created_at,sent_at FROM notification_outbox
          ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'processing' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,created_at DESC LIMIT 30`).all(),
        stmt(env,'SELECT code,context,occurrences,first_at,last_at FROM operational_incidents ORDER BY last_at DESC LIMIT 20').all(),
        stmt(env,"SELECT MAX(sent_at) AS at FROM notification_outbox WHERE status='sent'").first(),
        stmt(env,"SELECT value FROM settings WHERE key='operations_last_run'").first(),
      ]);
      return json({settings,readiness:notificationReadiness(env,settings),counts:counts.results,notifications:notifications.results,incidents:incidents.results,lastSentAt:lastSent?.at||null,lastRunAt:lastRun?.value||null});
    }
    if(path==='/api/admin/operations' && req.method==='PUT') {
      const data=await body(req);
      if(typeof data.recipient!=='string' || data.recipient.length>254 || typeof data.enabled!=='boolean') error(400,'수신 이메일과 알림 설정을 확인해주세요.');
      const recipient=data.recipient.trim().toLowerCase();
      if(recipient && !EMAIL.test(recipient)) error(400,'수신 이메일을 확인해주세요.');
      const settings={recipient,enabled:data.enabled};
      if(settings.enabled && !notificationReadiness(env,settings).configured) error(400,notificationReadiness(env,settings).reason);
      await stmt(env,"INSERT INTO settings(key,value) VALUES('operations',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(settings)).run();
      return json({ok:true});
    }
    const retry=path.match(/^\/api\/admin\/operations\/notifications\/([a-f0-9-]{36})\/retry$/);
    if(req.method==='POST' && (path==='/api/admin/operations/test' || retry)) {
      await body(req);
      const readiness=notificationReadiness(env,await config(env));
      if(!readiness.ready) error(409,readiness.reason);
      await manualRate(env,user);
      let id;
      if(retry){
        id=retry[1];
        const result=await stmt(env,"UPDATE notification_outbox SET status='pending',attempts=0,next_attempt_at=0,last_error='',claim_token=NULL,lease_until=0 WHERE id=? AND (status IN ('pending','failed') OR (status='processing' AND lease_until<=?))",id,Date.now()).run();
        if(!result.meta.changes) error(409,'발송 중이거나 이미 발송 접수된 알림입니다.');
      }else{
        id=crypto.randomUUID();
        await stmt(env,"INSERT INTO notification_outbox(id,event_key,kind,created_at) VALUES(?,?,'test',?)",id,`test:${id}`,iso()).run();
      }
      // Cron handles delivery; the response confirms queueing, never successful inbox delivery.
      return json({ok:true,id,queued:true},202);
    }
    return json({error:'없는 API입니다.'},404);
  }catch(cause){
    if(cause.status) return json({error:cause.message},cause.status);
    throw cause;
  }
}
