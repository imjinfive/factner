import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {supplierAdminApi,supplierPublicApi,supplierInput,readPhoto,MAX_PHOTO_BYTES} from './suppliers.js';
import {readSaved} from '../rebate-ui/src/model.js';
import {catalogFromResponse} from '../rebate-ui/src/useSuppliers.js';

function database() {
  const db=new DatabaseSync(':memory:');
  for(const file of ['0001_initial.sql','0003_suppliers.sql'])db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  return {prepare(sql){return {bind(...args){const values=args.map(a=>a instanceof ArrayBuffer?new Uint8Array(a):a);return {
    async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};},
  };}};},async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},raw:db};
}
const owner={id:'owner-1',role:'owner',display_name:'테스트 운영자'};
const valid=()=>({name:'테스트 실제업체',categories:['단상자'],area:'경기 파주',moq:100,days:7,description:'실제 제작 정보 테스트',material:'종이',finish:'무광',tags:['소량'],state:'draft',actualConfirmed:true,visit:false,visitedAt:'',verifiedBy:'',internalNote:'비공개 연락처'});
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg2kAAAAASUVORK5CYII=','base64'));
function client(env,admin=true,user=owner){return async(path,data,method=data?'POST':'GET',headers={})=>{
  const url=new URL(`https://factner.com/api/${admin?'admin/':''}${path}`);
  const req=new Request(url,{method,headers:{'content-type':'application/json',...headers},body:data===undefined?undefined:data instanceof Uint8Array?data:JSON.stringify(data)});
  try{const response=await (admin?supplierAdminApi(req,env,url,user):supplierPublicApi(req,env,url));return {status:response?.status??404,response,data:response?.headers.get('content-type')?.includes('json')?await response.json():null};}catch(error){if(!error.status)throw error;return {status:error.status,error:error.message};}
};}
test('supplier publishing, verified evidence, draft image isolation, optimistic edits and archive',async()=>{
  const env={DB:database()},admin=client(env),publicApi=client(env,false);
  assert.equal((await client(env,true,null)('suppliers')).status,401);
  assert.equal((await client(env,true,{...owner,role:'staff'})('suppliers',valid())).status,403);
  assert.equal((await admin('suppliers',{...valid(),state:'published'})).status,400);
  const created=await admin('suppliers',valid());assert.equal(created.status,201);let supplier=created.data.supplier;
  const save=async patch=>{const result=await admin(`suppliers/${supplier.id}`,{...supplier,...patch},'PATCH');if(result.data)supplier=result.data.supplier;return result;};
  const photo=async kind=>{const result=await admin(`suppliers/${supplier.id}/images?version=${supplier.version}&actual=true&caption=${encodeURIComponent('실제 테스트 사진')}&kind=${kind}`,png,'POST',{'content-type':'image/png'});if(result.status===201)supplier=(await admin(`suppliers/${supplier.id}`)).data.supplier;return result;};
  assert.deepEqual((await publicApi('suppliers')).data.suppliers,[]);
  assert.equal((await save({visit:true,visitedAt:'2026-01-01',verifiedBy:'담당자'})).status,400);
  const first=await photo('workshop');assert.equal(first.status,201);
  assert.equal((await publicApi(`supplier-images/${first.data.id}`)).status,404);
  const privateImage=await admin(`supplier-images/${first.data.id}`);assert.equal(privateImage.status,200);assert.deepEqual(new Uint8Array(await privateImage.response.arrayBuffer()),png);
  assert.equal((await save({state:'published',actualConfirmed:false})).status,400);
  assert.equal((await save({state:'published'})).status,200);
  let publicSupplier=(await publicApi('suppliers')).data.suppliers[0];
  assert.equal(publicSupplier.name,supplier.name);assert.equal(publicSupplier.rating,null);assert.equal(publicSupplier.reviews,0);assert.equal(publicSupplier.visit,false);
  assert.equal(Object.hasOwn(publicSupplier,'internalNote'),false);assert.equal(Object.hasOwn(publicSupplier,'verifiedBy'),false);assert.equal(Object.hasOwn(publicSupplier,'version'),false);
  assert.equal((await publicApi(`supplier-images/${first.data.id}`)).status,200);
  assert.equal((await admin(`suppliers/${supplier.id}`,{...supplier,version:supplier.version-1},'PATCH')).status,409);
  assert.equal((await admin(`suppliers/${supplier.id}/images/${first.data.id}`,{action:'remove',version:supplier.version})).status,400);
  await photo('sample');await photo('delivery');
  assert.equal((await save({visit:true,visitedAt:'2026-01-01',verifiedBy:'실제 확인자'})).status,200);
  publicSupplier=(await publicApi('suppliers')).data.suppliers[0];assert.equal(publicSupplier.visit,true);assert.equal(publicSupplier.visitedAt,'2026-01-01');
  const workshop=supplier.photos.find(p=>p.kind==='workshop');
  assert.equal((await admin(`suppliers/${supplier.id}/images/${workshop.id}`,{kind:'case',caption:'변경',version:supplier.version},'PATCH')).status,400);
  assert.equal((await save({state:'archived'})).status,200);
  assert.deepEqual((await publicApi('suppliers')).data.suppliers,[]);assert.equal((await publicApi(`supplier-images/${first.data.id}`)).status,404);
  assert.equal((await photo('case')).status,409);
  assert.equal((await save({state:'draft',visit:false})).status,200);
  assert.equal((await admin(`suppliers/${supplier.id}/images/${workshop.id}`,{action:'remove',version:supplier.version})).status,200);
  assert.equal((await admin(`supplier-images/${workshop.id}`)).status,404);
  assert.ok((await admin(`suppliers/${supplier.id}`)).data.events.length>=8);
});
test('photo validation enforces types, bytes, count, actual-photo acknowledgement and edit versions',async()=>{
  for(const [mime,bytes] of [['image/svg+xml',new TextEncoder().encode('<svg/>')],['image/jpeg',png],['image/png',new Uint8Array(MAX_PHOTO_BYTES+1)]])await assert.rejects(()=>readPhoto(new Request('https://factner.com',{method:'POST',headers:{'content-type':mime},body:bytes})),error=>[400,413,415].includes(error.status));
  assert.equal((await readPhoto(new Request('https://factner.com',{method:'POST',headers:{'content-type':'image/png'},body:png}))).mime,'image/png');
  const env={DB:database()},admin=client(env),created=await admin('suppliers',valid()),id=created.data.supplier.id;
  const upload=parameters=>admin(`suppliers/${id}/images?kind=case&caption=photo&${parameters}`,png,'POST',{'content-type':'image/png'});
  assert.equal((await upload('version=1&actual=false')).status,400);
  assert.equal((await upload('version=2&actual=true')).status,409);
  for(let version=1;version<=8;version++)assert.equal((await upload(`version=${version}&actual=true`)).status,201);
  assert.equal((await upload('version=9&actual=true')).status,400);
});
test('supplier values reject malformed fields; saved favorites preserve real UUIDs without accepting arbitrary entries',()=>{
  for(const patch of [{categories:['가짜 분류']},{moq:0},{days:731},{visitedAt:'2026-02-31'},{visitedAt:'2999-01-01'},{tags:['x'.repeat(41)]},{state:'other'}])assert.throws(()=>supplierInput({...valid(),...patch}));
  const original=globalThis.localStorage,id=crypto.randomUUID();
  try{globalThis.localStorage={getItem:()=>JSON.stringify(['paper',id,id,'unknown',{},'a'.repeat(36)])};assert.deepEqual(readSaved('rebate:favorites',[]),['paper',id]);}finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});
