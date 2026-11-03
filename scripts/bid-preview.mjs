import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync,mkdirSync,statSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import worker from '../server/worker.js';
import {bidApi,roomDatabase} from '../server/bid-auth.js';
import {isolatedPostReview} from '../server/room-post-review.js';
import {localMemberPreview} from '../server/public-bid.js';
import {HttpError} from '../server/http.js';
import {seedReview} from './bid-seed.mjs';
import {randomToken} from '../server/security.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const folder=resolve(root,'.qa/bid-preview'); mkdirSync(folder,{recursive:true});
const live=new DatabaseSync(process.env.BID_PREVIEW_MEMORY==='1'?':memory:':resolve(folder,'members.sqlite'));
live.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
for(const name of readdirSync(resolve(root,'migrations')).filter(file=>file.endsWith('.sql')).sort()){
  if(live.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name))continue;
  live.exec('BEGIN');
  try{live.exec(readFileSync(resolve(root,'migrations',name),'utf8'));live.prepare('INSERT INTO local_migrations VALUES(?)').run(name);live.exec('COMMIT');}
  catch(error){live.exec('ROLLBACK');throw error;}
}
// These settings belong to the standalone loopback database only.
if(!live.prepare('SELECT 1 FROM policy_versions LIMIT 1').get()){
  const config={operator:'팩트너 로컬 검증',contactEmail:'contact@example.test',accepting:false,memberAccepting:true};
  const doc={...config,terms:'로컬 가입 절차 검증용 약관입니다. 외부 개인 정보를 입력하지 마세요.',privacy:'이 컴퓨터의 로컬 DB만 사용합니다.',collection:'입력한 정보는 로컬 가입·승인 검증에 사용됩니다.',transfer:'외부로 제공하지 않습니다.'};
  live.exec('BEGIN');try{
    live.prepare("UPDATE settings SET value=? WHERE key='service'").run(JSON.stringify(config));
    live.prepare('INSERT INTO policy_versions VALUES(?,?,?,?,?)').run('local-registration-v1',JSON.stringify(doc),1,'local',new Date().toISOString());
    live.exec('COMMIT');
  }catch(error){live.exec('ROLLBACK');throw error;}
}
function database(raw){
  function statement(sql,args=[]){
    const act=()=>{const q=raw.prepare(sql);return q.columns().length?{results:q.all(...args),meta:{changes:0}}:{results:[],meta:{changes:Number(q.run(...args).changes)}};};
    return {bind:(...v)=>statement(sql,v.map(x=>x instanceof ArrayBuffer?new Uint8Array(x):x)),act,first:async()=>raw.prepare(sql).get(...args)||null,all:async()=>({results:raw.prepare(sql).all(...args)}),run:async()=>act()};
  }
  return {prepare:sql=>statement(sql),batch:async items=>{
    raw.exec('BEGIN');try{const results=items.map(item=>item.act());raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}
  }};
}
const reviewRooms=new Map();
function reviewEnvironment(key){
  if(!reviewRooms.has(key)){
    const stored=new DatabaseSync(':memory:');stored.exec('PRAGMA foreign_keys=ON');
    stored.exec(readFileSync(resolve(root,'migrations/0013_bid_market.sql'),'utf8'));
    stored.exec(readFileSync(resolve(root,'migrations/0015_market_post_review.sql'),'utf8'));
    stored.exec(readFileSync(resolve(root,'migrations/0018_market_offer_review.sql'),'utf8'));
    stored.exec(readFileSync(resolve(root,'migrations/0019_submission_agreements.sql'),'utf8'));
    stored.exec('CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL)');
    seedReview(stored);
    reviewRooms.set(key,{DB:database(stored),BID_DEMO:'1'});
  }return reviewRooms.get(key);
}
const env={DB:database(live),APP_KIND:'main',[localMemberPreview]:true,BID_ROOMS:{
  idFromName:name=>name,get:key=>({fetch:async req=>bidApi(req,await reviewEnvironment(key),new URL(req.url))})
}};
const port=Number(process.env.BID_PREVIEW_PORT||4180);
const dist=resolve(root,'rebate-ui/dist');
if(!existsSync(resolve(dist,'index.html')))throw new Error('Build the frontend before starting the preview.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.jpg':'image/jpeg'};
const watchers=new Set();
const heartbeat=setInterval(()=>{for(const response of watchers)response.write(': keepalive\n\n');},20000);
heartbeat.unref();
function serve(port,dist,environment){
const admin=environment.APP_KIND==='admin';
const server=http.createServer(async(req,res)=>{
  try{
    const allowedHosts=['127.0.0.1:'+port,'localhost:'+port];
    if(!allowedHosts.includes(req.headers.host))throw new HttpError(403,'허용되지 않은 호스트입니다.');
    const url=new URL(req.url,'http://'+req.headers.host);
    if(url.pathname.startsWith('/api/')){
      if(!admin && req.method==='GET' && url.pathname==='/api/bid/events'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});
        res.write('retry: 3000\n\n');watchers.add(res);res.on('close',()=>watchers.delete(res));return;
      }
      if(req.method!=='GET'&&(!['POST','PATCH','PUT'].includes(req.method)||req.headers.origin!==url.origin))throw new HttpError(403,'허용되지 않은 요청입니다.');
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>(admin||url.pathname==='/api/bid/register'?12000000:20000))throw new HttpError(413,'입력이 너무 큽니다.');chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:req.headers,body:req.method==='GET'?undefined:Buffer.concat(chunks)});
      const response=await worker.fetch(request,environment);
      if(!response)throw new HttpError(404,'없는 경로입니다.');
      if(response.ok && req.method==='POST' && (/^\/api\/admin\/market\/posts\/[^/]+\/review$/.test(url.pathname) || (!req.headers.authorization && /^\/api\/bid\/posts\/[^/]+\/withdraw$/.test(url.pathname))) && (await response.clone().json()).visibilityChanged){
        for(const watcher of watchers)watcher.write('data: refresh\n\n');
      }
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const path=resolve(dist,'.'+decodeURIComponent(url.pathname));
    if(path!==dist&&!path.startsWith(dist+sep))throw new HttpError(404,'경로를 찾을 수 없습니다.');
    const index=resolve(path,'index.html');
    const file=existsSync(path)&&statSync(path).isFile()?path:existsSync(index)&&statSync(index).isFile()?index:!extname(url.pathname)?resolve(dist,'index.html'):null;
    if(!file)throw new HttpError(404,'페이지를 찾을 수 없습니다.');
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
    res.end(readFileSync(file));
  }catch(err){
    if(!(err instanceof HttpError))console.error(err);
    res.writeHead(err.status||500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:err instanceof HttpError?err.message:'요청을 처리하지 못했습니다.'}));
  }
});
server.listen(port,'127.0.0.1',()=>console.log('팩트너 '+(admin?'관리자':'고객')+' · http://127.0.0.1:'+port));
}
serve(port,dist,env);
if(process.argv.includes('--admin')){
  const adminEnv={DB:env.DB,APP_KIND:'admin',[localMemberPreview]:true,REVIEW_ROOMS:{
    idFromName:key=>key,get:key=>({fetch:async request=>{
      const room=reviewRooms.get(key);
      if(!room)return Response.json({error:'공유한 공고를 찾을 수 없습니다.'},{status:404});
      return isolatedPostReview(request,{...room,[roomDatabase]:room.DB});
    }})}};
  if(!live.prepare('SELECT 1 FROM admins LIMIT 1').get()){
    const keyFile=resolve(folder,'admin-setup-key.txt');
    if(!existsSync(keyFile))writeFileSync(keyFile,randomToken(),{flag:'wx',mode:0o600});
    adminEnv.BOOTSTRAP_TOKEN=readFileSync(keyFile,'utf8').trim();
    console.log('로컬 최초 관리자 설정 키 파일: '+keyFile);
  }
  serve(Number(process.env.BID_PREVIEW_ADMIN_PORT||4181),resolve(root,'admin-ui'),adminEnv);
}
