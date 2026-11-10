import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { academy } from '../../../lib/academy';
import { passwordRecovery } from '../../../lib/password-recovery';
export const dynamic = 'force-dynamic';
async function handle(request:Request) {
 if(new URL(request.url).pathname.startsWith('/api/auth/'))return passwordRecovery(request,{env,db:env.DB});
 if(!env.DB)return Response.json({error:'Academy database is unavailable'},{status:503});
 const user=await getChatGPTUser();
 return academy(request,{db:env.DB,bucket:env.BUCKET,bootstrapEmail:env.BOOTSTRAP_ADMIN_EMAIL,identity:user?{id:user.userId,email:user.email,name:user.displayName}:null});
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
