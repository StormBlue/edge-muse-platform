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
    CAPTCHA_DOMESTIC_PROVIDER?: string;
    CAPTCHA_OVERSEAS_PROVIDER?: string;
    ALTCHA_DEFAULT_DIFFICULTY?: string;
    ALTCHA_HMAC_KEY?: string;
    TENCENT_CAPTCHA_APP_ID?: string;
    TENCENT_CAPTCHA_APP_SECRET_KEY?: string;
    TENCENTCLOUD_SECRET_ID?: string;
    TENCENTCLOUD_SECRET_KEY?: string;
    TENCENTCLOUD_CAPTCHA_REGION?: string;
    ALERT_EMAIL?: string;
    JWT_SECRET: string;
    KEY_ENCRYPTION_KEY: string;
    TURNSTILE_SECRET_KEY: string;
    RESEND_API_KEY?: string;
  }
}
