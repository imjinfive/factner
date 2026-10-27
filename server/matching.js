import {body,fail,json,now,stmt,text,rate} from './http.js';
import {owner} from './auth.js';
import {memberIdentity,fileInput,fileStatement} from './members.js';

const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const categories={box:'박스',packaging:'제품 패키징',supplies:'부자재'};
const emptyProfile={summary:'',categories:[],quantity:0,productionPeriod:'',industry:'',delivery:'',material:'',finish:'',note:'',internalNote:''};
function profileInput(input){
 if(!Array.isArray(input.categories)||input.categories.some(c=>!Object.hasOwn(categories,c)))fail(400,'취급 품목을 확인해주세요.');
 const profile={categories:[...new Set(input.categories)],quantity:Number(input.quantity||0)};
 if(!Number.isSafeInteger(profile.quantity)||profile.quantity<0||profile.quantity>100000000)fail(400,'수량을 확인해주세요.');
 for(const key of ['summary','productionPeriod','industry','delivery','material','finish','note','internalNote'])profile[key]=text(input[key],key==='internalNote'?3000:key==='summary'?1000:500);
 if(input.listed===true&&(!profile.summary||!profile.categories.length))fail(400,'후보에 표시할 소개와 품목을 입력해주세요.');
 return profile;
}
const candidate=(row,index,category)=>{
 const p=JSON.parse(row.profile),label=`${index<26?String.fromCharCode(65+index):index+1}${row.role==='supplier'?'업체':'브랜드'}`;
 return {id:row.member_id,version:row.version,label,title:p.summary,category:categories[category],region:'지역 무관',quantity:p.quantity?`${row.role==='supplier'?'최소 ':'월 '}${p.quantity.toLocaleString('ko-KR')}개`:'수량 협의',schedule:row.role==='supplier'?p.productionPeriod||'일정 협의':p.delivery||'납품 방식 협의',note:p.note||'',demo:false};
};
async function candidates(env,user,category,capacity){
 const rows=await stmt(env,`SELECT c.member_id,c.profile,c.version,m.role FROM member_companies c JOIN members m ON m.id=c.member_id WHERE c.listed=1 AND m.status='approved' AND m.role<>? AND EXISTS(SELECT 1 FROM json_each(c.profile,'$.categories') WHERE value=?) ORDER BY c.created_at,c.member_id`,user.role,category).all();
 return rows.results.filter(row=>user.role==='brand'||!capacity||!JSON.parse(row.profile).quantity||JSON.parse(row.profile).quantity<=capacity).map((row,index)=>candidate(row,index,category));
}
function filters(input){
 if(!Object.hasOwn(categories,input.category))fail(400,'품목을 선택해주세요.');
 const capacity=input.capacity==='over'?100000000:input.capacity===undefined||input.capacity===null||input.capacity===''?null:Number(input.capacity);
 if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<1||capacity>100000000))fail(400,'제작 가능 수량을 확인해주세요.');
 return {category:input.category,capacity};
}
const requestSelect=`SELECT r.*,a.name AS requester_name,a.role AS requester_role,b.name AS target_name,b.role AS target_role FROM matching_requests r JOIN members a ON a.id=r.requester_id JOIN members b ON b.id=r.target_id`;
export async function matchingApi(req,env,url,adminUser){
 const path=url.pathname,admin=!!adminUser;
 const company=path.match(/^\/api\/admin\/members\/([a-f0-9-]{36})\/(company|files)$/);
 if(company&&!admin)return null;
 if(!company&&!path.startsWith(admin?'/api/admin/matching/':'/api/matching/'))return null;
 const user=adminUser||await memberIdentity(req,env);if(admin)owner(user);
 if(req.method!=='GET')await rate(env,`matching-write:${user.id}`,80,3600);
 if(company&&admin){
  const member=await stmt(env,'SELECT id,role,status FROM members WHERE id=?',company[1]).first();if(!member)fail(404,'회원을 찾을 수 없습니다.');
  if(company[2]==='files'&&req.method==='POST'){
   if(member.role!=='brand')fail(400,'브랜드의 패키징 자료만 등록할 수 있습니다.');
   const count=await stmt(env,'SELECT count(*) AS n FROM member_files WHERE member_id=?',member.id).first();if(count.n>=200)fail(400,'파일 보관 한도에 도달했습니다.');
   const file=fileInput(await body(req,2200000),['design','sample']);await fileStatement(env,member.id,file).run();return json({file:{id:file.id,name:file.name,mime:file.mime,kind:file.kind}},201);
  }
  if(company[2]==='company'){
   const row=await stmt(env,'SELECT * FROM member_companies WHERE member_id=?',member.id).first();
   if(req.method==='GET')return json({profile:row?{...JSON.parse(row.profile),member_id:member.id,version:row.version,listed:!!row.listed}:{...emptyProfile,member_id:member.id,version:0,listed:false}});
   if(req.method==='PUT'){
    const input=await body(req),profile=profileInput(input),time=now();
    if(input.confirmed!==true)fail(400,'저장할 업체 정보를 다시 확인해주세요.');
    if(!Number.isSafeInteger(input.version)||input.version!==(row?.version||0))fail(409,'업체 정보가 변경되었습니다. 새로고침해주세요.');
    const result=await env.DB.batch([
     row?stmt(env,'UPDATE member_companies SET profile=?,listed=?,version=version+1,updated_at=? WHERE member_id=? AND version=?',JSON.stringify(profile),input.listed===true?1:0,time,member.id,input.version):stmt(env,'INSERT OR IGNORE INTO member_companies(member_id,profile,listed,created_at,updated_at) VALUES(?,?,?,?,?)',member.id,JSON.stringify(profile),input.listed===true?1:0,time,time),
     stmt(env,'INSERT INTO member_profile_events SELECT ?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),member.id,user.display_name,JSON.stringify({company:{before:row?{...JSON.parse(row.profile),listed:!!row.listed}:null,after:{...profile,listed:input.listed===true}}}),time),
    ]);if(!result[0].meta.changes)fail(409,'업체 정보가 변경되었습니다. 새로고침해주세요.');return json({ok:true});
   }
  }
  fail(404,'없는 업체 관리 기능입니다.');
 }
 if(!admin&&path==='/api/matching/candidates'&&req.method==='GET'){
  const {category,capacity}=filters(Object.fromEntries(url.searchParams));return json({candidates:await candidates(env,user,category,capacity)});
 }
 const base=admin?'/api/admin/matching/requests':'/api/matching/requests';
 if(path===base&&req.method==='GET'){
  const memberId=admin?url.searchParams.get('memberId'):user.id,status=url.searchParams.get('status')||'';
  if(memberId!==null&&!uuid(memberId))fail(400,'회원을 확인해주세요.');
  if(!['','pending','reviewing','completed','rejected'].includes(status))fail(400,'요청 상태를 확인해주세요.');
  const rows=await stmt(env,`${requestSelect} WHERE (? IS NULL OR r.requester_id=? ${admin?'OR r.target_id=?':''}) AND (?='' OR r.status=?) ORDER BY r.created_at DESC,r.id DESC LIMIT 500`,memberId,memberId,...(admin?[memberId]:[]),status,status).all();
  return json({requests:rows.results.map(row=>admin?{...row,snapshot:JSON.parse(row.snapshot)}:{id:row.id,category:row.category,status:row.status,note:row.note,version:row.version,created_at:row.created_at,updated_at:row.updated_at,candidate:JSON.parse(row.snapshot)})});
 }
 if(!admin&&path===base&&req.method==='POST'){
  const input=await body(req),{category,capacity}=filters(input);
  if(input.confirmed!==true)fail(400,'선택한 후보와 요청 내용을 다시 확인해주세요.');
  if(!Array.isArray(input.candidateIds)||!input.candidateIds.length||input.candidateIds.length>50||input.candidateIds.some(id=>!uuid(id)))fail(400,'요청할 후보를 선택해주세요.');
  const selected=[...new Set(input.candidateIds)],available=await candidates(env,user,category,capacity),time=now();
  if(!input.candidateVersions||typeof input.candidateVersions!=='object'||Array.isArray(input.candidateVersions)||selected.some(id=>!Number.isSafeInteger(input.candidateVersions[id])))fail(400,'선택한 후보 조건을 다시 확인해주세요.');
  if(selected.some(id=>!available.some(c=>c.id===id&&c.version===input.candidateVersions[id])))fail(409,'후보 정보가 변경되었습니다. 다시 검색해주세요.');
  const versions=JSON.stringify(Object.fromEntries(selected.map(id=>[id,input.candidateVersions[id]])));
  const requests=selected.map(target=>({id:crypto.randomUUID(),target,snapshot:available.find(c=>c.id===target)}));
  await env.DB.batch(requests.map(r=>stmt(env,`INSERT OR IGNORE INTO matching_requests(id,requester_id,target_id,category,capacity,snapshot,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM members a JOIN members b JOIN member_companies c ON c.member_id=b.id JOIN json_each(?) requested ON requested.key=b.id AND requested.value=c.version WHERE a.id=? AND a.status='approved' AND b.status='approved' AND a.role<>b.role AND c.listed=1 AND EXISTS(SELECT 1 FROM json_each(c.profile,'$.categories') WHERE value=?) AND (? IS NULL OR a.role='brand' OR COALESCE(json_extract(c.profile,'$.quantity'),0)<=?))=?`,r.id,user.id,r.target,category,capacity,JSON.stringify(r.snapshot),time,time,versions,user.id,category,capacity,capacity,selected.length)));
  const rows=await stmt(env,`SELECT id,target_id FROM matching_requests WHERE requester_id=? AND category=? AND status IN ('pending','reviewing')`,user.id,category).all();
  const saved=rows.results.filter(r=>selected.includes(r.target_id));if(saved.length!==selected.length)fail(409,'일부 후보 상태가 변경되었습니다. 요청 목록을 확인한 후 다시 검색해주세요.');
  return json({ids:saved.map(r=>r.id),status:'pending'},201);
 }
 const match=path.match(/^\/api\/admin\/matching\/requests\/([a-f0-9-]{36})$/);
 if(admin&&match&&req.method==='PATCH'){
  const input=await body(req),note=text(input.note,1500),time=now();
  if(input.confirmed!==true||!['reviewing','completed','rejected'].includes(input.status)||!Number.isSafeInteger(input.version))fail(400,'처리할 상태와 내용을 다시 확인해주세요.');
  const row=await stmt(env,'SELECT * FROM matching_requests WHERE id=?',match[1]).first();if(!row)fail(404,'요청을 찾을 수 없습니다.');
  if(!['pending','reviewing'].includes(row.status))fail(409,'이미 처리한 요청입니다.');
  const result=await env.DB.batch([
   stmt(env,"UPDATE matching_requests SET status=?,note=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status IN ('pending','reviewing')",input.status,note,time,row.id,input.version),
   stmt(env,'INSERT INTO matching_request_events SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),row.id,user.display_name,input.status,note,time),
  ]);if(!result[0].meta.changes)fail(409,'요청이 변경되었습니다. 새로고침해주세요.');return json({ok:true});
 }
 fail(404,'없는 파트너 찾기 기능입니다.');
}
