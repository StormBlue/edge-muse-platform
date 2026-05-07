<script setup lang="ts">
/**
 * 登录页：
 * - 先 GET `/api/config` 读 `turnstileSiteKey`；无 key 则不调起人机，直接可登录（开发/内网场景）。
 * - 有 key 时异步加载 Turnstile 脚本、`render` 到占位 div，token 经 `auth.login` 带给后端 `verifyTurnstile`。
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
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

/** 防重复插入官方 challenge 脚本 */
const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TURNSTILE_LOAD_TIMEOUT_MS = 10_000;

type TurnstileStatus =
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
const turnstileSiteKey = ref<string | null>(null);
/** 由 Turnstile callback 写入，随登录请求提交 */
const turnstileToken = ref("");
const turnstileEl = ref<HTMLElement | null>(null);
/** `render` 返回值，供 reset/remove */
const turnstileWidgetId = ref<string | null>(null);
const turnstileStatus = ref<TurnstileStatus>("idle");
const turnstileErrorCode = ref<string | null>(null);

const hasTurnstileProblem = computed(() =>
  ["expired", "timeout", "error", "unsupported"].includes(turnstileStatus.value)
);
const showTurnstilePanel = computed(
  () =>
    Boolean(turnstileSiteKey.value) ||
    turnstileStatus.value === "loading" ||
    hasTurnstileProblem.value
);
const canRetryTurnstile = computed(
  () => Boolean(turnstileSiteKey.value) && !loading.value && hasTurnstileProblem.value
);
const canSubmit = computed(
  () => !loading.value && (!turnstileSiteKey.value || Boolean(turnstileToken.value))
);
const submitLabel = computed(() => {
  if (loading.value) return t("common.loginLoading");
  if (turnstileSiteKey.value && !turnstileToken.value) return t("auth.turnstileWaitingAction");
  return t("common.login");
});
const turnstileTitle = computed(() => t(`auth.turnstileStatus.${turnstileStatus.value}.title`));
const turnstileDescription = computed(() =>
  t(`auth.turnstileStatus.${turnstileStatus.value}.description`)
);

async function submit() {
  if (!canSubmit.value) return;
  loading.value = true;
  let shouldResetTurnstile = true;
  try {
    await auth.login(email.value, password.value, turnstileToken.value || undefined);
    await router.push(typeof route.query.redirect === "string" ? route.query.redirect : homePath());
  } catch (error) {
    shouldResetTurnstile = !handleLoginError(error);
    const message =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : t("auth.loginFailed");
    toast.error(message.includes("Turnstile") ? t("auth.turnstileVerifyFailed") : message);
  } finally {
    loading.value = false;
    if (shouldResetTurnstile) resetTurnstile();
  }
}

function homePath() {
  return auth.isSysadmin ? "/sysadmin/dashboard" : "/workspace";
}

