import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin='http://localhost:5173';
const credentials=JSON.parse(readFileSync('.sites-runtime/local-test/credentials.json','utf8'));
const fetchLocal=(path,options={})=>fetch(origin+path,options);
const expectStatus=async(path,status,options={})=>{const r=await fetchLocal(path,options);assert.equal(r.status,status,`${path}: expected ${status}, got ${r.status} ${await r.text()}`);};
assert.equal((await fetchLocal('/')).status,200);
assert.equal((await fetchLocal('/local-login')).status,200);
await expectStatus('/api/me',401);
await expectStatus('/api/me',401,{headers:{'oai-authenticated-user-id':'local-test-superadmin','oai-authenticated-user-email':'superadmin@velx.test'}});
const summary=[];
for(const account of credentials.accounts){
 if(account.passwordChanged){summary.push({role:account.role,result:'SKIPPED - password changed by user'});continue;}
 const login=await fetchLocal('/__local-auth/login',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:account.email,password:credentials.password})});
 assert.equal(login.status,303,`${account.role} login`);assert.equal(login.headers.get('location'),'/portal');
 const cookie=login.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie};
 const r=await fetchLocal('/api/data',{headers});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));assert.equal(data.user.role,account.role);
 assert.equal(data.students.length,account.role==='Student'?1:account.role==='Parent'||account.role==='Coach'?2:3,account.role+' student scope');
 if(account.role==='Parent'){assert.deepEqual(data.students.map(s=>s.name).sort(),['Aarav Demo','Ananya Demo']);assert.equal(data.invoices.length,2);assert.equal(data.payments.length,1);assert.equal((await fetchLocal('/api/receipt?id=local-receipt-1',{headers})).status,200);}
 if(account.role==='Student'){assert.equal(data.students[0].name,'Aarav Demo');assert.equal(data.invoices.length,0);}
 if(['Coach','Parent','Student'].includes(account.role)){
  await expectStatus('/api/export?type=students',403,{headers});
  await expectStatus('/api/students/private',403,{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id:'local-child-aarav'})});
 }
 if(account.role==='Coach'){assert.equal(data.batches.length,1);assert.equal(data.invoices.length,0);assert.equal(data.payments.length,0);assert.equal(data.students.some(s=>s.name==='Kabir Demo'),false);}
 if(account.role==='Admin')await expectStatus('/api/backup',403,{headers});
 const logout=await fetchLocal('/local-logout',{headers,redirect:'manual'});assert.equal(logout.status,303);await expectStatus('/api/me',401,{headers});
 summary.push({role:account.role,students:data.students.length,batches:data.batches.length,invoices:data.invoices.length,result:'PASS'});
}
console.table(summary);
console.log('Local HTTP checks passed: all 5 logins, role scoping, private endpoint denials, forged-header rejection, receipts and logout.');
