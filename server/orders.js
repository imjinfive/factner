import {body,fail,json,now,stmt,text,rate} from './http.js';
import {memberIdentity,requireRole,memberFile} from './members.js';

export const orderStates={requested:'매칭 대기',matched:'업체 연결 확인',assigned:'업체 확인 중',quoted:'최종 승인 대기',approved:'발주 확정',producing:'제작 중',shipped:'출고',received:'입고 완료',cancelled:'취소'};
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
function date(value){const d=text(value,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d||d<now().slice(0,10))fail(400,'오늘 이후의 올바른 날짜를 선택해주세요.');return d;}
async function specInput(env,user,input){
 if(!input||typeof input!=='object')fail(400,'패키징 사양을 입력해주세요.');
 const spec={name:text(input.name,100,true),size:text(input.size,100,true),material:text(input.material,100,true),printing:text(input.printing,200),finish:text(input.finish,200),description:text(input.description,2000),files:[]};
 if(!Array.isArray(input.files)||input.files.length>6)fail(400,'첨부 파일은 최대 6개입니다.');
 for(const id of [...new Set(input.files.map(f=>typeof f==='string'?f:f?.id))]){
  if(!uuid(id))fail(400,'첨부 파일을 확인해주세요.');
  const f=await stmt(env,"SELECT id,name,mime,kind FROM member_files WHERE id=? AND member_id=? AND kind IN ('design','sample')",id,user.id).first();
  if(!f)fail(400,'사용할 수 없는 첨부 파일입니다.');spec.files.push(f);
 }
 return spec;
}
const parseOrder=row=>({...row,spec:JSON.parse(row.spec),proposal:row.proposal?JSON.parse(row.proposal):null,approved_snapshot:row.approved_snapshot?JSON.parse(row.approved_snapshot):null,shipping:row.shipping?JSON.parse(row.shipping):null});
const orderSelect=`SELECT o.*,b.name AS brand_name,s.name AS supplier_name FROM orders o JOIN members b ON b.id=o.brand_id LEFT JOIN members s ON s.id=o.supplier_id`;
async function getOrder(env,id,user,admin){
 const row=await stmt(env,`${orderSelect} WHERE o.id=?`,id).first();
 if(!row||(!admin&&row.brand_id!==user.id&&(row.supplier_id!==user.id||['requested','matched','cancelled'].includes(row.status))))fail(404,'발주를 찾을 수 없습니다.');
 return row;
}
async function mutate(env,order,input,user,patch,action,details={}){
 if(!Number.isSafeInteger(input.version)||input.version!==order.version)fail(409,'변경된 내용이 있습니다. 새로고침 후 다시 확인해주세요.');
 const entries=Object.entries(patch),time=now();
 const result=await env.DB.batch([
  stmt(env,`UPDATE orders SET ${entries.map(([key])=>`${key}=?`).join(',')},updated_at=?,version=version+1 WHERE id=? AND version=?`,...entries.map(([,value])=>value),time,order.id,input.version),
  stmt(env,'INSERT INTO order_events SELECT ?,?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),order.id,user.id,user.name||user.display_name,action,JSON.stringify(details),time),
 ]);
 if(!result[0].meta.changes)fail(409,'변경된 내용이 있습니다. 새로고침해주세요.');
 return json({ok:true});
}
export async function orderApi(req,env,url,adminUser){
 const admin=!!adminUser,base=admin?'/api/admin':'/api';
 const path=url.pathname;
 if(!path.startsWith(`${base}/orders`)&&!(!admin&&path.startsWith('/api/packagings')))return null;
 const user=adminUser||await memberIdentity(req,env);
 if(req.method!=='GET')await rate(env,`orders-write:${user.id}`,120,3600);
 if(path==='/api/packagings'&&!admin){
  requireRole(user,'brand');
  if(req.method==='GET'){
   const rows=await stmt(env,'SELECT * FROM packagings WHERE brand_id=? AND archived=0 ORDER BY favorite DESC,updated_at DESC',user.id).all();
   return json({packagings:rows.results.map(p=>({...p,spec:JSON.parse(p.spec)}))});
  }
  if(req.method==='POST'){
   const input=await body(req),spec=await specInput(env,user,input.spec),id=crypto.randomUUID(),time=now();
   const count=await stmt(env,'SELECT count(*) AS n FROM packagings WHERE brand_id=? AND archived=0',user.id).first();
   if(count.n>=200)fail(400,'패키징은 최대 200개까지 저장할 수 있어요.');
   await stmt(env,'INSERT INTO packagings(id,brand_id,spec,favorite,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,user.id,JSON.stringify(spec),input.favorite===true?1:0,time,time).run();return json({id},201);
  }
 }
 const packaging=path.match(/^\/api\/packagings\/([a-f0-9-]{36})$/);
 if(packaging&&!admin&&req.method==='PATCH'){
  requireRole(user,'brand');const input=await body(req);
  const row=await stmt(env,'SELECT * FROM packagings WHERE id=? AND brand_id=? AND archived=0',packaging[1],user.id).first();if(!row)fail(404,'패키징을 찾을 수 없습니다.');
  const spec=input.spec?await specInput(env,user,input.spec):JSON.parse(row.spec);
  const result=await stmt(env,'UPDATE packagings SET spec=?,favorite=?,archived=?,version=version+1,updated_at=? WHERE id=? AND brand_id=? AND version=?',JSON.stringify(spec),typeof input.favorite==='boolean'?Number(input.favorite):row.favorite,input.archived===true?1:0,now(),row.id,user.id,input.version||0).run();
  if(!result.meta.changes)fail(409,'패키징이 변경되었습니다. 다시 열어주세요.');return json({ok:true});
 }
 if(path===`${base}/orders`){
  if(req.method==='GET'){
   const page=Math.max(1,Math.min(10000,Number.parseInt(url.searchParams.get('page'),10)||1)),status=text(url.searchParams.get('status')||'',30);
   const access=admin?'1=1':user.role==='brand'?'o.brand_id=?':"o.supplier_id=? AND o.status NOT IN ('requested','matched','cancelled')";
   const args=admin?[]:[user.id],where=`WHERE ${access} AND (?='' OR o.status=?)`;
   const rows=await stmt(env,`${orderSelect} ${where} ORDER BY o.created_at DESC LIMIT 30 OFFSET ?`,...args,status,status,(page-1)*30).all();
   const total=await stmt(env,`SELECT count(*) AS n FROM orders o ${where}`,...args,status,status).first();
   return json({orders:rows.results.map(parseOrder),total:total.n,page});
  }
  if(req.method==='POST'&&!admin){
   requireRole(user,'brand');const input=await body(req),quantity=Number(input.quantity),deadline=date(input.requestedDate),address=text(input.address,300,true),note=text(input.note,2000);
   if(!uuid(input.id)||!Number.isSafeInteger(quantity)||quantity<1||quantity>100000000)fail(400,'수량과 접수 번호를 확인해주세요.');
   const existing=await stmt(env,'SELECT id,brand_id FROM orders WHERE id=?',input.id).first();
   if(existing){if(existing.brand_id!==user.id)fail(409,'접수 번호를 다시 생성해주세요.');return json({id:existing.id});}
   let source=null;if(input.sourceId){source=await getOrder(env,input.sourceId,user,false);if(source.brand_id!==user.id)fail(404,'이전 발주를 찾을 수 없습니다.');}
   const spec=await specInput(env,user,input.spec),time=now();
   await env.DB.batch([
    stmt(env,'INSERT INTO orders(id,brand_id,source_id,spec,quantity,requested_date,address,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',input.id,user.id,source?.id||null,JSON.stringify(spec),quantity,deadline,address,note,time,time),
    ...spec.files.map(f=>stmt(env,'INSERT INTO order_files VALUES(?,?)',input.id,f.id)),
    stmt(env,'INSERT INTO order_events VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),input.id,user.id,user.name,source?'지난 발주로 다시 요청':'발주 요청',JSON.stringify({spec,quantity,requestedDate:deadline,address,note}),time),
   ]);return json({id:input.id},201);
  }
 }
 if(path==='/api/admin/orders/suppliers'&&admin&&req.method==='GET'){
  const rows=await stmt(env,"SELECT id,name,business_number FROM members WHERE role='supplier' AND status='approved' ORDER BY name").all();return json({suppliers:rows.results});
 }
 const file=path.match(/^\/api\/admin\/orders\/files\/([a-f0-9-]{36})$/);
 if(file&&admin&&req.method==='GET'){
  const linked=await stmt(env,'SELECT file_id FROM order_files WHERE file_id=? LIMIT 1',file[1]).first();if(!linked)fail(404,'발주 자료를 찾을 수 없습니다.');return memberFile(req,env,file[1],user,true);
 }
 const match=path.match(new RegExp(`^${base}/orders/([a-f0-9-]{36})$`));
 if(match){
  const row=await getOrder(env,match[1],user,admin),order=parseOrder(row);
  if(req.method==='GET'){
   const events=await stmt(env,'SELECT actor_name,action,details,created_at FROM order_events WHERE order_id=? ORDER BY created_at,rowid',row.id).all();
   return json({order,events:events.results.map(e=>({...e,details:JSON.parse(e.details)}))});
  }
  if(req.method==='PATCH'){
   const input=await body(req),action=input.action;
   if(action==='assign'&&admin){
    if(!['requested','matched'].includes(row.status))fail(409,'견적 진행 중에는 업체를 변경할 수 없습니다.');
    const supplier=await stmt(env,"SELECT id,name FROM members WHERE id=? AND role='supplier' AND status='approved'",text(input.supplierId,36,true)).first();if(!supplier)fail(400,'승인된 제작 업체를 선택해주세요.');
    return mutate(env,row,input,user,{supplier_id:supplier.id,status:'matched'},'매칭 업체 제안',{supplier:supplier.name});
   }
   if(!admin&&user.role==='brand'&&row.brand_id===user.id){
    if(action==='share'&&row.status==='matched'){
     if(input.consent!==true)fail(400,'업체에 전달할 정보를 확인해주세요.');
     const active=await stmt(env,"SELECT id FROM members WHERE id=? AND status='approved'",row.supplier_id).first();if(!active)fail(409,'업체 이용 상태가 변경되었습니다. 운영팀에 문의해주세요.');
     return mutate(env,row,input,user,{status:'assigned'},'업체 연결 및 제작 자료 전달 동의',{supplierId:row.supplier_id,supplier:row.supplier_name,items:'패키징 사양·첨부 파일·수량·납기·배송지·요청 사항',purpose:'견적 및 제작 진행',version:'pilot-sharing-2026-10-21'});
    }
    if(action==='approve'&&row.status==='quoted'){
     if(input.consent!==true)fail(400,'최종 조건을 확인해주세요.');
     const active=await stmt(env,"SELECT id FROM members WHERE id=? AND status='approved'",row.supplier_id).first();if(!active)fail(409,'업체 이용 상태가 변경되었습니다. 운영팀에 문의해주세요.');
     if(order.proposal.deliveryDate<now().slice(0,10))fail(409,'납기가 지났습니다. 조건 재확인을 요청해주세요.');
     const snapshot={spec:order.spec,quantity:row.quantity,address:row.address,note:row.note,proposal:order.proposal,supplierId:row.supplier_id,supplierName:row.supplier_name,approvedBy:user.id,approvedAt:now()};
     return mutate(env,row,input,user,{status:'approved',approved_snapshot:JSON.stringify(snapshot)},'브랜드 최종 승인',snapshot);
    }
    if(action==='revise'&&row.status==='quoted'){
     const message=text(input.message,2000,true);return mutate(env,row,input,user,{status:'assigned',proposal:null},'조건 재확인 요청',{message});
    }
    if(action==='receive'&&row.status==='shipped')return mutate(env,row,input,user,{status:'received'},'브랜드 입고 확인');
   }
   if(!admin&&user.role==='supplier'&&row.supplier_id===user.id){
    if(action==='quote'&&['assigned','quoted'].includes(row.status)){
     const totalPrice=Number(input.totalPrice);if(!Number.isSafeInteger(totalPrice)||totalPrice<1||totalPrice>100000000000)fail(400,'총 견적 금액을 확인해주세요.');
     const proposal={totalPrice,deliveryDate:date(input.deliveryDate),terms:text(input.terms,2000,true),quotedAt:now(),quotedBy:user.id};
     return mutate(env,row,input,user,{status:'quoted',proposal:JSON.stringify(proposal)},'업체 견적 제안',proposal);
    }
    if(action==='produce'&&row.status==='approved')return mutate(env,row,input,user,{status:'producing'},'제작 시작');
    if(action==='ship'&&row.status==='producing'){
     const shipping={carrier:text(input.carrier,100,true),tracking:text(input.tracking,100,true),note:text(input.message,1000),shippedAt:now()};
     return mutate(env,row,input,user,{status:'shipped',shipping:JSON.stringify(shipping)},'출고 안내',shipping);
    }
   }
   if(action==='cancel'&&(admin||row.brand_id===user.id)&&['requested','matched','assigned','quoted'].includes(row.status))return mutate(env,row,input,user,{status:'cancelled'},'발주 요청 취소',{message:text(input.message,1000,true)});
   if(action==='message')return mutate(env,row,input,user,{status:row.status},'문의·진행 안내',{message:text(input.message,2000,true)});
   fail(409,'현재 단계 또는 계정에서는 처리할 수 없습니다.');
  }
 }
 fail(404,'없는 발주 기능입니다.');
}
