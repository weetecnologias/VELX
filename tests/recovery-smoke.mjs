import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const origin='http://localhost:5173';
const credentials=JSON.parse(readFileSync('.sites-runtime/local-test/credentials.json','utf8'));
const post=async(path,body)=>{const r=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
const signIn=async(email,password)=>{const r=await fetch(origin+'/__local-auth/login',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password})});assert.equal(r.status,303);return {cookie:r.headers.get('set-cookie')?.split(';')[0],location:r.headers.get('location')};};
const data=async(cookie)=>{const r=await fetch(origin+'/api/data',{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();};
async function getToken(email){const r=await post('/api/auth/recovery',{email});assert.equal(r.status,202,JSON.stringify(r.body));assert.equal(JSON.stringify(r.body).includes('token_hash'),false);const html=await (await fetch(origin+'/local-inbox')).text();const links=[...html.matchAll(/href="([^\"]+)">Reset password for ([^<]+)<\/a>/g)];const found=links.find(m=>m[2]===email);assert.ok(found,'Expected a captured local recovery email');return new URLSearchParams(new URL(found[1].replaceAll('&amp;','&')).hash.slice(1)).get('token_hash');}
for(const role of ['Parent','Student']){
 const account=credentials.accounts.find(a=>a.role===role);
 if(account.passwordChanged){console.log(`${role}: skipped because the user changed this dummy password.`);continue;}
 const beforeLogin=await signIn(account.email,credentials.password);assert.equal(beforeLogin.location,'/portal');const before=await data(beforeLogin.cookie);
 const token=await getToken(account.email),newPassword='Recovery-test!'+randomBytes(12).toString('hex');let changed=false;
 try{
  const body={token_hash:token,password:newPassword,confirm_password:newPassword};const reset=await post('/api/auth/reset-password',body);assert.equal(reset.status,200,JSON.stringify(reset.body));changed=true;
  const oldSession=await fetch(origin+'/api/me',{headers:{Cookie:beforeLogin.cookie}});assert.equal(oldSession.status,401,'Reset should revoke the old local session');
  assert.equal((await signIn(account.email,credentials.password)).location,'/local-login?error=invalid');
  const after=await data((await signIn(account.email,newPassword)).cookie);assert.equal(after.user.id,before.user.id);assert.equal(after.user.role,role);assert.deepEqual(after.students.map(s=>s.id).sort(),before.students.map(s=>s.id).sort());
  assert.equal((await post('/api/auth/reset-password',body)).status,400,'A reset token must not be reusable');
  console.log(`${role}: password updated, old password/session rejected, linked profiles preserved, replay rejected.`);
 }finally{
  if(changed){const restoreToken=await getToken(account.email);const restore=await post('/api/auth/reset-password',{token_hash:restoreToken,password:credentials.password,confirm_password:credentials.password});assert.equal(restore.status,200,'Restore the initial dummy password through verified recovery');assert.equal((await signIn(account.email,credentials.password)).location,'/portal');}
 }
}
console.log('Local password recovery smoke checks passed. Initial dummy passwords were restored; no real email was sent.');
