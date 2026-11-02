import {body,fail,json,stmt} from './http.js';
import {randomToken} from './security.js';
import {memberApi,memberIdentity,loginMember,registerMember,hasMarketConsent} from './members.js';
import {service,policy,approvedMarketMember} from './policy.js';
import {marketApi} from './bid-market.js';
import {isReviewEmail} from '../scripts/bid-seed.mjs';
import {designerNotice} from '../shared/partner-roles.js';

// The standalone loopback server can validate its local signup flow without a public CAPTCHA key.
export const localMemberPreview=Symbol('local member preview');
const validRoom = value=>/^[a-f0-9]{64}$/.test(value||'');

async function registration(env) {
  const [settings,doc]=await Promise.all([service(env),policy(env)]);
  const published=Boolean(doc.published && settings.operator && settings.contactEmail &&
    doc.operator===settings.operator && doc.contactEmail===settings.contactEmail);
  const captcha=Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
  return {
    available:Boolean(settings.accepting && published && (captcha || env[localMemberPreview])),
    consentVersion:published?doc.version:null,
    terms:published?doc.terms:'',privacy:published?doc.privacy:'',collection:published?doc.collection:'',transfer:published?doc.transfer:'',
    turnstileSiteKey:captcha?env.TURNSTILE_SITE_KEY:''
  };
}
async function currentMember(req,env) {
  try { return await memberIdentity(req,env); }
  catch(error){ if(error.status===401)return null; throw error; }
}
async function reviewRequest(req,env,key,input) {
  if (!validRoom(key)) fail(401,'다시 로그인해주세요.');
  const headers=new Headers();
  for(const name of ['Origin','Content-Type','Authorization','CF-Connecting-IP']) {
    if(req.headers.has(name))headers.set(name,req.headers.get(name));
  }
  const forwarded=new Request(req.url,{method:req.method,headers,
    body:req.method==='GET'?undefined:JSON.stringify(input??(req.body?await body(req):{}))});
  if(env.BID_ROOMS)return env.BID_ROOMS.get(env.BID_ROOMS.idFromName(key)).fetch(forwarded);
  fail(503,'지정 계정 서비스를 이용할 수 없습니다.');
}
export async function publicBidApi(req,env,url) {
  const path=url.pathname.slice('/api/bid'.length);
  if(env.BID_LIMIT && !(await env.BID_LIMIT.limit({key:req.headers.get('CF-Connecting-IP')||'local'})).success)fail(429,'잠시 후 다시 시도해주세요.');
  if(path==='/demo')fail(404,'없는 페이지입니다.');
  if(path==='/register' && req.method==='POST'){
    const info=await registration(env);
    if(!info.available)fail(503,'현재 회원가입 접수를 준비하고 있습니다.');
    const input=await body(req,11000000);
    if(input.kind==='design')fail(403,designerNotice);
    if(!['brand','packaging'].includes(input.kind))fail(400,'회원 유형을 확인해주세요.');
    if(input.consent!==true||input.termsConsent!==true||input.consentVersion!==info.consentVersion)fail(409,'현재 이용약관과 개인정보 수집 내용을 확인해주세요.');
    return registerMember(req,env,{...input,role:input.kind==='brand'?'brand':'supplier'},
      {version:info.consentVersion,live:true,requireCaptcha:!env[localMemberPreview]});
  }
  const room=req.headers.get('X-Factner-Review');
  if(path==='/login' && req.method==='POST'){
    const input=await body(req);
    if(!isReviewEmail(input.email))return loginMember(req,env,input,{bid:true});
    const key=validRoom(room)?room:randomToken();
    const reply=await reviewRequest(req,env,key,input);
    if(!reply.ok)return reply;
    // Switching explicitly to a fixture must not revive an unrelated real session on logout.
    const ended=await memberApi(req,env,new URL('/api/member/logout',url));
    return json({...await reply.json(),reviewRoom:key},reply.status,{'Set-Cookie':ended.headers.get('Set-Cookie')});
  }
  if(req.headers.has('Authorization')){
    if(!/^Bearer [a-f0-9]{64}$/.test(req.headers.get('Authorization')))fail(401,'다시 로그인해주세요.');
    return reviewRequest(req,env,room);
  }
  if(path==='/logout'&&req.method==='POST')return memberApi(req,env,new URL('/api/member/logout',url));
  const member=await currentMember(req,env);
  const user=member?{id:member.id,email:member.email,name:member.name,kind:member.role==='brand'?'brand':'packaging',legacyOnly:!await hasMarketConsent(env,member.id)}:null;
  if(path==='/session'&&req.method==='GET'){
    return json({user,mode:'live',demo:false,hosted:false,accounts:[],registration:await registration(env)});
  }
  if(user?.legacyOnly){
    if(path==='/state' && req.method==='GET')return json({posts:[],partners:[],offers:[],contracts:[],connections:[]});
    fail(403,'기존 회원 서비스에서 계정과 발주 내역을 이용해주세요.');
  }
  if(user && req.method==='POST' && !path.startsWith('/contracts/')){
    // The market FK references the member ID. Credentials and profile data stay in members.
    await stmt(env,`INSERT OR IGNORE INTO market_accounts(id,email,name,kind,password_hash)
      SELECT id,id||'@member.invalid','',?,'!' FROM members m WHERE id=? AND ${approvedMarketMember('m')} AND version=?`,user.kind,member.id,member.version).run();
  }
  return marketApi(req,env,url,user,{live:true});
}
