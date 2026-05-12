import { computed, nextTick, onBeforeUnmount, ref, type Ref } from "vue";
import { apiFetch } from "@/api/client";
import type { LoginCaptchaProof } from "@/stores/auth";
import {
  loadAltchaWidget,
  loadTencentCaptchaScript,
  loadTurnstileScript,
  withTimeout
} from "./captchaLoaders";

const CAPTCHA_LOAD_TIMEOUT_MS = 10_000;

type CaptchaProvider = "tencent" | "turnstile" | "altcha" | "disabled";
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
      provider: "altcha";
      region: "domestic" | "overseas";
      challengeUrl: string;
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
  const altchaEl = ref<AltchaWidgetElement | null>(null);
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
      if (captchaConfig.value.provider === "altcha") {
        await withTimeout(
          loadAltchaWidget(),
          CAPTCHA_LOAD_TIMEOUT_MS,
          new Error("ALTCHA widget timed out")
        );
        await nextTick();
        await renderAltcha();
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
    if (activeCaptchaProvider.value === "altcha") {
      altchaEl.value?.reset?.();
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
    if (activeCaptchaProvider.value === "altcha") {
      setCaptchaStatus("ready");
      altchaEl.value?.reset?.();
      await altchaEl.value?.verify?.();
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
    if (activeCaptchaProvider.value === "altcha") {
      altchaEl.value?.reset?.();
    }
    return true;
  }

  onBeforeUnmount(() => {
    if (turnstileWidgetId.value && window.turnstile) {
      window.turnstile.remove(turnstileWidgetId.value);
    }
    tencentCaptcha.value?.destroy?.();
  });

  function handleAltchaStateChange(event: Event) {
    const detail = (event as AltchaStateChangeEvent).detail ?? {};
    if (detail.payload) {
      captchaProof.value = { provider: "altcha", payload: detail.payload };
    }
    if (detail.state === "verified") {
      setCaptchaStatus("verified");
      return;
    }
    if (detail.state === "verifying") {
      captchaProof.value = null;
      setCaptchaStatus("loading");
      return;
    }
    if (detail.state === "error") {
      captchaProof.value = null;
      setCaptchaStatus("error");
      return;
    }
    if (detail.state === "expired") {
      captchaProof.value = null;
      setCaptchaStatus("expired");
    }
  }

  function handleAltchaVerified(event: Event) {
    const payload = (event as AltchaVerifiedEvent).detail?.payload;
    if (payload) {
      captchaProof.value = { provider: "altcha", payload };
    }
    setCaptchaStatus("verified");
  }

  async function renderAltcha() {
    if (!altchaEl.value || captchaConfig.value?.provider !== "altcha") return;
    captchaProof.value = null;
    altchaEl.value.challenge = captchaConfig.value.challengeUrl;
    await altchaEl.value.configure?.({
      auto: "onload",
      challenge: captchaConfig.value.challengeUrl,
      display: "standard",
      hideFooter: true,
      language: altchaLanguage(options.locale.value),
      name: "altcha",
      workers: 1
    });
    setCaptchaStatus("ready");
  }

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
    altchaEl,
    handleAltchaStateChange,
    handleAltchaVerified,
    turnstileEl,
    handleCaptchaLoginError
  };
}

type AltchaWidgetElement = HTMLElement & {
  challenge?: string;
  configure?: (config: Record<string, unknown>) => Promise<void>;
  reset?: () => void;
  verify?: () => Promise<unknown>;
};

type AltchaState = "code" | "error" | "verified" | "verifying" | "unverified" | "expired";

type AltchaStateChangeEvent = CustomEvent<{
  state?: AltchaState;
  payload?: string;
}>;

type AltchaVerifiedEvent = CustomEvent<{
  payload?: string;
}>;

function altchaLanguage(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? "zh-cn" : "en";
}
