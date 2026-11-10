'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Mail,LockKeyhole} from 'lucide-react';
import {localTestMode} from '../lib/local-test-mode';
import {resetPasswordSchema} from '../lib/recovery-policy.mjs';
type Configuration={available:boolean;delivery:string|null;signInUrl:string;minimumPasswordLength:number;message?:string};
export function PasswordRecovery({reset=false}:{reset?:boolean}){
 const [config,setConfig]=useState<Configuration|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[complete,setComplete]=useState(false),[token,setToken]=useState(''),[showPassword,setShowPassword]=useState(false);
 const fragmentRead=useRef(false);
 useEffect(()=>{
  // Keep reset credentials out of access logs, referrers, browser history and persistent storage.
  if(reset&&!fragmentRead.current){fragmentRead.current=true;const fragment=new URLSearchParams(window.location.hash.slice(1));if(fragment.get('type')==='recovery')setToken(fragment.get('token_hash')??'');window.history.replaceState(null,'',window.location.pathname);}
  fetch('/api/auth/recovery',{cache:'no-store'}).then(async r=>{const v:any=await r.json();if(!r.ok)throw Error(v.error);setConfig(v);}).catch(()=>setError('Unable to load password recovery. Please try again.'));
 },[reset]);
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setBusy(true);
  const form=e.currentTarget,fields=new FormData(form);
  try{
   const body=reset?resetPasswordSchema.parse({token_hash:token,password:fields.get('password'),confirm_password:fields.get('confirm_password')}):{email:fields.get('email')};
   const r=await fetch(reset?'/api/auth/reset-password':'/api/auth/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const v:any=await r.json();if(!r.ok)throw Error(v.error||'Unable to complete this request');
   form.reset();setToken('');setComplete(true);
  }catch(e){const issue=e as {issues?:{message:string}[];message?:string};setError(issue.issues?.map(i=>i.message).join('; ')??issue.message??'Please try again.');}
  finally{setBusy(false);}
 }
 const signIn=config?.signInUrl??(localTestMode?'/local-login':'/portal');
 return <main className="recovery-shell"><section className="recovery-panel"><a href="/"><img className="recovery-logo" src="/velx-logo.png" alt="VELX Academy"/></a>{localTestMode&&<p className="recovery-test-label">LOCAL TEST · NO REAL EMAILS SENT</p>}<span className="recovery-icon">{complete?<Check/>:reset?<LockKeyhole/>:<Mail/>}</span><p className="eyebrow">YOUR ACADEMY ACCOUNT</p><h1>{complete?(reset?'Password updated.':'Check your inbox.'):(reset?'Choose a new password.':'Forgot your password?')}</h1>
 {complete?<><p>{reset?'Your password is saved. Sign in again with your new password. Your role and linked student records stay the same.':'If an eligible account exists for that email, a reset link will be sent. Check your inbox and spam folder. You do not need to share your password with academy staff.'}</p>{localTestMode&&!reset&&<div className="notice">For this local test, open the test email inbox to find the reset link.<a className="recovery-inbox-link" href="/local-inbox">Open local test inbox →</a></div>}{!reset&&<button className="link-button" onClick={()=>setComplete(false)}>Use a different email</button>}<a className="btn dark" href={signIn}>Back to sign in <ArrowRight size={17}/></a></>:!config?<p role="status">{error||'Loading secure recovery…'}</p>:!config.available?<><p>{config.message||'Email/password recovery is not configured here. Contact the academy administrator.'}</p><a className="btn dark" href={signIn}>Go to sign in <ArrowRight size={17}/></a></>:reset&&!token?<><p className="error" role="alert">This page needs a valid password reset link. Links can expire or be used only once.</p><a className="btn" href="/forgot-password">Request a new link <ArrowRight size={17}/></a></>:<><p>{reset?'Use at least 12 characters. Choose a password you do not use on other websites.':'Enter your registered email address and we’ll help you reset your password.'}</p><form className="panel-form" onSubmit={submit}>{reset?<><label>New password<input name="password" type={showPassword?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128} required/></label><label>Confirm new password<input name="confirm_password" type={showPassword?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128} required/></label><label className="check-label"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/><span>Show passwords</span></label></>:<label>Registered email<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>}{error&&<p className="error" role="alert">{error}</p>}<button className="btn" disabled={busy}>{busy?(reset?'Updating password…':'Requesting link…'):(reset?'Save new password':'Send reset link')}<ArrowRight size={17}/></button></form><p className="recovery-small">{reset?'Your account permissions and student links will remain unchanged.':'For your privacy, the response does not reveal whether an email has an account.'}</p><a className="recovery-back" href={signIn}><ArrowLeft size={14}/> Back to sign in</a></>}
 </section></main>;
}