/** 拉配置 → 按需插脚本 → nextTick 后 render 一次，防重复用 turnstileWidgetId 判断 */
async function initTurnstile() {
  setTurnstileStatus("loading");
  try {
    const config = await apiFetch<{ turnstileSiteKey: string | null }>("/config");
    turnstileSiteKey.value = config.turnstileSiteKey;
    if (!turnstileSiteKey.value) {
      setTurnstileStatus("disabled");
      return;
    }
    await withTimeout(
      loadTurnstileScript(),
      TURNSTILE_LOAD_TIMEOUT_MS,
      new Error("Turnstile script timed out")
    );
    await nextTick();
    renderTurnstile();
  } catch {
    setTurnstileStatus("error");
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

function renderTurnstile() {
  if (
    !turnstileEl.value ||
    !window.turnstile ||
    !turnstileSiteKey.value ||
    turnstileWidgetId.value
  ) {
    return;
  }
  turnstileWidgetId.value = window.turnstile.render(turnstileEl.value, {
    sitekey: turnstileSiteKey.value,
    action: "login",
    language: ui.locale,
    size: "flexible",
    theme: "auto",
    retry: "auto",
    "refresh-expired": "auto",
    "refresh-timeout": "auto",
    "response-field": false,
    callback: (token) => {
      turnstileToken.value = token;
      setTurnstileStatus("verified");
    },
    "expired-callback": () => {
      turnstileToken.value = "";
      setTurnstileStatus("expired");
    },
    "error-callback": (errorCode) => {
      turnstileToken.value = "";
      setTurnstileStatus("error", errorCode);
    },
    "timeout-callback": () => {
      turnstileToken.value = "";
      setTurnstileStatus("timeout");
    },
    "unsupported-callback": () => {
      turnstileToken.value = "";
      setTurnstileStatus("unsupported");
    }
  });
  setTurnstileStatus("ready");
}

/** 登录失败或过期时清空 token 并 reset 组件，促使用户重新点选 */
function resetTurnstile() {
  if (!turnstileWidgetId.value || !window.turnstile) return;
  turnstileToken.value = "";
  setTurnstileStatus("ready");
  window.turnstile.reset(turnstileWidgetId.value);
}

async function retryTurnstile() {
  turnstileToken.value = "";
  turnstileErrorCode.value = null;
  if (turnstileWidgetId.value && window.turnstile) {
    setTurnstileStatus("ready");
    window.turnstile.reset(turnstileWidgetId.value);
    return;
  }
  turnstileWidgetId.value = null;
  await initTurnstile();
}

function setTurnstileStatus(status: TurnstileStatus, errorCode?: string) {
  turnstileStatus.value = status;
  turnstileErrorCode.value = errorCode ?? null;
}

function handleLoginError(error: unknown) {
  const message =
    error && typeof error === "object" && "error" in error
      ? (error as { error: { message?: string } }).error.message
      : undefined;
  if (message?.includes("Turnstile")) {
    setTurnstileStatus("error");
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
  initTurnstile();
});

onBeforeUnmount(() => {
  if (turnstileWidgetId.value && window.turnstile) {
    window.turnstile.remove(turnstileWidgetId.value);
  }
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
              v-if="showTurnstilePanel"
              class="turnstile-panel"
              :class="{
                'turnstile-panel--verified': turnstileStatus === 'verified',
                'turnstile-panel--problem': hasTurnstileProblem
              }"
              aria-live="polite"
            >
              <div class="flex items-start gap-3">
                <div
                  class="turnstile-state-icon"
                  :class="{
                    'turnstile-state-icon--verified': turnstileStatus === 'verified',
                    'turnstile-state-icon--problem': hasTurnstileProblem
                  }"
                >
                  <Loader2 v-if="turnstileStatus === 'loading'" class="h-4 w-4 animate-spin" />
                  <CheckCircle2 v-else-if="turnstileStatus === 'verified'" class="h-4 w-4" />
                  <AlertTriangle v-else-if="hasTurnstileProblem" class="h-4 w-4" />
                  <ShieldCheck v-else class="h-4 w-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 items-center justify-between gap-3">
                    <p class="min-w-0 text-sm font-semibold">{{ turnstileTitle }}</p>
                    <button
                      v-if="canRetryTurnstile"
                      class="ui-button ui-button-secondary h-8 shrink-0 px-2 text-xs"
                      type="button"
                      @click="retryTurnstile"
                    >
                      <RefreshCw class="h-3.5 w-3.5" />
                      {{ t("auth.turnstileRetry") }}
                    </button>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {{ turnstileDescription }}
                  </p>
                  <p v-if="turnstileErrorCode" class="mt-1 text-[11px] text-muted-foreground">
                    {{ t("auth.turnstileErrorCode", { code: turnstileErrorCode }) }}
                  </p>
                </div>
              </div>
              <div
                v-show="turnstileSiteKey && turnstileStatus !== 'unsupported'"
                ref="turnstileEl"
                class="turnstile-widget mt-3"
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

.turnstile-panel {
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--border), transparent 10%);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--card), transparent 10%);
  padding: 0.75rem;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.turnstile-panel--verified {
  border-color: color-mix(in oklch, var(--accent), transparent 42%);
  background: color-mix(in oklch, var(--accent), transparent 90%);
}

.turnstile-panel--problem {
  border-color: color-mix(in oklch, var(--destructive), transparent 48%);
  background: color-mix(in oklch, var(--destructive), transparent 92%);
}

.turnstile-state-icon {
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

.turnstile-state-icon--verified {
  background: color-mix(in oklch, var(--accent), transparent 82%);
  color: color-mix(in oklch, var(--accent), var(--foreground) 30%);
}

.turnstile-state-icon--problem {
  background: color-mix(in oklch, var(--destructive), transparent 84%);
  color: var(--destructive);
}

.turnstile-widget {
  min-height: 65px;
}

.turnstile-widget :deep(iframe) {
  max-width: 100%;
}

@media (min-width: 1024px) {
  .login-page {
    grid-template-columns: minmax(28rem, 0.95fr) minmax(24rem, 0.72fr);
  }
}
</style>
