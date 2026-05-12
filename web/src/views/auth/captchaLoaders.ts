const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TENCENT_CAPTCHA_SCRIPT_ID = "tencent-captcha-script";

export async function loadAltchaWidget() {
  await import("altcha");
  await import("altcha/i18n/zh-cn");
}

export function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return waitForScript(existing, "Turnstile script failed");
  }
  return appendScript({
    id: TURNSTILE_SCRIPT_ID,
    src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    errorMessage: "Turnstile script failed"
  });
}

export function loadTencentCaptchaScript(): Promise<void> {
  if (window.TencentCaptcha) return Promise.resolve();
  const existing = document.getElementById(TENCENT_CAPTCHA_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return waitForScript(existing, "Tencent captcha script failed");
  }
  return appendScript({
    id: TENCENT_CAPTCHA_SCRIPT_ID,
    src: "https://turing.captcha.qcloud.com/TJCaptcha.js",
    errorMessage: "Tencent captcha script failed"
  });
}

export function withTimeout<T>(promise: Promise<T>, ms: number, error: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(error), ms);
    promise.then(resolve, reject).finally(() => {
      window.clearTimeout(timeoutId);
    });
  });
}

function appendScript(options: { id: string; src: string; errorMessage: string }) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = options.id;
    script.src = options.src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(options.errorMessage)), {
      once: true
    });
    document.head.appendChild(script);
  });
}

function waitForScript(script: HTMLScriptElement, errorMessage: string) {
  return new Promise<void>((resolve, reject) => {
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(errorMessage)), {
      once: true
    });
  });
}
