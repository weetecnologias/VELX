import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {recoveryEmailSchema,resetPasswordSchema,RECOVERY_MESSAGE,RECOVERY_INVALID} from '../../lib/recovery-policy.mjs';
import {createLocalRecovery,atomicJSON} from './recovery.mjs';

export const LOCAL_DATABASE_ID = '11111111-1111-4111-8111-111111111111';
export const LOCAL_STATE_PATH = '.sites-runtime/local-test/state';
const cookieName = 'velx_local_test_session';
const identityPrefix = 'oai-authenticated-user-';
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function passwordRecord(password) {const salt=randomBytes(16).toString('hex');return {salt,hash:scryptSync(password,salt,64).toString('hex')};}
export function verifyPassword(password, record) {try{const expected=Buffer.from(record.hash,'hex'),actual=scryptSync(password,record.salt,64);return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}}

function loginPage(accounts, url) {
 const selected=accounts.find(a=>a.key===url.searchParams.get('account'));
 const invalid=url.searchParams.get('error')==='invalid';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VELX | Local test login</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f3f3ef;color:#111;font:14px/1.6 Arial,sans-serif}.shell{min-height:100vh;display:grid;place-items:center;padding:30px}.panel{width:550px;max-width:100%;background:#fff;padding:40px;border-top:5px solid #d71920;box-shadow:0 15px 50px #0001}img{width:160px}h1{font-size:32px;line-height:1.1;letter-spacing:-1px}p{color:#73736f;font-size:12px}.tag{font-size:10px;color:#d71920;letter-spacing:1.5px;font-weight:bold;margin-top:28px}.accounts{display:flex;gap:7px;flex-wrap:wrap;margin:23px 0}.accounts a{background:#f4f4f2;color:#444;padding:7px 10px;font-size:11px;text-decoration:none;border:1px solid #e5e5df}.accounts a.active{border-color:#d71920;color:#d71920}label{display:block;font-size:12px;font-weight:bold;margin:18px 0 7px}input{display:block;width:100%;padding:12px;border:1px solid #ddd;font:15px Arial;margin-top:7px}input:focus{outline:2px solid #d7192030;border-color:#d71920}button{background:#d71920;color:#fff;border:0;width:100%;padding:15px;font-weight:bold;cursor:pointer;margin-top:22px}.error{background:#fff0f0;color:#b11;padding:12px}.notice{padding:13px;background:#fff5df;margin-top:22px;color:#8b6c25;font-size:11px}small{display:block;color:#888;margin-top:22px;font-size:10px}a{color:#555}.back{display:block;font-size:11px;margin-top:25px}
 </style></head><body><main class="shell"><section class="panel"><a href="/"><img src="/velx-logo.png" alt="VELX Academy"></a><p class="tag">LOCALHOST TEST ENVIRONMENT</p><h1>Choose an account.<br>Explore your portal.</h1><p>Sign in with a dummy account to test the actual academy workflows and server-side role permissions.</p><div class="accounts">${accounts.map(a=>`<a class="${selected?.key===a.key?'active':''}" href="/local-login?account=${escape(a.key)}">${escape(a.role)}</a>`).join('')}</div>${invalid?'<p class="error" role="alert">Email or password is incorrect.</p>':''}<form method="post" action="/__local-auth/login"><label>Email<input type="email" name="email" required autocomplete="username" value="${escape(selected?.email??'')}"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button type="submit">Sign in to test portal →</button></form><a class="back" href="/forgot-password">Forgot password?</a><div class="notice">Synthetic records in a separate local database. No real payment is processed and no message is sent. These accounts work only while this localhost test server is running.</div><small>To switch roles, sign out from the portal and choose a different account. Production authentication continues to use Sites/ChatGPT sign-in.</small><a class="back" href="/">← Public website</a></section></main></body></html>`;
}

/** Local test middleware. It is registered only by Vite's development server. */
export function createLocalTestMiddleware(accounts, {now=()=>Date.now(),stateDirectory,onPasswordChanged=()=>{}}={}) {
 const sessions=new Map(),attempts=new Map();
 const recovery=createLocalRecovery({accounts,hashPassword:passwordRecord,now,stateDirectory,onPasswordChanged,invalidateSessions:platformId=>{for(const [key,value] of sessions)if(value.account.platformId===platformId)sessions.delete(key);}});
 const recoveryAttempts=new Map();
 return async function localTestAuth(req,res,next) {
  // Untrusted clients cannot select a fixture identity by supplying auth headers.
  for(const name of Object.keys(req.headers))if(name.toLowerCase().startsWith(identityPrefix))delete req.headers[name];
  for(let i=req.rawHeaders.length-2;i>=0;i-=2)if(req.rawHeaders[i].toLowerCase().startsWith(identityPrefix))req.rawHeaders.splice(i,2);
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
  const send=(status,text,type='text/plain; charset=utf-8')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(text);};
  const redirect=(path,cookie)=>{res.writeHead(303,{...headers,Location:path,...(cookie?{'Set-Cookie':cookie}:{})});res.end();};
  let url;try{url=new URL(req.url??'/',`http://${req.headers.host}`);}catch{return send(400,'Invalid request');}
  const remote=req.socket.remoteAddress;
  if(!loopback.has(url.hostname)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return send(403,'Local test mode accepts loopback connections only.');
  for(const [token,session] of sessions)if(session.expires<=now())sessions.delete(token);
  const token=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const session=token?sessions.get(token):undefined;
  if(session){const a=session.account;const identity={
   'oai-authenticated-user-id':a.platformId,'oai-authenticated-user-email':a.email,
   'oai-authenticated-user-full-name':encodeURIComponent(a.name),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'
  };for(const [name,value] of Object.entries(identity)){req.headers[name]=value;req.rawHeaders.push(name,value);}}
  if(url.pathname==='/local-login'&&req.method==='GET')return send(200,loginPage(accounts,url),'text/html; charset=utf-8');
  if(url.pathname==='/local-inbox'&&req.method==='GET'){
   const messages=recovery.messages();
   return send(200,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VELX | Local test inbox</title><meta name="robots" content="noindex,nofollow"><style>body{font:14px/1.7 Arial;background:#f5f5f2;padding:30px;color:#111}main{max-width:750px;margin:auto}article{background:#fff;border-top:3px solid #d71920;padding:25px;margin:20px 0}h1{font-size:30px}a{color:#b5151b}small{color:#777}p{overflow-wrap:anywhere}</style></head><body><main><h1>Local test email inbox</h1><p>Captured test emails only. No real email is sent. This inbox exists only on the loopback test server.</p>${messages.length?messages.map(m=>`<article><small>To: ${escape(m.to)}</small><h2>${escape(m.subject)}</h2><p>Use this link to choose a new password. It expires after 15 minutes and works once.</p><p><a href="${escape(m.link)}">Reset password for ${escape(m.to)}</a></p><small>Expires ${escape(new Date(m.expires).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'}))} IST</small></article>`).join(''):'<article><p>No unexpired reset emails. Request a link from Forgot password first.</p></article>'}<a href="/forgot-password">Request a password reset</a> · <a href="/local-login">Back to sign in</a></main></body></html>`,'text/html; charset=utf-8');
  }
  if(url.pathname==='/api/auth/recovery'&&req.method==='GET')return send(200,JSON.stringify({available:true,delivery:'local-inbox',signInUrl:'/local-login',minimumPasswordLength:12}),'application/json');
  if(['/api/auth/recovery','/api/auth/reset-password'].includes(url.pathname)){
   if(req.method!=='POST')return send(405,JSON.stringify({error:'Use POST'}),'application/json');
   if(req.headers.origin!==url.origin||req.headers['sec-fetch-site']==='cross-site')return send(403,JSON.stringify({error:'A same-origin request is required'}),'application/json');
   if(!(req.headers['content-type']??'').includes('application/json'))return send(415,JSON.stringify({error:'Send application/json'}),'application/json');
   const rate=recoveryAttempts.get(remote);
   if(rate&&rate.expires>now()&&rate.count>=10)return send(429,JSON.stringify({error:'Too many requests. Please try again in 15 minutes.'}),'application/json');
   recoveryAttempts.set(remote,{count:rate&&rate.expires>now()?rate.count+1:1,expires:now()+900000});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return send(413,JSON.stringify({error:'Request is too large'}),'application/json');}
   try{
    const raw=JSON.parse(body);
    if(url.pathname==='/api/auth/recovery'){
     const value=recoveryEmailSchema.parse(raw),key='email:'+value.email,limit=recoveryAttempts.get(key);
     const count=limit&&limit.expires>now()?limit.count+1:1;recoveryAttempts.set(key,{count,expires:now()+900000});
     if(count<=3)recovery.request(value.email,url.origin);
     return send(202,JSON.stringify({message:RECOVERY_MESSAGE}),'application/json');
    }
    const value=resetPasswordSchema.parse(raw);recovery.complete(value.token_hash,value.password);
    return send(200,JSON.stringify({ok:true,message:'Your password has been updated. Sign in with your new password.'}),'application/json');
   }catch(error){
    const message=error?.issues?.map(i=>i.message).join('; ')??(error?.message===RECOVERY_INVALID?RECOVERY_INVALID:'Unable to complete this request. Please try again.');
    return send(400,JSON.stringify({error:message}),'application/json');
   }
  }
  if(url.pathname==='/local-logout'&&req.method==='GET'){
   if(req.headers['sec-fetch-site']==='cross-site')return send(403,'Cross-site sign-out rejected.');
   if(token)sessions.delete(token);return redirect('/local-login',`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  }
  if(url.pathname==='/__local-auth/login'){
   if(req.method!=='POST')return send(405,'Use POST');
   if(req.headers.origin!==url.origin||req.headers['sec-fetch-site']==='cross-site')return send(403,'Same-origin login required.');
   if(!(req.headers['content-type']??'').startsWith('application/x-www-form-urlencoded'))return send(415,'Use the login form.');
   const key=remote,rate=attempts.get(key);if(rate&&rate.expires>now()&&rate.count>=20)return send(429,'Too many attempts. Try again in one minute.');
   attempts.set(key,{count:rate&&rate.expires>now()?rate.count+1:1,expires:now()+60000});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return send(413,'Login form is too large.');}
   const form=new URLSearchParams(body),email=(form.get('email')??'').trim().toLowerCase(),password=form.get('password')??'';
   const account=accounts.find(a=>a.email===email);if(!account||!verifyPassword(password,account))return redirect('/local-login?error=invalid');
   // Rotate the session on every successful login; role selection is server-owned.
   if(token)sessions.delete(token);const value=randomBytes(32).toString('base64url');sessions.set(value,{account,expires:now()+8*60*60*1000});
   return redirect('/portal',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
  }
  if(url.pathname.startsWith('/__local-auth/'))return send(404,'Not found');
  next();
 };
}

/** @returns {import('vite').Plugin} */
export function localTestAuthPlugin() {
 return {name:'velx-local-test-auth',apply:'serve',enforce:'pre',
  configResolved(config){if(!['127.0.0.1','localhost','::1'].includes(String(config.server.host)))throw new Error('Local test sign-in requires an explicit loopback server host.');},
  configureServer(server){
   const directory=resolve(server.config.root,'.sites-runtime/local-test'),file=resolve(directory,'accounts.json');
   const accounts=JSON.parse(readFileSync(file,'utf8'));
   server.middlewares.use(createLocalTestMiddleware(accounts,{stateDirectory:directory,onPasswordChanged:account=>{
    atomicJSON(file,accounts);
    const credentialFile=resolve(directory,'credentials.json'),credentials=JSON.parse(readFileSync(credentialFile,'utf8'));
    const entry=credentials.accounts.find(a=>a.email===account.email);if(entry)entry.passwordChanged=!verifyPassword(credentials.password,account);
    atomicJSON(credentialFile,credentials);
   }}));
  }
 };
}
