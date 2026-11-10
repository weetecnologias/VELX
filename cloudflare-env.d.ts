declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    AUTH_RECOVERY_PROVIDER?: string;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    APP_PUBLIC_URL?: string;
  }
}
