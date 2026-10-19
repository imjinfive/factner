import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {authApi,identity} from './auth.js';
import {credentials,randomToken,totp,totpStep,base32,sealSecret,openSecret,passwordHash} from './security.js';
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
const environment=()=>({DB:database(),MFA_ENCRYPTION_KEY:randomToken(),BOOTSTRAP_TOKEN:randomToken()});
const ownerPassword='a-strong-initial-owner-password';
async function setup(env,admin) {
  return admin('auth/setup',{username:'admin',displayName:'관리자',password:ownerPassword,setupToken:env.BOOTSTRAP_TOKEN});
}
async function enroll(admin) {
  const begin=await admin('auth/mfa/begin',{});assert.equal(begin.status,200);
  const finish=await admin('auth/mfa/confirm',{code:await totp(begin.data.secret)});assert.equal(finish.status,200);
  return {...finish.data,secret:begin.data.secret};
}
test('RFC 6238 vectors, replay window and authenticated encryption',async()=>{
  const secret=base32(new TextEncoder().encode('12345678901234567890'));
  for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) assert.equal(await totp(secret,seconds*1000,8),expected);
  const milliseconds=1234567890000,step=Math.floor(milliseconds/30000),code=await totp(secret,milliseconds);
  assert.equal(await totpStep(secret,code,-1,milliseconds),step);
  assert.equal(await totpStep(secret,code,step,milliseconds),null);
  assert.equal(await totpStep(secret,code,-1,milliseconds+90000),null);
  const key=randomToken(),sealed=await sealSecret(secret,key,'owner');
  assert.equal(sealed.includes(secret),false);assert.equal(await openSecret(sealed,key,'owner'),secret);
  await assert.rejects(()=>openSecret(sealed,key,'other-admin'));
  await assert.rejects(()=>openSecret(sealed,randomToken(),'owner'));
});
test('weak passwords are rejected for every administrator including admin',async()=>{
  assert.throws(()=>credentials({username:'admin',password:'admin'},5));
  const env=environment(),admin=client(env);
  assert.equal((await admin('auth/login',{username:'admin',password:'admin'})).status,400);
  assert.equal((await admin('auth/setup',{username:'admin',password:'admin',displayName:'관리자',setupToken:env.BOOTSTRAP_TOKEN})).status,400);
  env.DB.raw.prepare('INSERT INTO admins(id,username,display_name,password_hash,role,created_at,must_change_password) VALUES(?,?,?,?,?,?,1)').run('legacy','admin','관리자',await passwordHash(ownerPassword),'owner',new Date().toISOString());
  const login=await admin('auth/login',{username:'admin',password:ownerPassword});
  assert.equal(login.data.security.mustChangePassword,true);
  assert.equal((await admin('admin/private')).status,403);
  assert.equal((await admin('auth/mfa/begin',{})).status,403);
  assert.equal((await admin('auth/password',{currentPassword:ownerPassword,newPassword:'admin'})).status,400);
  assert.equal((await admin('auth/password',{currentPassword:ownerPassword,newPassword:'a-new-private-owner-password'})).status,200);
  assert.equal((await admin('auth/me')).status,401);
  assert.equal((await admin('auth/login',{username:'admin',password:'a-new-private-owner-password'})).data.security.mustChangePassword,false);
});
test('pending sessions cannot read data; enrollment needs proof; challenge rotates cookies and blocks replay',async()=>{
  const env=environment(),admin=client(env),initial=await setup(env,admin);
  assert.equal(initial.data.security.mfaSetupRequired,true);assert.equal(initial.data.security.ready,false);
  assert.equal((await admin('admin/private')).status,403);
  assert.equal((await admin('admin/users')).status,403);
  const begin=await admin('auth/mfa/begin',{});
  assert.equal((await admin('auth/mfa/confirm',{code:'bad'})).status,400);
  assert.equal((await admin('admin/private')).status,403);
  const finish=await admin('auth/mfa/confirm',{code:await totp(begin.data.secret)});
  assert.equal(finish.data.security.ready,true);assert.equal(finish.data.recoveryCodes.length,10);
  assert.match(finish.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(finish.headers.get('set-cookie'),/Secure/);
  assert.equal((await admin('admin/private')).status,200);
  const row=env.DB.raw.prepare('SELECT * FROM admins').get();assert.notEqual(row.mfa_secret,begin.data.secret);
  assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM admin_recovery_codes').get().n,10);
  const loginClient=client(env),login=await loginClient('auth/login',{username:'admin',password:ownerPassword}),pendingCookie=loginClient.cookie();
  assert.equal(login.data.security.mfaRequired,true);assert.equal((await loginClient('admin/private')).status,403);
  assert.equal((await loginClient('auth/password',{currentPassword:ownerPassword,newPassword:'a-new-private-owner-password'})).status,403);
  assert.equal((await loginClient('auth/mfa/verify',{code:await totp(begin.data.secret)})).status,400);
  const totpClient=client(env);await totpClient('auth/login',{username:'admin',password:ownerPassword});
  const nextCode=await totp(begin.data.secret,Date.now()+30000);
  assert.equal((await totpClient('auth/mfa/verify',{code:nextCode})).data.security.ready,true);
  assert.equal((await totpClient('auth/mfa/verify',{code:nextCode})).status,400);
  assert.equal((await loginClient('auth/mfa/verify',{recoveryCode:finish.data.recoveryCodes[0]})).status,200);
  assert.notEqual(loginClient.cookie(),pendingCookie);assert.equal((await loginClient('admin/private')).status,200);
  assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM admin_recovery_codes').get().n,9);
  assert.equal((await loginClient('auth/mfa/verify',{recoveryCode:finish.data.recoveryCodes[0]})).status,400);
  const pendingToken=pendingCookie.split('=')[1];
  const pendingReq=new Request('https://admin.factner.com/api/admin/private',{headers:{cookie:`factner_session=${pendingToken}`}});
  await assert.rejects(()=>identity(pendingReq,env),error=>error.status===401);
});
test('password changes revoke all sessions; staff setup and disabling enforce access',async()=>{
  const env=environment(),admin=client(env);await setup(env,admin);const ownerMfa=await enroll(admin);
  assert.equal((await admin('admin/users',{username:'staff',displayName:'담당자',password:'staff-initial-password-123'})).status,201);
  const staff=client(env);assert.equal((await staff('auth/login',{username:'staff',password:'staff-initial-password-123'})).data.security.mustChangePassword,true);
  assert.equal((await staff('admin/private')).status,403);
  assert.equal((await staff('auth/password',{currentPassword:'staff-initial-password-123',newPassword:'staff-personal-password-123'})).status,200);
  await staff('auth/login',{username:'staff',password:'staff-personal-password-123'});await enroll(staff);
  assert.equal((await staff('admin/private')).status,200);assert.equal((await staff('admin/users')).status,403);
  const staffId=(await admin('admin/users')).data.users.find(user=>user.username==='staff').id;
  assert.equal((await admin(`admin/users/${staffId}`,{active:false},'PATCH')).status,200);
  assert.equal((await staff('admin/private')).status,401);
  const otherOwner=client(env);await otherOwner('auth/login',{username:'admin',password:ownerPassword});await otherOwner('auth/mfa/verify',{recoveryCode:ownerMfa.recoveryCodes[0]});
  assert.equal((await admin('auth/password',{currentPassword:ownerPassword,newPassword:'new-private-password-12345'})).status,200);
  assert.equal((await otherOwner('admin/private')).status,401);assert.equal((await admin('admin/private')).status,401);
});
test('authenticator reset revokes old devices/codes; per-account and IP throttles apply',async()=>{
  const env=environment(),admin=client(env);await setup(env,admin);const enrolled=await enroll(admin);
  const other=client(env);await other('auth/login',{username:'admin',password:ownerPassword});await other('auth/mfa/verify',{recoveryCode:enrolled.recoveryCodes[0]});
  const reset=await admin('auth/mfa/reset',{currentPassword:ownerPassword});
  assert.equal(reset.data.security.mfaSetupRequired,true);assert.equal((await admin('admin/private')).status,403);assert.equal((await other('admin/private')).status,401);
  assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM admin_recovery_codes').get().n,0);
  const second=await enroll(admin);assert.notEqual(second.secret,enrolled.secret);
  const limited=client(env);await limited('auth/login',{username:'admin',password:ownerPassword});
  for(let index=0;index<12;index++) await limited('auth/mfa/verify',{code:'invalid'});
  assert.equal((await limited('auth/mfa/verify',{recoveryCode:second.recoveryCodes[0]})).status,429);
  env.DB.raw.prepare('DELETE FROM rate_limits').run();
  for(let index=0;index<10;index++) assert.equal((await client(env)(`auth/login`,{username:'admin',password:'wrong-password-long'})).status,401);
  assert.equal((await client(env)('auth/login',{username:'admin',password:ownerPassword})).status,429);
});
