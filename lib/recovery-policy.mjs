import { z } from 'zod';
export const RECOVERY_EXPIRY_MS = 15 * 60 * 1000;
export const RECOVERY_MESSAGE = 'If an eligible account exists for that email, a password reset link will be sent. Check your inbox and spam folder.';
export const RECOVERY_INVALID = 'This reset link is invalid, expired or has already been used. Request a new link.';
export const recoveryEmailSchema = z.object({email:z.string().trim().email('Enter a valid email address').max(254).transform(v=>v.toLowerCase())}).strict();
export const resetPasswordSchema = z.object({
 token_hash:z.string().regex(/^[a-zA-Z0-9_-]{32,256}$/,RECOVERY_INVALID),
 password:z.string().min(12,'Use at least 12 characters').max(128,'Use no more than 128 characters'),
 confirm_password:z.string(),
}).strict().refine(v=>v.password===v.confirm_password,{message:'The passwords do not match',path:['confirm_password']});
