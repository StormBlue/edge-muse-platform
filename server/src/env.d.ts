declare namespace Cloudflare {
  interface Env {
    JWT_SECRET: string;
    KEY_ENCRYPTION_KEY: string;
    TURNSTILE_SECRET_KEY: string;
    RESEND_API_KEY?: string;
  }
}
