import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmod,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// Read-only production export. All restore checks run in a separate temporary local database.
process.umask(0o077);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(!(args.length===1 && args[0]==='--remote') && !(args.length===2 && args[0]==='--file')) {
  console.error('Usage: node scripts/backup-check.mjs --remote\n       node scripts/backup-check.mjs --file /absolute/path/export.sql');
  process.exit(1);
}
const folder=join(root,'.qa','backups');await mkdir(folder,{recursive:true,mode:0o700});await chmod(folder,0o700);
const stamp=new Date().toISOString().replaceAll(':','-');
let sqlPath;
if(args[0]==='--remote') {
  const settings=JSON.parse(await readFile(join(root,'wrangler.jsonc'),'utf8'));
  const db=settings.d1_databases?.find(item=>item.binding==='DB');
  if(settings.name!=='factner-main' || db?.database_name!=='factner-db' || db?.database_id!=='404584fd-6ae3-483e-af2e-4999f343a6b1') throw new Error('팩트너 데이터베이스 설정을 확인해주세요.');
  const cli=join(root,'node_modules','wrangler','bin','wrangler.js');
  const run=(command)=>{
    const result=spawnSync(process.execPath,[cli,...command,'--config',join(root,'wrangler.jsonc')],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
    if(result.status!==0) throw new Error('Cloudflare 내보내기 또는 복구 시점 조회에 실패했습니다. Wrangler 인증과 권한을 확인해주세요.');
    return result.stdout;
  };
  const bookmark=run(['d1','time-travel','info','factner-db','--json']);
  await writeFile(join(folder,`factner-${stamp}-bookmark.json`),bookmark,{mode:0o600,flag:'wx'});
  sqlPath=join(folder,`factner-${stamp}.sql`);
  run(['d1','export','factner-db','--remote','--skip-confirmation',`--output=${sqlPath}`]);
  await chmod(sqlPath,0o600);
} else sqlPath=resolve(args[1]);
const sql=await readFile(sqlPath,'utf8');
const temp=await mkdtemp(join(folder,'restore-check-'));await chmod(temp,0o700);
let restored;
try {
  const localPath=join(temp,'restored.sqlite');
  restored=new DatabaseSync(localPath,{allowExtension:false});await chmod(localPath,0o600);
  restored.exec('PRAGMA foreign_keys=OFF');
  restored.exec(sql);
  const integrity=restored.prepare('PRAGMA integrity_check').all();
  if(integrity.length!==1 || Object.values(integrity[0])[0]!=='ok') throw new Error('복구본의 무결성 확인에 실패했습니다.');
  if(restored.prepare('PRAGMA foreign_key_check').all().length) throw new Error('복구본의 데이터 연결 확인에 실패했습니다.');
  const tables=restored.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
  for(const table of ['admins','quotes','quote_events','settings']) if(!tables.includes(table)) throw new Error('필수 운영 테이블이 누락되었습니다.');
  const counts={};for(const name of tables) if(/^[a-z_]+$/.test(name) && !name.startsWith('_')) counts[name]=restored.prepare(`SELECT count(*) AS count FROM "${name}"`).get().count;
  const report={checkedAt:new Date().toISOString(),source:sqlPath,sha256:createHash('sha256').update(sql).digest('hex'),integrity:'ok',foreignKeys:'ok',tables:counts,productionModified:false};
  const reportPath=join(folder,`factner-${stamp}-report.json`);
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({...report,reportPath},null,2));
} finally {
  restored?.close();
  await rm(temp,{recursive:true,force:true});
}
