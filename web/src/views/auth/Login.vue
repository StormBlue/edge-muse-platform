<script setup lang="ts">
/**
 * 登录页：
 * - 先 GET `/api/config` 读登录验证码 provider；disabled 时直接可登录（开发/内网场景）。
 * - 腾讯验证码由前端脚本回调 ticket/randstr，Turnstile 回调 token，均随登录请求带给后端二次校验。
 * - 成功：尊重 redirect；无 redirect 时 sysadmin 进系统看板，其它角色进图像生成。
 * - 顶栏语言切换走 `ui.setLocale`，与全站 i18n 一致。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-vue-next";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/api/client";
import { useAuthStore, type LoginCaptchaProof } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

/** 防重复插入官方 challenge 脚本 */
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

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const email = ref("");
const password = ref("");
const loading = ref(false);
const captchaConfig = ref<PublicCaptchaConfig | null>(null);
/** 由验证码 callback 写入，随登录请求提交 */
const captchaProof = ref<LoginCaptchaProof | null>(null);
const turnstileEl = ref<HTMLElement | null>(null);
/** `render` 返回值，供 reset/remove */
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
  () => activeCaptchaProvider.value !== "disabled" && !loading.value && hasCaptchaProblem.value
);
const canSubmit = computed(
  () =>
    !loading.value && (activeCaptchaProvider.value === "disabled" || Boolean(captchaProof.value))
);
const submitLabel = computed(() => {
  if (loading.value) return t("common.loginLoading");
  if (activeCaptchaProvider.value !== "disabled" && !captchaProof.value) {
    return t("auth.captchaWaitingAction");
  }
  return t("common.login");
});
const captchaTitle = computed(() => t(`auth.captchaStatus.${captchaStatus.value}.title`));
const captchaDescription = computed(() =>
  t(`auth.captchaStatus.${captchaStatus.value}.description`)
);

async function submit() {
  if (!canSubmit.value) return;
  loading.value = true;
  let shouldResetCaptcha = true;
  try {
    await auth.login(email.value, password.value, captchaProof.value || undefined);
    await router.push(typeof route.query.redirect === "string" ? route.query.redirect : homePath());
  } catch (error) {
    shouldResetCaptcha = !handleLoginError(error);
    const message =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : t("auth.loginFailed");
    toast.error(message.includes("Captcha") ? t("auth.captchaVerifyFailed") : message);
  } finally {
    loading.value = false;
    if (shouldResetCaptcha) resetCaptcha();
  }
}

function homePath() {
  return auth.isSysadmin ? "/sysadmin/dashboard" : "/workspace";
}

/** 拉配置 → 按需插脚本 → nextTick 后 render 一次，防重复用 widget id 判断 */
async function initCaptcha() {
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
    setCaptchaStatus("error");
  }
}

/** 若脚本已在别页插入则监听 load；否则创建并挂 head */
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

/** 腾讯云官方前端脚本；回调返回 ticket/randstr，服务端再调 DescribeCaptchaResult。 */
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
    language: ui.locale,
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

/** 登录失败或过期时清空 token 并 reset 组件，促使用户重新点选 */
function resetCaptcha() {
  if (activeCaptchaProvider.value === "disabled") return;
  captchaProof.value = null;
  setCaptchaStatus("ready");
  if (activeCaptchaProvider.value === "turnstile" && turnstileWidgetId.value && window.turnstile) {
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
  if (loading.value) return;
  if (!tencentCaptcha.value) {
    renderTencentCaptcha();
  }
  tencentCaptcha.value?.show();
}

function setCaptchaStatus(status: CaptchaStatus, errorCode?: string) {
  captchaStatus.value = status;
  captchaErrorCode.value = errorCode ?? null;
}

function handleLoginError(error: unknown) {
  const message =
    error && typeof error === "object" && "error" in error
      ? (error as { error: { message?: string } }).error.message
      : undefined;
  if (message?.includes("Captcha")) {
    setCaptchaStatus("error");
    return true;
  }
  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number, error: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(error), ms);
    promise.then(resolve, reject).finally(() => {
      window.clearTimeout(timeoutId);
    });
  });
}

onMounted(() => {
  initCaptcha();
});

onBeforeUnmount(() => {
  if (turnstileWidgetId.value && window.turnstile) {
    window.turnstile.remove(turnstileWidgetId.value);
  }
  tencentCaptcha.value?.destroy?.();
});
</script>

