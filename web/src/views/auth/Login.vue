<script setup lang="ts">
/**
 * 登录页：
 * - 先 GET `/api/config` 读登录验证码 provider；disabled 时直接可登录（开发/内网场景）。
 * - 腾讯验证码由前端脚本回调 ticket/randstr，Turnstile 回调 token，均随登录请求带给后端二次校验。
 * - 成功：尊重 redirect；无 redirect 时 sysadmin 进系统看板，其它角色进图像生成。
 * - 顶栏语言切换走 `ui.setLocale`，与全站 i18n 一致。
 */
import { computed, onMounted, ref, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-vue-next";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useLoginCaptcha } from "./useLoginCaptcha";

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const email = ref("");
const password = ref("");
const loading = ref(false);
const {
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
} = useLoginCaptcha({ locale: toRef(ui, "locale"), loading });

const canSubmit = computed(() => !loading.value && isCaptchaReadyForSubmit.value);
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
  let shouldResetCaptcha = false;
  try {
    await auth.login(email.value, password.value, captchaProof.value || undefined);
    await router.push(typeof route.query.redirect === "string" ? route.query.redirect : homePath());
  } catch (error) {
    shouldResetCaptcha = true;
    handleLoginError(error);
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

function handleLoginError(error: unknown) {
  const message =
    error && typeof error === "object" && "error" in error
      ? (error as { error: { message?: string } }).error.message
      : undefined;
  handleCaptchaLoginError(message);
}

onMounted(() => {
  initCaptcha();
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
