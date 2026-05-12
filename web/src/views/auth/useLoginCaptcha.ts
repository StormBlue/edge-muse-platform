import { computed, nextTick, onBeforeUnmount, ref, type Ref } from "vue";
import { apiFetch } from "@/api/client";
import type { LoginCaptchaProof } from "@/stores/auth";

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TENCENT_CAPTCHA_SCRIPT_ID = "tencent-captcha-script";
const CAPTCHA_LOAD_TIMEOUT_MS = 10_000;

type CaptchaProvider = "tencent" | "turnstile" | "disabled";
type PublicCaptchaConfig =
  | {
      provider: "tencent";
      region: "domestic" | "overseas";
      appId: string;
    }
  | {
      provider: "turnstile";
      region: "domestic" | "overseas";
      siteKey: string;
    }
  | {
      provider: "disabled";
      region: "domestic" | "overseas";
    };

type CaptchaStatus =
  | "idle"
  | "loading"
  | "ready"
  | "verified"
  | "expired"
  | "timeout"
  | "error"
  | "unsupported"
  | "disabled";

type UseLoginCaptchaOptions = {
  locale: Ref<string>;
  loading: Ref<boolean>;
};

export function useLoginCaptcha(options: UseLoginCaptchaOptions) {
  const captchaConfig = ref<PublicCaptchaConfig | null>(null);
  const captchaProof = ref<LoginCaptchaProof | null>(null);
  const turnstileEl = ref<HTMLElement | null>(null);
  const turnstileWidgetId = ref<string | null>(null);
  const tencentCaptcha = ref<InstanceType<NonNullable<typeof window.TencentCaptcha>> | null>(null);
  const captchaStatus = ref<CaptchaStatus>("idle");
  const captchaErrorCode = ref<string | null>(null);

  const activeCaptchaProvider = computed<CaptchaProvider>(
    () => captchaConfig.value?.provider ?? "disabled"
  );
  const hasCaptchaProblem = computed(() =>
    ["expired", "timeout", "error", "unsupported"].includes(captchaStatus.value)
  );
  const showCaptchaPanel = computed(
    () =>
      activeCaptchaProvider.value !== "disabled" ||
      captchaStatus.value === "loading" ||
      hasCaptchaProblem.value
  );
  const canRetryCaptcha = computed(
    () =>
      !options.loading.value &&
      (activeCaptchaProvider.value !== "disabled" || captchaStatus.value === "error") &&
      hasCaptchaProblem.value
  );
  const isCaptchaReadyForSubmit = computed(
    () =>
      captchaStatus.value !== "error" &&
      (activeCaptchaProvider.value === "disabled"
        ? captchaProof.value?.provider === "disabled"
        : Boolean(captchaProof.value))
  );

  async function initCaptcha() {
    captchaProof.value = null;
    if (turnstileWidgetId.value && window.turnstile) {
      window.turnstile.remove(turnstileWidgetId.value);
    }
    turnstileWidgetId.value = null;
    tencentCaptcha.value?.destroy?.();
    tencentCaptcha.value = null;
    setCaptchaStatus("loading");
    try {
      const config = await apiFetch<{
        captcha?: PublicCaptchaConfig;
        turnstileSiteKey?: string | null;
      }>("/config");
      captchaConfig.value =
        config.captcha ??
        (config.turnstileSiteKey
          ? { provider: "turnstile", region: "overseas", siteKey: config.turnstileSiteKey }
          : { provider: "disabled", region: "overseas" });
      if (captchaConfig.value.provider === "disabled") {
        captchaProof.value = { provider: "disabled" };
        setCaptchaStatus("disabled");
        return;
      }
      if (captchaConfig.value.provider === "tencent") {
        await withTimeout(
          loadTencentCaptchaScript(),
          CAPTCHA_LOAD_TIMEOUT_MS,
          new Error("Tencent captcha script timed out")
        );
        await nextTick();
        renderTencentCaptcha();
        return;
      }
      await withTimeout(
        loadTurnstileScript(),
        CAPTCHA_LOAD_TIMEOUT_MS,
        new Error("Turnstile script timed out")
      );
      await nextTick();
      renderTurnstile();
    } catch {
      captchaProof.value = null;
      setCaptchaStatus("error");
    }
  }

  function resetCaptcha() {
    if (activeCaptchaProvider.value === "disabled") return;
    captchaProof.value = null;
    setCaptchaStatus("ready");
    if (
      activeCaptchaProvider.value === "turnstile" &&
      turnstileWidgetId.value &&
      window.turnstile
    ) {
      window.turnstile.reset(turnstileWidgetId.value);
    }
  }

  async function retryCaptcha() {
    captchaProof.value = null;
    captchaErrorCode.value = null;
    if (activeCaptchaProvider.value === "tencent") {
      renderTencentCaptcha();
      return;
    }
    if (turnstileWidgetId.value && window.turnstile) {
      setCaptchaStatus("ready");
      window.turnstile.reset(turnstileWidgetId.value);
      return;
    }
    turnstileWidgetId.value = null;
    await initCaptcha();
  }

  function openTencentCaptcha() {
    if (options.loading.value) return;
    if (!tencentCaptcha.value) {
      renderTencentCaptcha();
    }
    tencentCaptcha.value?.show();
  }

  function handleCaptchaLoginError(message?: string) {
    if (!message?.includes("Captcha")) return false;
    captchaProof.value = null;
    setCaptchaStatus("ready");
    if (
      activeCaptchaProvider.value === "turnstile" &&
      turnstileWidgetId.value &&
      window.turnstile
    ) {
      window.turnstile.reset(turnstileWidgetId.value);
    }
    return true;
  }

  onBeforeUnmount(() => {
    if (turnstileWidgetId.value && window.turnstile) {
      window.turnstile.remove(turnstileWidgetId.value);
    }
    tencentCaptcha.value?.destroy?.();
  });

  function renderTencentCaptcha() {
    if (!window.TencentCaptcha || captchaConfig.value?.provider !== "tencent") return;
    tencentCaptcha.value?.destroy?.();
    tencentCaptcha.value = new window.TencentCaptcha(
      captchaConfig.value.appId,
      (response) => {
        if (response.ret === 0 && response.ticket && response.randstr) {
          captchaProof.value = {
            provider: "tencent",
            ticket: response.ticket,
            randstr: response.randstr
          };
          setCaptchaStatus("verified");
          return;
        }
        captchaProof.value = null;
        setCaptchaStatus(response.ret === 2 ? "ready" : "error", response.errorCode);
      },
      { needFeedBack: false }
    );
    setCaptchaStatus("ready");
  }

  function renderTurnstile() {
    if (
      !turnstileEl.value ||
      !window.turnstile ||
      captchaConfig.value?.provider !== "turnstile" ||
      turnstileWidgetId.value
    ) {
      return;
    }
    turnstileWidgetId.value = window.turnstile.render(turnstileEl.value, {
      sitekey: captchaConfig.value.siteKey,
      action: "login",
      language: options.locale.value,
      size: "flexible",
      theme: "auto",
      retry: "auto",
      "refresh-expired": "auto",
      "refresh-timeout": "auto",
      "response-field": false,
      callback: (token) => {
        captchaProof.value = { provider: "turnstile", token };
        setCaptchaStatus("verified");
      },
      "expired-callback": () => {
        captchaProof.value = null;
        setCaptchaStatus("expired");
      },
      "error-callback": (errorCode) => {
        captchaProof.value = null;
        setCaptchaStatus("error", errorCode);
      },
      "timeout-callback": () => {
        captchaProof.value = null;
        setCaptchaStatus("timeout");
      },
      "unsupported-callback": () => {
        captchaProof.value = null;
        setCaptchaStatus("unsupported");
      }
    });
    setCaptchaStatus("ready");
  }

  function setCaptchaStatus(status: CaptchaStatus, errorCode?: string) {
    captchaStatus.value = status;
    captchaErrorCode.value = errorCode ?? null;
  }

  return {
    activeCaptchaProvider,
    canRetryCaptcha,
    captchaErrorCode,
    captchaProof,
    captchaStatus,
    hasCaptchaProblem,
    initCaptcha,
    isCaptchaReadyForSubmit,
    openTencentCaptcha,
    resetCaptcha,
    retryCaptcha,
    showCaptchaPanel,
    turnstileEl,
    handleCaptchaLoginError
  };
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile script failed")), {
        once: true
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile script failed")), {
      once: true
    });
    document.head.appendChild(script);
  });
}

function loadTencentCaptchaScript(): Promise<void> {
  if (window.TencentCaptcha) return Promise.resolve();
  const existing = document.getElementById(TENCENT_CAPTCHA_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Tencent captcha script failed")), {
        once: true
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = TENCENT_CAPTCHA_SCRIPT_ID;
    script.src = "https://turing.captcha.qcloud.com/TJCaptcha.js";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Tencent captcha script failed")), {
      once: true
    });
    document.head.appendChild(script);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, error: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(error), ms);
    promise.then(resolve, reject).finally(() => {
      window.clearTimeout(timeoutId);
    });
  });
}
