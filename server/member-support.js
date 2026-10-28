import {body,fail,json,now,stmt,text,rate} from './http.js';
import {owner} from './auth.js';

const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const supportFields=['managerName','managerPhone','managerEmail','signupEta','packagingEta','matchingEta','responseEta'];
const emptySupport=()=>({...Object.fromEntries(supportFields.map(key=>[key,''])),version:0});
const companyDefaults={summary:'',categories:[],quantity:0,productionPeriod:'',industry:'',delivery:'',material:'',finish:'',note:''};
const requestSelect='SELECT r.*,m.name AS member_name,m.role AS member_role FROM member_requests r JOIN members m ON m.id=r.member_id';
const publicRequest=row=>({...row,details:JSON.parse(row.details)});
export async function memberSupport(env,memberId){
 const row=await stmt(env,'SELECT details,version FROM member_support WHERE member_id=?',memberId).first();
 return row?{...emptySupport(),...JSON.parse(row.details),version:row.version}:emptySupport();
}
function supportInput(input){
 const values=Object.fromEntries(supportFields.map(key=>[key,text(input[key],({managerName:60,managerPhone:30,managerEmail:254})[key]||200)]));
 if(values.managerPhone&&!/^[+0-9 ()-]{7,30}$/.test(values.managerPhone))fail(400,'담당자 전화번호를 확인해주세요.');
 if(values.managerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.managerEmail))fail(400,'담당자 이메일을 확인해주세요.');
 return values;
}
function requestDetails(kind,input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'요청 상세를 확인해주세요.');
 const fields=kind==='profile'?['name','contact','phone','email']:kind==='company'?[...Object.keys(companyDefaults),'version','listed']:kind==='matching'?['category','capacity']:[];
 if(Object.keys(input).some(key=>!fields.includes(key)))fail(400,'지원하지 않는 요청 항목입니다.');
 const result={};
 for(const [key,value] of Object.entries(input)){
  if(key==='categories'){
   if(!Array.isArray(value)||value.length>3||value.some(c=>!['box','packaging','supplies'].includes(c)))fail(400,'품목을 확인해주세요.');
   result[key]=[...new Set(value)];
  }else if(['quantity','version','capacity'].includes(key)){
   if(key==='capacity'&&(value===null||value===''||value==='over'))result[key]=value;
   else{const number=key==='capacity'&&typeof value==='string'?Number(value):value;if(!Number.isSafeInteger(number)||number<0||number>100000000)fail(400,'수량 또는 버전을 확인해주세요.');result[key]=number;}
  }else if(key==='listed'){
   if(typeof value!=='boolean')fail(400,'후보 표시 여부를 확인해주세요.');result[key]=value;
  }else result[key]=text(value,key==='summary'?1000:key==='email'?254:500);
 }
 if(kind==='matching'&&!['box','packaging','supplies'].includes(result.category))fail(400,'매칭할 품목을 선택해주세요.');
 if(result.phone&&!/^[+0-9 ()-]{7,30}$/.test(result.phone))fail(400,'연락처를 확인해주세요.');
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))fail(400,'이메일을 확인해주세요.');
 return result;
}
export async function memberWorkspaceApi(req,env,url,user){
 if(url.pathname==='/api/member/workspace'&&req.method==='GET'){
  const [support,row,requests]=await Promise.all([
   memberSupport(env,user.id),stmt(env,'SELECT profile,version,listed FROM member_companies WHERE member_id=?',user.id).first(),
   stmt(env,`${requestSelect} WHERE r.member_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 200`,user.id).all(),
  ]);
  const profile=row?JSON.parse(row.profile):{};
  const company={...Object.fromEntries(Object.entries(companyDefaults).map(([key,value])=>[key,profile[key]??value])),version:row?.version||0,listed:!!row?.listed};
  return json({support,company,requests:requests.results.map(publicRequest)});
 }
 if(url.pathname==='/api/member/requests'&&req.method==='POST'){
  await rate(env,`member-request:${user.id}`,20,3600);
  const input=await body(req),time=now();
  if(input.confirmed!==true||!['profile','company','matching','inquiry'].includes(input.kind))fail(400,'요청 종류와 내용을 다시 확인해주세요.');
  const message=text(input.message,3000,true),details=requestDetails(input.kind,input.details||{}),id=crypto.randomUUID();
  const result=await env.DB.batch([
   stmt(env,"INSERT INTO member_requests(id,member_id,kind,message,details,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='approved' AND version=?)",id,user.id,input.kind,message,JSON.stringify(details),time,time,user.id,user.version),
   stmt(env,"INSERT INTO member_request_events SELECT ?,?,?,'pending',?,? WHERE changes()=1",crypto.randomUUID(),id,user.name,message,time),
  ]);
  if(!result[0].meta.changes)fail(409,'회원 상태가 변경되었습니다. 다시 로그인해 확인해주세요.');
  return json({id,status:'pending'},201);
 }
 return null;
}
export async function memberSupportAdminApi(req,env,url,user){
 const path=url.pathname,memberPath=path.match(/^\/api\/admin\/members\/([a-f0-9-]{36})\/support$/),requestPath=path.match(/^\/api\/admin\/member-requests\/([a-f0-9-]{36})$/);
 if(!memberPath&&!requestPath&&path!=='/api/admin/member-requests')return null;
 owner(user);
 if(req.method!=='GET')await rate(env,`member-support-admin:${user.id}`,100,3600);
 if(memberPath){
  const member=await stmt(env,'SELECT id FROM members WHERE id=?',memberPath[1]).first();if(!member)fail(404,'회원을 찾을 수 없습니다.');
  const current=await memberSupport(env,member.id);
  if(req.method==='GET')return json({support:current});
  if(req.method==='PUT'){
   const input=await body(req),values=supportInput(input),time=now();
   if(input.confirmed!==true)fail(400,'담당자와 처리 안내를 다시 확인해주세요.');
   if(!Number.isSafeInteger(input.version)||input.version!==current.version)fail(409,'담당자 안내가 변경되었습니다. 최신 내용을 불러와 확인해주세요.');
   const result=await env.DB.batch([
    current.version?stmt(env,'UPDATE member_support SET details=?,version=version+1,updated_at=? WHERE member_id=? AND version=?',JSON.stringify(values),time,member.id,input.version):stmt(env,'INSERT OR IGNORE INTO member_support(member_id,details,created_at,updated_at) VALUES(?,?,?,?)',member.id,JSON.stringify(values),time,time),
    stmt(env,'INSERT INTO member_profile_events SELECT ?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),member.id,user.display_name,JSON.stringify({support:{before:current,after:values}}),time),
   ]);
   if(!result[0].meta.changes)fail(409,'담당자 안내가 변경되었습니다. 최신 내용을 불러와 확인해주세요.');
   return json({ok:true});
  }
 }
 if(path==='/api/admin/member-requests'&&req.method==='GET'){
  const memberId=url.searchParams.get('memberId'),status=url.searchParams.get('status')||'';
  if(memberId!==null&&!uuid(memberId))fail(400,'회원을 확인해주세요.');
  if(!['','active','pending','reviewing','completed','rejected'].includes(status))fail(400,'요청 상태를 확인해주세요.');
  const rows=await stmt(env,`${requestSelect} WHERE (? IS NULL OR r.member_id=?) AND (?='' OR r.status=? OR (?='active' AND r.status IN ('pending','reviewing'))) ORDER BY r.created_at DESC,r.id DESC LIMIT 500`,memberId,memberId,status,status,status).all();
  return json({requests:rows.results.map(publicRequest)});
 }
 if(requestPath&&req.method==='PATCH'){
  const input=await body(req),note=text(input.note,2000,true),time=now();
  if(input.confirmed!==true||!['reviewing','completed','rejected'].includes(input.status)||!Number.isSafeInteger(input.version))fail(400,'처리 상태와 안내를 다시 확인해주세요.');
  const row=await stmt(env,'SELECT * FROM member_requests WHERE id=?',requestPath[1]).first();if(!row)fail(404,'요청을 찾을 수 없습니다.');
  const result=await env.DB.batch([
   stmt(env,"UPDATE member_requests SET status=?,note=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status IN ('pending','reviewing')",input.status,note,time,row.id,input.version),
   stmt(env,'INSERT INTO member_request_events SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),row.id,user.display_name,input.status,note,time),
  ]);
  if(!result[0].meta.changes)fail(409,'이미 처리했거나 변경된 요청입니다. 최신 내용을 불러와 확인해주세요.');
  return json({ok:true});
 }
 fail(404,'없는 담당자·요청 관리 기능입니다.');
}
