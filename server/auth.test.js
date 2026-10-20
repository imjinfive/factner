import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {authApi,identity} from './auth.js';
import {credentials,randomToken,passwordHash} from './security.js';
function database() {
  const db=new DatabaseSync(':memory:'), directory=new URL('../migrations/',import.meta.url);
  for (const file of readdirSync(directory).filter(file=>file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file,directory),'utf8'));
  return {
    prepare(sql){return {bind(...args){return {
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args)};},
      async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},
    };}};},
    async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}},
    raw:db,
  };
}
function client(env,ip=crypto.randomUUID()) {
  let cookie='';
  const call=async(path,data,method=data?'POST':'GET')=>{
    const req=new Request(`https://admin.factner.com/api/${path}`,{method,headers:{cookie,Origin:'https://admin.factner.com','Content-Type':'application/json','CF-Connecting-IP':ip},body:data?JSON.stringify(data):undefined});
    try {
      const response=path==='admin/private' ? Response.json({user:await identity(req,env)}) : await authApi(req,env,new URL(req.url));
      if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      return {status:response.status,data:await response.json(),headers:response.headers};
    } catch(error) { if(!error.status)throw error;return {status:error.status,data:{error:error.message}}; }
  };
  call.cookie=()=>cookie;
  return call;
}
const environment=()=>({DB:database(),BOOTSTRAP_TOKEN:randomToken()});
const ownerPassword='test-owner12';
async function setup(env,admin) {
  return admin('auth/setup',{username:'admin',displayName:'관리자',password:ownerPassword,setupToken:env.BOOTSTRAP_TOKEN});
}
test('weak passwords are rejected for every administrator including admin',async()=>{
  assert.throws(()=>credentials({username:'admin',password:'admin'}));
  const env=environment(),admin=client(env);
  assert.equal((await admin('auth/login',{username:'admin',password:'admin'})).status,400);
  assert.equal((await admin('auth/setup',{username:'admin',password:'admin',displayName:'관리자',setupToken:env.BOOTSTRAP_TOKEN})).status,400);
  env.DB.raw.prepare('INSERT INTO admins(id,username,display_name,password_hash,role,created_at,must_change_password) VALUES(?,?,?,?,?,?,1)').run('legacy','admin','관리자',await passwordHash(ownerPassword),'owner',new Date().toISOString());
  const login=await admin('auth/login',{username:'admin',password:ownerPassword});
  assert.equal(login.data.security.mustChangePassword,true);
  assert.equal((await admin('admin/private')).status,403);
  assert.equal((await admin('auth/password',{currentPassword:ownerPassword,newPassword:'admin'})).status,400);
  assert.equal((await admin('auth/password',{currentPassword:ownerPassword,newPassword:'a-new-private-owner-password'})).status,200);
  assert.equal((await admin('auth/me')).status,401);
  assert.equal((await admin('auth/login',{username:'admin',password:'a-new-private-owner-password'})).data.security.mustChangePassword,false);
});
test('owner password login opens protected data directly and retired authenticator routes are unavailable',async()=>{
  const env=environment(),admin=client(env),initial=await setup(env,admin);
  assert.deepEqual(initial.data.security,{mustChangePassword:false,ready:true});
  assert.match(initial.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(initial.headers.get('set-cookie'),/Secure/);
  assert.equal((await admin('admin/private')).status,200);
  assert.equal((await admin('auth/logout',{})).status,200);
  assert.equal((await admin('admin/private')).status,401);
  const login=await admin('auth/login',{username:'admin',password:ownerPassword});
  assert.deepEqual(login.data.security,{mustChangePassword:false,ready:true});
  assert.equal((await admin('admin/private')).status,200);
  for(const route of ['begin','confirm','verify','reset']) assert.equal((await admin(`auth/mfa/${route}`,{})).status,404);
  env.DB.raw.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await admin('admin/private')).status,401);
});
test('password-only migration clears authenticator data and sessions while preserving accounts and password hashes',()=>{
  const {raw}=database(),date=new Date().toISOString();
  for(const role of ['owner','staff']) {
    raw.prepare(`INSERT INTO admins(id,username,display_name,password_hash,role,created_at,must_change_password,mfa_secret,mfa_pending_secret,mfa_pending_expires_at,mfa_last_step) VALUES(?,?,?,?,?,?,1,'old-secret','pending-secret',12345,99)`).run(role,role,role,'preserved-hash',role,date);
    raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at,mfa_verified) VALUES(?,?,?,1)').run(`${role}-session`,role,Date.now()+600000);
    raw.prepare('INSERT INTO admin_recovery_codes(admin_id,code_hash) VALUES(?,?)').run(role,`${role}-code`);
  }
  raw.exec(readFileSync(new URL('../migrations/0006_password_login.sql',import.meta.url),'utf8'));
  assert.equal(raw.prepare('SELECT count(*) n FROM sessions').get().n,0);
  assert.equal(raw.prepare('SELECT count(*) n FROM admin_recovery_codes').get().n,0);
  const accounts=raw.prepare('SELECT * FROM admins ORDER BY role').all();assert.equal(accounts.length,2);
  for(const account of accounts) {
    assert.equal(account.password_hash,'preserved-hash');assert.equal(account.active,1);assert.equal(account.auth_version,2);
    assert.equal(account.mfa_secret,'');assert.equal(account.mfa_pending_secret,'');assert.equal(account.mfa_pending_expires_at,0);assert.equal(account.mfa_last_step,-1);
    assert.equal(account.must_change_password,account.role==='owner'?0:1);
  }
});
test('password changes revoke all sessions; staff setup and disabling enforce access',async()=>{
  const env=environment(),admin=client(env);await setup(env,admin);
  assert.equal((await admin('admin/users',{username:'staff',displayName:'담당자',password:'staff-initial-password-123'})).status,201);
  const staff=client(env);assert.equal((await staff('auth/login',{username:'staff',password:'staff-initial-password-123'})).data.security.mustChangePassword,true);
  assert.equal((await staff('admin/private')).status,403);
  assert.equal((await staff('auth/password',{currentPassword:'staff-initial-password-123',newPassword:'staff-personal-password-123'})).status,200);
  await staff('auth/login',{username:'staff',password:'staff-personal-password-123'});
  assert.equal((await staff('admin/private')).status,200);assert.equal((await staff('admin/users')).status,403);
  const staffId=(await admin('admin/users')).data.users.find(user=>user.username==='staff').id;
  assert.equal((await admin(`admin/users/${staffId}`,{active:false},'PATCH')).status,200);
  assert.equal((await staff('admin/private')).status,401);
  const otherOwner=client(env);await otherOwner('auth/login',{username:'admin',password:ownerPassword});
  assert.equal((await admin('auth/password',{currentPassword:ownerPassword,newPassword:'new-private-password-12345'})).status,200);
  assert.equal((await otherOwner('admin/private')).status,401);assert.equal((await admin('admin/private')).status,401);
});
test('login throttles apply across IPs for one account and across accounts for one IP',async()=>{
  const env=environment(),admin=client(env);await setup(env,admin);
  env.DB.raw.prepare('DELETE FROM rate_limits').run();
  for(let index=0;index<10;index++) assert.equal((await client(env)(`auth/login`,{username:'admin',password:'wrong-password-long'})).status,401);
  assert.equal((await client(env)('auth/login',{username:'admin',password:ownerPassword})).status,429);
  env.DB.raw.prepare('DELETE FROM rate_limits').run();
  const sharedIp=client(env);
  for(let index=0;index<30;index++) assert.equal((await sharedIp('auth/login',{username:`unknown-${index}`,password:'wrong-password-long'})).status,401);
  assert.equal((await sharedIp('auth/login',{username:'admin',password:ownerPassword})).status,429);
});
