declare namespace Cloudflare {
  interface Env {
    ENVIRONMENT: string;
    AI: Ai;
    AI_GATEWAY_ID?: string;
    AI_GATEWAY_URL?: string;
    PROMPT_ASSISTANT_ENABLED?: string;
    PROMPT_ASSISTANT_MODEL?: string;
    ASSETS_PUBLIC_BASE_URL?: string;
    ASSETS_R2: R2Bucket;
    TURNSTILE_SITE_KEY?: string;
    ALERT_EMAIL?: string;
    JWT_SECRET: string;
    KEY_ENCRYPTION_KEY: string;
    TURNSTILE_SECRET_KEY: string;
    RESEND_API_KEY?: string;
  }
}
