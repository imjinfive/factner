import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,mkdirSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {bidApi} from '../server/bid-auth.js';
import {HttpError} from '../server/http.js';
import {seedReview} from './bid-seed.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const folder=resolve(root,'.qa/bid-preview'); mkdirSync(folder,{recursive:true});
const raw=new DatabaseSync(process.env.BID_PREVIEW_MEMORY==='1'?':memory:':resolve(folder,'review.sqlite'));
raw.exec('PRAGMA foreign_keys=ON');
if(!raw.prepare("SELECT 1 FROM sqlite_master WHERE name='market_accounts'").get()){
  raw.exec(readFileSync(resolve(root,'migrations/0013_bid_market.sql'),'utf8'));
}
raw.exec('CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL)');
await seedReview(raw);
function statement(sql,args){
  const act=()=>{
    const q=raw.prepare(sql);
    if(q.columns().length)return {results:q.all(...args),meta:{changes:0}};
    return {results:[],meta:{changes:Number(q.run(...args).changes)}};
  };
  return {bind:(...values)=>statement(sql,values),act,first:async()=>raw.prepare(sql).get(...args)||null,all:async()=>({results:raw.prepare(sql).all(...args)}),run:async()=>act()};
}
const db={prepare:sql=>statement(sql,[]),batch:async items=>{
  raw.exec('BEGIN');try{const itemsDone=items.map(q=>q.act());raw.exec('COMMIT');return itemsDone;}catch(err){raw.exec('ROLLBACK');throw err;}
}};
const env={DB:db,BID_DEMO:'1',previewAdminSessions:new Map()};
const port=Number(process.env.BID_PREVIEW_PORT||4180);
const dist=resolve(root,'rebate-ui/dist');
if(!existsSync(resolve(dist,'index.html')))throw new Error('Build the frontend before starting the preview.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.jpg':'image/jpeg'};
const watchers=new Set();
const heartbeat=setInterval(()=>{for(const response of watchers)response.write(': keepalive\n\n');},20000);
heartbeat.unref();
const server=http.createServer(async(req,res)=>{
  try{
    const allowedHosts=['127.0.0.1:'+port,'localhost:'+port];
    if(!allowedHosts.includes(req.headers.host))throw new HttpError(403,'허용되지 않은 호스트입니다.');
    const url=new URL(req.url,'http://'+req.headers.host);
    if(url.pathname.startsWith('/api/')){
      if(req.method==='GET' && url.pathname==='/api/bid/events'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});
        res.write('retry: 3000\n\n');watchers.add(res);res.on('close',()=>watchers.delete(res));return;
      }
      if(req.method!=='GET'&&(req.method!=='POST'||req.headers.origin!==url.origin))throw new HttpError(403,'허용되지 않은 요청입니다.');
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>20000)throw new HttpError(413,'입력이 너무 큽니다.');chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:req.headers,body:req.method==='GET'?undefined:Buffer.concat(chunks)});
      const response=await bidApi(request,env,url);
      if(!response)throw new HttpError(404,'없는 경로입니다.');
      if(response.ok && req.method==='POST' && url.pathname==='/api/bid/posts'){
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
server.listen(port,'127.0.0.1',()=>console.log('Factner review: http://127.0.0.1:'+port));