<template>
  <ScrollArea class="h-dvh">
    <main class="login-page grid min-h-dvh">
      <section class="login-showcase hidden min-h-0 flex-col justify-between p-8 lg:flex">
        <div class="flex items-center gap-3">
          <BrandMark class="size-11 shrink-0" />
          <div>
            <p class="text-lg font-semibold">Edge Muse</p>
            <p class="text-sm text-muted-foreground">{{ t("auth.platformSubtitle") }}</p>
          </div>
        </div>
        <div class="max-w-xl">
          <h1 class="text-4xl font-semibold leading-tight">{{ t("common.appName") }}</h1>
          <p class="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            {{ t("shell.tagline") }}
          </p>
          <div class="mt-8 grid grid-cols-3 gap-3">
            <div class="login-feature-card">{{ t("nav.aiImage") }}</div>
            <div class="login-feature-card">{{ t("aiImage.assistantTitle") }}</div>
            <div class="login-feature-card">{{ t("nav.history") }}</div>
          </div>
        </div>
      </section>

      <section class="flex min-h-dvh items-center justify-center px-5 py-10">
        <div class="w-full max-w-sm">
          <div class="mb-6 flex flex-wrap items-center justify-between gap-3 lg:justify-end">
            <div class="flex min-w-0 items-center gap-3 lg:hidden">
              <BrandMark class="size-10 shrink-0" />
              <div class="min-w-0">
                <h1 class="text-xl font-semibold">Edge Muse</h1>
                <p class="text-sm text-muted-foreground">{{ t("auth.platformSubtitle") }}</p>
              </div>
            </div>
            <select
              class="ui-field h-9 !w-28 shrink-0 px-2 text-sm"
              :value="ui.locale"
              @change="ui.setLocale(($event.target as HTMLSelectElement).value)"
            >
              <option value="zh-CN">中文</option>
              <option value="en-US">EN</option>
            </select>
          </div>
          <form class="panel login-card space-y-4 p-5" @submit.prevent="submit">
            <div>
              <p class="text-lg font-semibold">{{ t("common.login") }}</p>
              <p class="mt-1 text-sm text-muted-foreground">{{ t("auth.platformSubtitle") }}</p>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">{{ t("auth.loginIdentifier") }}</label>
              <input
                v-model="email"
                class="ui-field h-11 px-3"
                type="text"
                autocomplete="username"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">{{ t("auth.password") }}</label>
              <input
                v-model="password"
                class="ui-field h-11 px-3"
                type="password"
                autocomplete="current-password"
              />
            </div>
            <div
              v-if="showCaptchaPanel"
              class="captcha-panel"
              :class="{
                'captcha-panel--verified': captchaStatus === 'verified',
                'captcha-panel--problem': hasCaptchaProblem
              }"
              aria-live="polite"
            >
              <div class="flex items-start gap-3">
                <div
                  class="captcha-state-icon"
                  :class="{
                    'captcha-state-icon--verified': captchaStatus === 'verified',
                    'captcha-state-icon--problem': hasCaptchaProblem
                  }"
                >
                  <Loader2 v-if="captchaStatus === 'loading'" class="h-4 w-4 animate-spin" />
                  <CheckCircle2 v-else-if="captchaStatus === 'verified'" class="h-4 w-4" />
                  <AlertTriangle v-else-if="hasCaptchaProblem" class="h-4 w-4" />
                  <ShieldCheck v-else class="h-4 w-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 items-center justify-between gap-3">
                    <p class="min-w-0 text-sm font-semibold">{{ captchaTitle }}</p>
                    <button
                      v-if="canRetryCaptcha"
                      class="ui-button ui-button-secondary h-8 shrink-0 px-2 text-xs"
                      type="button"
                      @click="retryCaptcha"
                    >
                      <RefreshCw class="h-3.5 w-3.5" />
                      {{ t("auth.captchaRetry") }}
                    </button>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {{ captchaDescription }}
                  </p>
                  <p v-if="captchaErrorCode" class="mt-1 text-[11px] text-muted-foreground">
                    {{ t("auth.captchaErrorCode", { code: captchaErrorCode }) }}
                  </p>
                </div>
              </div>
              <button
                v-if="activeCaptchaProvider === 'tencent' && captchaStatus !== 'verified'"
                class="ui-button ui-button-secondary mt-3 w-full"
                type="button"
                :disabled="loading || captchaStatus === 'loading'"
                @click="openTencentCaptcha"
              >
                <ShieldCheck class="h-4 w-4" />
                {{ t("auth.tencentCaptchaAction") }}
              </button>
              <div
                v-show="activeCaptchaProvider === 'turnstile' && captchaStatus !== 'unsupported'"
                ref="turnstileEl"
                class="captcha-widget mt-3"
              ></div>
            </div>
            <button class="ui-button ui-button-primary w-full" :disabled="!canSubmit" type="submit">
              <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
              {{ submitLabel }}
            </button>
          </form>
        </div>
      </section>
    </main>
  </ScrollArea>
</template>

<style scoped>
.login-page {
  grid-template-columns: minmax(0, 1fr);
  background:
    linear-gradient(
      180deg,
      color-mix(in oklch, var(--primary), transparent 93%),
      transparent 22rem
    ),
    var(--background);
}

.login-showcase {
  border-right: 1px solid color-mix(in oklch, var(--border), transparent 32%);
  background:
    linear-gradient(
      145deg,
      color-mix(in oklch, var(--primary), transparent 88%),
      transparent 36rem
    ),
    color-mix(in oklch, var(--card), transparent 18%);
}

.login-feature-card {
  border: 1px solid color-mix(in oklch, var(--border), transparent 12%);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--card), transparent 18%);
  padding: 0.875rem;
  color: var(--muted-foreground);
  font-size: 0.875rem;
  font-weight: 700;
  box-shadow: var(--shadow-panel);
}

.login-card {
  background: var(--surface-strong);
}

.captcha-panel {
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--border), transparent 10%);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--card), transparent 10%);
  padding: 0.75rem;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.captcha-panel--verified {
  border-color: color-mix(in oklch, var(--accent), transparent 42%);
  background: color-mix(in oklch, var(--accent), transparent 90%);
}

.captcha-panel--problem {
  border-color: color-mix(in oklch, var(--destructive), transparent 48%);
  background: color-mix(in oklch, var(--destructive), transparent 92%);
}

.captcha-state-icon {
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in oklch, var(--primary), transparent 88%);
  color: var(--primary);
}

.captcha-state-icon--verified {
  background: color-mix(in oklch, var(--accent), transparent 82%);
  color: color-mix(in oklch, var(--accent), var(--foreground) 30%);
}

.captcha-state-icon--problem {
  background: color-mix(in oklch, var(--destructive), transparent 84%);
  color: var(--destructive);
}

.captcha-widget {
  min-height: 65px;
}

.captcha-widget :deep(iframe) {
  max-width: 100%;
}

@media (min-width: 1024px) {
  .login-page {
    grid-template-columns: minmax(28rem, 0.95fr) minmax(24rem, 0.72fr);
  }
}
</style>
