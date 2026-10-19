import {fail,rate} from './http.js';
import {digest} from './security.js';

export async function verifyQuoteSubmission(req,env,input,config) {
 if(input.website)fail(400,'요청을 확인해주세요.');
 await rate(env,`quote-email:${await digest(input.email.trim().toLowerCase())}`,10,86400);
 if(!env.TURNSTILE_SITE_KEY||!env.TURNSTILE_SECRET_KEY) {
  if(config.accepting)fail(503,'접수 준비 중입니다. 잠시 후 다시 시도해주세요.');
  return;
 }
 if(typeof input.turnstileToken!=='string'||!input.turnstileToken||input.turnstileToken.length>2048)fail(400,'보안 확인을 완료해주세요.');
 let result;
 try {
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:input.turnstileToken,remoteip:req.headers.get('CF-Connecting-IP')||undefined,idempotency_key:input.id}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error();
  result=await response.json();
  if(!result||typeof result.success!=='boolean')throw new Error();
 } catch {fail(503,'보안 확인에 연결하지 못했습니다. 다시 시도해주세요.');}
 if(result.success!==true||result.hostname!==new URL(req.url).hostname||result.action!=='quote')fail(400,'보안 확인이 만료되었거나 일치하지 않습니다. 다시 확인해주세요.');
}
