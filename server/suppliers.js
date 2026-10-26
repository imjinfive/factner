import {categories} from '../rebate-ui/src/model.js';
import {json,fail,now,stmt,body,text,rate} from './http.js';

const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const kinds = ['workshop','sample','delivery','case'];
const states = ['draft','published','archived'];
// ponytail: bounded launch collection in D1; move photos to R2 before the collection approaches the D1 storage ceiling.
export const MAX_PHOTO_BYTES = 1500000;
const photoColumns = 'id,supplier_id,caption,kind,created_at';
const photosFor = async (env,id) => (await stmt(env,`SELECT ${photoColumns} FROM supplier_images WHERE supplier_id=? ORDER BY created_at,id`,id).all()).results;
const versionOf = value => { const version=Number(value);if(!Number.isSafeInteger(version)||version<1)fail(400,'업체 버전을 확인해주세요.');return version; };
const photoView = (photo,admin=false) => ({id:photo.id,caption:photo.caption,kind:photo.kind,url:`/api/${admin?'admin/':''}supplier-images/${photo.id}`});
function publicView(row,photos) {
  return {id:row.id,name:row.name,categories:JSON.parse(row.categories),area:row.area,moq:row.moq,days:row.days,
    description:row.description,material:row.material,finish:row.finish,tags:JSON.parse(row.tags),
    visit:row.visited===1,visitedAt:row.visited?row.visited_at:'',rating:null,reviews:0,review:'',tier:'',source:'real',
    photos:photos.map(p=>photoView(p)),imageUrl:photos[0]?photoView(photos[0]).url:''};
}
function adminView(row,photos) {
  return {...publicView(row,photos),state:row.state,actualConfirmed:row.actual_confirmed===1,
    visitedAt:row.visited_at,verifiedBy:row.verified_by,internalNote:row.internal_note,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,
    photos:photos.map(p=>photoView(p,true))};
}
function list(value,max,allowed) {
  if(!Array.isArray(value)||value.length>max)fail(400,'분류와 태그를 확인해주세요.');
  const values=[...new Set(value.map(item=>text(item,40,true)))];
  if(allowed&&values.some(item=>!allowed.includes(item)))fail(400,'제작 가능한 패키징 분류를 확인해주세요.');
  return values;
}
export function supplierInput(input) {
  const data={name:text(input.name,80,true),categories:list(input.categories??[],5,categories.slice(1)),area:text(input.area,100),
    moq:Number(input.moq??1),days:Number(input.days??1),description:text(input.description,1500),material:text(input.material,300),
    finish:text(input.finish,300),tags:list(input.tags??[],6),state:input.state??'draft',actualConfirmed:input.actualConfirmed===true,
    visit:input.visit===true,visitedAt:text(input.visitedAt,10),verifiedBy:text(input.verifiedBy,60),internalNote:text(input.internalNote,5000)};
  if(!states.includes(data.state))fail(400,'업체 공개 상태를 확인해주세요.');
  if(!Number.isSafeInteger(data.moq)||data.moq<1||data.moq>10000000||!Number.isSafeInteger(data.days)||data.days<1||data.days>730)fail(400,'최소 수량과 제작 기간을 확인해주세요.');
  if(data.visitedAt&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.visitedAt)||!Number.isFinite(Date.parse(data.visitedAt))||new Date(data.visitedAt).toISOString().slice(0,10)!==data.visitedAt||data.visitedAt>now().slice(0,10)))fail(400,'실제 방문일을 입력해주세요.');
  return data;
}
function validatePublication(data,photos) {
  if(data.visit&&(!data.actualConfirmed||!data.visitedAt||!data.verifiedBy||!['workshop','sample','delivery'].every(kind=>photos.some(p=>p.kind===kind))))fail(400,'현장 검증은 방문일·확인자와 작업 현장, 제작 샘플, 납품 품질의 실제 사진이 모두 필요합니다.');
  if(data.state==='published'&&(!data.actualConfirmed||!data.categories.length||!data.area||!data.description||!data.material||!data.finish||!photos.length))fail(400,'실제 업체 확인, 제작 조건, 소개와 실제 사진을 등록한 뒤 공개해주세요.');
}
async function getSupplier(env,id) {
  const row=await stmt(env,'SELECT * FROM suppliers WHERE id=?',id).first();
  if(!row)fail(404,'업체를 찾을 수 없습니다.');return row;
}
function audit(env,id,user,action,date=now()) {return stmt(env,'INSERT INTO supplier_events(id,supplier_id,actor,action,created_at) SELECT ?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),id,user.display_name,action,date);}
function expectUpdated(result) {if(!result[0].meta.changes)fail(409,'다른 관리자가 수정했습니다. 다시 열고 저장해주세요.');}

export async function supplierPublicApi(req,env,url) {
  if(req.method!=='GET')return null;
  // Candidate previews are anonymous; the former catalog must not expose real suppliers or photos.
  if(url.pathname==='/api/suppliers'||url.pathname.startsWith('/api/supplier-images/'))fail(404,'공개 업체 조회는 제공하지 않습니다.');
  return null;
}
async function imageResponse(env,id) {
  const row=await stmt(env,'SELECT data,mime FROM supplier_images WHERE id=?',id).first();
  if(!row)fail(404,'사진을 찾을 수 없습니다.');
  const bytes=row.data instanceof ArrayBuffer?row.data:new Uint8Array(row.data);
  return new Response(bytes,{headers:{'Content-Type':row.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
export async function readPhoto(req) {
  const mime=req.headers.get('content-type')?.split(';')[0];
  if(!['image/jpeg','image/png','image/webp'].includes(mime))fail(415,'JPG, PNG, WebP 사진만 등록할 수 있습니다.');
  const reader=req.body?.getReader();if(!reader)fail(400,'사진이 비어 있습니다.');
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_PHOTO_BYTES){await reader.cancel();fail(413,'사진은 한 장당 1.5MB 이하로 줄여주세요.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const at=(start,values)=>values.every((n,i)=>bytes[start+i]===n);
  const jpeg=size>4&&at(0,[255,216,255])&&at(size-2,[255,217]);
  const png=size>=45&&at(0,[137,80,78,71,13,10,26,10])&&at(12,[73,72,68,82])&&at(size-8,[73,69,78,68]);
  const webp=size>=20&&at(0,[82,73,70,70])&&at(8,[87,69,66,80])&&new DataView(bytes.buffer).getUint32(4,true)===size-8;
  if(!(mime==='image/jpeg'&&jpeg||mime==='image/png'&&png||mime==='image/webp'&&webp))fail(400,'사진 형식과 파일 내용이 일치하지 않습니다.');
  return {mime,bytes};
}

export async function supplierAdminApi(req,env,url,user) {
  if(!url.pathname.startsWith('/api/admin/suppliers')&&!url.pathname.startsWith('/api/admin/supplier-images/'))return null;
  if(!user)fail(401,'로그인이 필요합니다.');
  if(user.role!=='owner')fail(403,'대표 관리자만 업체 정보를 관리할 수 있습니다.');
  const imageMatch=url.pathname.match(new RegExp(`^/api/admin/supplier-images/(${uuid})$`));
  if(imageMatch&&req.method==='GET')return imageResponse(env,imageMatch[1]);
  if(url.pathname==='/api/admin/suppliers') {
    if(req.method==='GET') {
      const rows=(await stmt(env,'SELECT * FROM suppliers ORDER BY updated_at DESC,id').all()).results;
      return json({suppliers:rows.map(row=>adminView(row,[]))});
    }
    if(req.method==='POST') {
      const data=supplierInput(await body(req));validatePublication(data,[]);
      const id=crypto.randomUUID(),date=now();
      await env.DB.batch([stmt(env,`INSERT INTO suppliers(id,name,categories,area,moq,days,description,material,finish,tags,state,actual_confirmed,visited,visited_at,verified_by,internal_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,data.name,JSON.stringify(data.categories),data.area,data.moq,data.days,data.description,data.material,data.finish,JSON.stringify(data.tags),data.state,+data.actualConfirmed,+data.visit,data.visitedAt,data.verifiedBy,data.internalNote,date,date),audit(env,id,user,'업체 초안 등록',date)]);
      return json({supplier:adminView(await getSupplier(env,id),[])},201);
    }
  }
  const match=url.pathname.match(new RegExp(`^/api/admin/suppliers/(${uuid})(?:/images(?:/(${uuid}))?)?$`));
  if(!match)return null;
  const id=match[1],row=await getSupplier(env,id),photos=await photosFor(env,id);
  if(!url.pathname.includes('/images')) {
    if(req.method==='GET')return json({supplier:adminView(row,photos),events:(await stmt(env,'SELECT actor,action,created_at FROM supplier_events WHERE supplier_id=? ORDER BY created_at DESC,id DESC LIMIT 100',id).all()).results});
    if(req.method==='PATCH') {
      const input=await body(req),version=versionOf(input.version),data=supplierInput(input);if(version!==row.version)fail(409,'다른 관리자가 수정했습니다. 다시 열고 저장해주세요.');validatePublication(data,photos);const date=now();
      const result=await env.DB.batch([stmt(env,`UPDATE suppliers SET name=?,categories=?,area=?,moq=?,days=?,description=?,material=?,finish=?,tags=?,state=?,actual_confirmed=?,visited=?,visited_at=?,verified_by=?,internal_note=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,data.name,JSON.stringify(data.categories),data.area,data.moq,data.days,data.description,data.material,data.finish,JSON.stringify(data.tags),data.state,+data.actualConfirmed,+data.visit,data.visitedAt,data.verifiedBy,data.internalNote,date,id,version),audit(env,id,user,`업체 정보 저장 · ${data.state==='published'?'공개':data.state==='archived'?'보관':'비공개'}`,date)]);
      expectUpdated(result);return json({supplier:adminView(await getSupplier(env,id),photos)});
    }
  } else if(!match[2]&&req.method==='POST') {
    const version=versionOf(url.searchParams.get('version'));
    if(version!==row.version)fail(409,'다른 관리자가 수정했습니다. 다시 열고 저장해주세요.');
    if(row.state==='archived')fail(409,'보관된 업체를 초안으로 변경한 뒤 사진을 등록해주세요.');
    if(photos.length>=8)fail(400,'업체별 사진은 최대 8장까지 등록할 수 있습니다.');
    if(url.searchParams.get('actual')!=='true')fail(400,'실제 업체 사진과 게시 권한을 확인해주세요.');
    const caption=text(url.searchParams.get('caption'),200,true),kind=url.searchParams.get('kind');
    if(!kinds.includes(kind))fail(400,'사진 종류를 선택해주세요.');
    await rate(env,`supplier-upload:${user.id}`,40,3600);
    const {mime,bytes}=await readPhoto(req),imageId=crypto.randomUUID(),date=now();
    const result=await env.DB.batch([
      stmt(env,'UPDATE suppliers SET version=version+1,updated_at=? WHERE id=? AND version=? AND (SELECT count(*) FROM supplier_images WHERE supplier_id=?)<8',date,id,version,id),
      stmt(env,'INSERT INTO supplier_images(id,supplier_id,mime,data,caption,kind,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1',imageId,id,mime,bytes.buffer,caption,kind,date),audit(env,id,user,'실제 업체 사진 등록',date)]);
    expectUpdated(result);return json({id:imageId,version:version+1},201);
  } else if(match[2]&&['PATCH','POST'].includes(req.method)) {
    const image=photos.find(p=>p.id===match[2]);if(!image)fail(404,'사진을 찾을 수 없습니다.');
    const input=await body(req),version=versionOf(input.version),remove=req.method==='POST'&&input.action==='remove';
    if(version!==row.version)fail(409,'다른 관리자가 수정했습니다. 다시 열고 저장해주세요.');
    if(req.method==='POST'&&!remove)fail(400,'사진 작업을 확인해주세요.');
    const caption=remove?'':text(input.caption,200,true),kind=remove?image.kind:input.kind;
    if(!kinds.includes(kind))fail(400,'사진 종류를 선택해주세요.');
    const candidate=remove?photos.filter(p=>p.id!==image.id):photos.map(p=>p.id===image.id?{...p,caption,kind}:p);
    validatePublication(supplierInput(adminView(row,photos)),candidate);
    const date=now(),mutation=remove?stmt(env,'DELETE FROM supplier_images WHERE id=? AND supplier_id=? AND changes()=1',image.id,id):stmt(env,'UPDATE supplier_images SET caption=?,kind=? WHERE id=? AND supplier_id=? AND changes()=1',caption,kind,image.id,id);
    const result=await env.DB.batch([stmt(env,'UPDATE suppliers SET version=version+1,updated_at=? WHERE id=? AND version=?',date,id,version),mutation,audit(env,id,user,remove?'업체 사진 삭제':'업체 사진 설명 저장',date)]);
    expectUpdated(result);return json({ok:true,version:version+1});
  }
  return null;
}