test('public catalog uses examples only in explicit test mode and never fills an empty live catalog with them',()=>{
  assert.equal(catalogFromResponse({accepting:false},{suppliers:[]}).source,'demo');
  assert.deepEqual(catalogFromResponse({accepting:true},{suppliers:[]}).suppliers,[]);
  assert.throws(()=>catalogFromResponse({}, {suppliers:[]}));
  assert.throws(()=>catalogFromResponse({accepting:false}, {}));
  const real=[{id:crypto.randomUUID(),source:'real'}];
  assert.equal(catalogFromResponse({accepting:false},{suppliers:real}).source,'real');
  assert.equal(catalogFromResponse({accepting:true},{suppliers:real}).suppliers,real);
});

test('new supplier saves selected photos before publication and resumes a partial upload',async()=>{
  const {saveNewSupplier}=await import('../admin-ui/supplier-save.js');
  const env={DB:database()},admin=client(env),publicApi=client(env,false);
  let failSecond=true,uploads=0,creates=0;
  const checked=result=>{if(result.status>=400)throw Object.assign(new Error(result.error),{status:result.status});return result.data;};
  const send=async(path,data,method)=>{if(path==='admin/suppliers')creates++;return checked(await admin(path.replace('admin/',''),data,method));};
  const api=async(path,options)=>{
    uploads++;
    if(uploads===2&&failSecond)throw new Error('temporary upload failure');
    return checked(await admin(path.replace('admin/',''),new Uint8Array(await options.body.arrayBuffer()),options.method,Object.fromEntries(new Headers(options.headers))));
  };
  const state={supplier:null},photos=['workshop','sample','delivery'].map(kind=>({file:new File([png],kind+'.png',{type:'image/png'}),caption:kind,kind}));
  const payload={...valid(),state:'published',visit:true,visitedAt:'2026-01-01',verifiedBy:'방문 담당자'};
  await assert.rejects(()=>saveNewSupplier({api,send,state,payload,photos}),/temporary upload failure/);
  assert.equal(creates,1);assert.equal(photos[0].uploaded,true);assert.equal(photos[1].uploaded,undefined);
  assert.equal((await admin('suppliers')).data.suppliers.length,1);
  assert.equal((await publicApi('suppliers')).data.suppliers.length,0);
  failSecond=false;
  const result=await saveNewSupplier({api,send,state,payload,photos});
  assert.equal(creates,1);assert.equal(uploads,4);assert.equal(result.supplier.state,'published');
  assert.deepEqual(result.supplier.photos.map(p=>p.kind).sort(),['delivery','sample','workshop']);
  assert.equal((await publicApi('suppliers')).data.suppliers[0].visit,true);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM supplier_images').get().n,3);
});
test('new supplier can be saved without photos as a private draft',async()=>{
  const {saveNewSupplier}=await import('../admin-ui/supplier-save.js');
  const env={DB:database()},admin=client(env);
  const send=async(path,data,method)=>{const result=await admin(path.replace('admin/',''),data,method);assert.ok(result.status<300,result.error);return result.data;};
  const result=await saveNewSupplier({send,api:()=>assert.fail('no upload expected'),state:{supplier:null},payload:valid(),photos:[]});
  assert.equal(result.supplier.state,'draft');assert.equal(result.supplier.photos.length,0);
});
