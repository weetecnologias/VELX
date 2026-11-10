import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { recoveryEmailSchema,resetPasswordSchema,RECOVERY_MESSAGE,RECOVERY_INVALID } from './recovery-policy.mjs';

export type RecoveryEnv = {AUTH_RECOVERY_PROVIDER?:string;SUPABASE_URL?:string;SUPABASE_PUBLISHABLE_KEY?:string;APP_PUBLIC_URL?:string};
export type RecoveryProvider = {request(email:string):Promise<void>;complete(token:string,password:string):Promise<{email:string|null}>};
type Options = {env:RecoveryEnv;db?:D1Database;provider?:RecoveryProvider;fetcher?:typeof fetch};
class RecoveryError extends Error {constructor(public status:number,message:string){super(message);}}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(n=>n.toString(16).padStart(2,'0')).join('');

export function recoveryConfigured(env:RecoveryEnv) {
 if(env.AUTH_RECOVERY_PROVIDER!=='supabase'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY||!env.APP_PUBLIC_URL)return false;
 try{return new URL(env.SUPABASE_URL).protocol==='https:'&&new URL(env.APP_PUBLIC_URL).protocol==='https:';}catch{return false;}
}

/** Each request gets its own provider client. No service-role key or browser session is exposed. */
export function supabaseRecoveryProvider(env:RecoveryEnv,fetcher:typeof fetch=fetch):RecoveryProvider {
 if(!recoveryConfigured(env))throw new RecoveryError(503,'Email password recovery is not configured.');
 const client=createClient(env.SUPABASE_URL!,env.SUPABASE_PUBLISHABLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:fetcher},
 });
 return {
  async request(email){
   const redirectTo=new URL('/reset-password',env.APP_PUBLIC_URL!).toString();
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo});
   if(error){
    // Do not disclose whether an email has an account or whether that account is throttled.
    if(error.status&&[400,422,429].includes(error.status))return;
    throw new RecoveryError(503,'Password reset email could not be requested. Please try again later.');
   }
  },
  async complete(token,password){
   // Only a recovery-purpose OTP can authorise a password update; a client role/user ID cannot.
   const verified=await client.auth.verifyOtp({token_hash:token,type:'recovery'});
   if(verified.error||!verified.data.user||!verified.data.session)throw new RecoveryError(400,RECOVERY_INVALID);
   const updated=await client.auth.updateUser({password});
   if(updated.error)throw new RecoveryError(400,'Unable to set that password. Request a new reset link and try a different password.');
   const email=updated.data.user.email??null;
   // Revoke provider refresh sessions. Existing access JWTs follow the provider's expiry rules.
   await client.auth.signOut({scope:'global'});
   return {email};
  }
 };
}

export async function passwordRecovery(request:Request,{env,db,provider,fetcher}:Options) {
 const path=new URL(request.url).pathname;
 const available=recoveryConfigured(env);
 if(path==='/api/auth/recovery'&&request.method==='GET')return json({available,delivery:available?'email':null,signInUrl:'/portal',minimumPasswordLength:12,message:available?null:'Email/password recovery is not configured here. Current hosted sign-in is managed by its identity provider.'});
 try {
  if(!['/api/auth/recovery','/api/auth/reset-password'].includes(path))return json({error:'Endpoint not found'},404);
  if(request.method!=='POST')return json({error:'Use POST'},405);
  const url=new URL(request.url);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'A same-origin request is required'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Send application/json'},415);
  const raw=await request.text();if(raw.length>4096)return json({error:'Request is too large'},413);
  let input:unknown;try{input=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
  const parsed=path==='/api/auth/recovery'?recoveryEmailSchema.parse(input):resetPasswordSchema.parse(input);
  if(!available)return json({error:'Email password recovery is not configured. Contact the academy administrator.'},503);
  if(!db)return json({error:'Password recovery is temporarily unavailable'},503);
  const throttle=async(key:string,limit:number)=>{
   const now=Date.now(),bucket=Math.floor(now/900000),digest=await hash(`password-recovery:${key}:${bucket}`);
   const row=await db.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(digest,now+1800000).first<{count:number}>();
   await db.prepare('DELETE FROM rate_limits WHERE expires < ?').bind(now).run();return (row?.count??0)<=limit;
  };
  const ip=request.headers.get('cf-connecting-ip')??'unavailable';
  if(!await throttle(`ip:${ip}`,10))return json({error:'Too many requests. Please try again in 15 minutes.'},429);
  const auth=provider??supabaseRecoveryProvider(env,fetcher);
  if('email' in parsed){
   if(await throttle(`email:${parsed.email}`,3))await auth.request(parsed.email);
   return json({message:RECOVERY_MESSAGE},202);
  }
  const result=await auth.complete(parsed.token_hash,parsed.password);
  // Recovery changes credentials at the provider, never academy roles or student relationships.
  if(result.email)await db.prepare("INSERT INTO audit_logs(id,user_id,action,entity_id,detail) SELECT ?,id,'account.password-reset',id,'Password updated through verified recovery' FROM users WHERE email=?").bind(crypto.randomUUID(),result.email.toLowerCase()).run();
  return json({ok:true,message:'Your password has been updated. Sign in with your new password.'});
 }catch(error){
  if(error instanceof z.ZodError)return json({error:error.issues.map(i=>i.message).join('; ')},400);
  if(error instanceof RecoveryError)return json({error:error.message},error.status);
  // Tokens, new passwords, provider responses and private email addresses must not enter logs.
  console.error('Password recovery request failed');return json({error:'Password recovery is temporarily unavailable. Please try again later.'},503);
 }
}
