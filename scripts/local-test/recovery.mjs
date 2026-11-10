import {createHash,randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {RECOVERY_EXPIRY_MS,RECOVERY_INVALID} from '../../lib/recovery-policy.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
function read(path,fallback){return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):fallback;}
export function atomicJSON(path,value){const temp=path+'.new';writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});renameSync(temp,path);}

/** Only the loopback test server constructs this store. No real messages leave the machine. */
export function createLocalRecovery({accounts,hashPassword,invalidateSessions,now=()=>Date.now(),stateDirectory,onPasswordChanged=()=>{}}){
 const tokenFile=stateDirectory?resolve(stateDirectory,'recovery-tokens.json'):null;
 const inboxFile=stateDirectory?resolve(stateDirectory,'mailbox.json'):null;
 let tokens=tokenFile?read(tokenFile,{}):{},mailbox=inboxFile?read(inboxFile,[]):[];
 const save=()=>{if(tokenFile)atomicJSON(tokenFile,tokens);if(inboxFile)atomicJSON(inboxFile,mailbox);};
 const prune=()=>{for(const key of Object.keys(tokens))if(tokens[key].expires<=now())delete tokens[key];mailbox=mailbox.filter(m=>m.expires>now());};
 return {
  request(email,origin){
   prune();const account=accounts.find(a=>a.email===email),token=randomBytes(32).toString('hex');
   // Generate/hash for both known and unknown emails; the response remains identical.
   const tokenHash=digest(token);
   if(account){
    for(const [key,value] of Object.entries(tokens))if(value.email===email)delete tokens[key];
    mailbox=mailbox.filter(m=>m.to!==email);
    tokens[tokenHash]={email,expires:now()+RECOVERY_EXPIRY_MS};
    mailbox.unshift({id:randomBytes(12).toString('hex'),to:email,subject:'VELX — Reset your password',created:now(),expires:now()+RECOVERY_EXPIRY_MS,link:`${origin}/reset-password#token_hash=${token}&type=recovery`});
   }
   save();
  },
  complete(token,password){
   prune();const tokenHash=digest(token),record=tokens[tokenHash],account=record?accounts.find(a=>a.email===record.email):null;
   if(!record||!account)throw new Error(RECOVERY_INVALID);
   // Password policy is checked by the caller before consuming the token.
   const passwordHash=hashPassword(password),old={salt:account.salt,hash:account.hash};
   Object.assign(account,passwordHash);
   try{onPasswordChanged(account);}catch(error){Object.assign(account,old);throw error;}
   for(const [key,value] of Object.entries(tokens))if(value.email===account.email)delete tokens[key];
   mailbox=mailbox.filter(m=>m.to!==account.email);
   invalidateSessions(account.platformId);save();return {email:account.email};
  },
  messages(){prune();return mailbox.map(m=>({...m}));},
 };
}
