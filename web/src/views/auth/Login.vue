<script setup lang="ts">
/**
 * 登录页：
 * - 先 GET `/api/config` 读登录验证码 provider；disabled 时直接可登录（开发/内网场景）。
 * - 腾讯验证码、Turnstile、ALTCHA 均由前端控件产出 proof，随登录请求带给后端二次校验。
 * - 成功：尊重 redirect；无 redirect 时 sysadmin 进系统看板，其它角色进图像生成。
 * - 顶栏语言切换走 `ui.setLocale`，与全站 i18n 一致。
 */
import { computed, onBeforeUnmount, onMounted, ref, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-vue-next";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useLoginCaptcha } from "./useLoginCaptcha";

/** 登录页左侧展示轮播（`/public/images`，WebP quality 90） */
const LOGIN_SHOWCASE_SLIDES = [
  "/images/login-showcase-1.webp",
  "/images/login-showcase-2.webp",
  "/images/login-showcase-3.webp",
  "/images/login-showcase-4.webp"
] as const;

const SHOWCASE_ROTATE_MS = 8500;

/** 每种切换动画：慢节奏、不同质感；数字为单次过渡时长（ms） */
const SHOWCASE_TX = [
  { id: "dissolve", ms: 1550 },
  { id: "velvetZoom", ms: 1750 },
  { id: "horizonDrift", ms: 1650 },
  { id: "softAscend", ms: 1700 },
  { id: "luminousVeil", ms: 1800 }
] as const;

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
  altchaEl,
  handleAltchaStateChange,
  handleAltchaVerified,
  turnstileEl,
  handleCaptchaLoginError
} = useLoginCaptcha({ locale: toRef(ui, "locale"), loading });

const showcaseSlideIndex = ref(0);
/** 当前这一次切换使用的动画（与下一张同时更新） */
const showcaseTxIndex = ref(0);
const showcaseTxId = computed(() => SHOWCASE_TX[showcaseTxIndex.value % SHOWCASE_TX.length].id);
const showcaseTxMs = computed(() => SHOWCASE_TX[showcaseTxIndex.value % SHOWCASE_TX.length].ms);
let showcaseTimer: number | undefined;
let mqReducedMotion: MediaQueryList | undefined;
let showcaseMotionHandler: (() => void) | undefined;

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
  if (typeof document === "undefined") return;
  mqReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mq = mqReducedMotion;
  const tick = () => {
    const nextTx = (showcaseTxIndex.value + 1) % SHOWCASE_TX.length;
    const nextSlide = (showcaseSlideIndex.value + 1) % LOGIN_SHOWCASE_SLIDES.length;
    showcaseTxIndex.value = nextTx;
    showcaseSlideIndex.value = nextSlide;
  };
  const arm = () => {
    if (showcaseTimer != null) {
      window.clearInterval(showcaseTimer);
      showcaseTimer = undefined;
    }
    if (!mq.matches) {
      showcaseTimer = window.setInterval(tick, SHOWCASE_ROTATE_MS);
    }
  };
  showcaseMotionHandler = arm;
  arm();
  mq.addEventListener("change", arm);
});

onBeforeUnmount(() => {
  if (showcaseTimer != null) {
    window.clearInterval(showcaseTimer);
    showcaseTimer = undefined;
  }
  if (mqReducedMotion && showcaseMotionHandler) {
    mqReducedMotion.removeEventListener("change", showcaseMotionHandler);
  }
});
</script>

<template>
  <ScrollArea class="h-dvh">
    <main class="login-page grid min-h-dvh">
      <section class="login-showcase hidden min-h-0 flex-col overflow-hidden lg:flex">
        <div
          class="login-showcase-media"
          aria-hidden="true"
          :data-showcase-tx="showcaseTxId"
          :style="{ '--showcase-tx-ms': `${showcaseTxMs}ms` }"
        >
          <img
            v-for="(src, i) in LOGIN_SHOWCASE_SLIDES"
            :key="src"
            class="login-showcase-img login-showcase-slide"
            :class="{ 'login-showcase-slide--active': i === showcaseSlideIndex }"
            :fetchpriority="i === 0 ? 'high' : 'low'"
            :src="src"
            alt=""
            width="1920"
            height="1080"
            loading="eager"
          />
          <div class="login-showcase-scrim" />
        </div>
        <div class="login-showcase-inner flex min-h-0 flex-1 flex-col justify-between p-8">
          <div class="flex items-center gap-3">
            <BrandMark class="login-showcase-mark size-11 shrink-0" />
            <div>
              <p class="login-showcase-brand-title text-lg font-semibold">
                {{ t("common.appName") }}
              </p>
              <p class="login-showcase-brand-sub text-sm">
                {{ t("auth.platformSubtitle") }}
              </p>
            </div>
          </div>
          <div class="login-showcase-copy max-w-lg">
            <p class="login-showcase-lead">{{ t("auth.loginShowcaseLead") }}</p>
            <ul class="login-showcase-list">
              <li>{{ t("auth.loginShowcaseLine1") }}</li>
              <li>{{ t("auth.loginShowcaseLine2") }}</li>
              <li>{{ t("auth.loginShowcaseLine3") }}</li>
            </ul>
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
                'captcha-panel--problem': hasCaptchaProblem,
                'captcha-panel--altcha': activeCaptchaProvider === 'altcha'
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
              <altcha-widget
                v-show="activeCaptchaProvider === 'altcha'"
                ref="altchaEl"
                class="captcha-widget captcha-widget--altcha mt-3"
                @statechange="handleAltchaStateChange"
                @verified="handleAltchaVerified"
              ></altcha-widget>
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
  position: relative;
  border-right: 1px solid color-mix(in oklch, var(--border), transparent 32%);
}

.login-showcase-media {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.login-showcase-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.login-showcase-slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  z-index: 0;
  transform-origin: center center;
  transition-duration: var(--showcase-tx-ms, 1.6s);
}

.login-showcase-slide--active {
  opacity: 1;
  z-index: 1;
}

/* 纯粹交融 */
.login-showcase-media[data-showcase-tx="dissolve"] .login-showcase-slide {
  transition-property: opacity;
  transition-timing-function: cubic-bezier(0.42, 0, 0.18, 1);
  transform: none;
  filter: brightness(1);
}

/* 轻呼吸缩放 */
.login-showcase-media[data-showcase-tx="velvetZoom"] .login-showcase-slide {
  transition-property: opacity, transform;
  transition-timing-function: cubic-bezier(0.2, 0.95, 0.32, 1);
  transform: scale(1.052);
  filter: brightness(1);
}

.login-showcase-media[data-showcase-tx="velvetZoom"] .login-showcase-slide--active {
  transform: scale(1);
}

/* 极轻水平 drift */
.login-showcase-media[data-showcase-tx="horizonDrift"] .login-showcase-slide {
  transition-property: opacity, transform;
  transition-timing-function: cubic-bezier(0.32, 0.02, 0.14, 1);
  transform: translate3d(2%, 0, 0);
  filter: brightness(1);
}

.login-showcase-media[data-showcase-tx="horizonDrift"] .login-showcase-slide--active {
  transform: translate3d(0, 0, 0);
}

/* 缓慢上浮感 */
.login-showcase-media[data-showcase-tx="softAscend"] .login-showcase-slide {
  transition-property: opacity, transform;
  transition-timing-function: cubic-bezier(0.3, 0, 0.22, 1);
  transform: translate3d(0, 1.1%, 0);
  filter: brightness(1);
}

.login-showcase-media[data-showcase-tx="softAscend"] .login-showcase-slide--active {
  transform: translate3d(0, 0, 0);
}

/* 明暗渐显（无模糊，省性能） */
.login-showcase-media[data-showcase-tx="luminousVeil"] .login-showcase-slide {
  transition-property: opacity, filter;
  transition-timing-function: cubic-bezier(0.34, 0, 0.2, 1);
  filter: brightness(0.89);
  transform: none;
}

.login-showcase-media[data-showcase-tx="luminousVeil"] .login-showcase-slide--active {
  filter: brightness(1);
}

@media (prefers-reduced-motion: reduce) {
  .login-showcase-slide {
    transition-duration: 1ms !important;
    transition-property: opacity !important;
    transform: none !important;
    filter: none !important;
  }

  .login-showcase-media[data-showcase-tx="luminousVeil"] .login-showcase-slide,
  .login-showcase-media[data-showcase-tx="luminousVeil"] .login-showcase-slide--active {
    filter: none !important;
  }
}

.login-showcase-scrim {
  position: absolute;
  inset: 0;
  z-index: 2;
  /* 勿混入 var(--background)：亮色主题会在画面上叠一层白雾，破坏对比度 */
  background:
    radial-gradient(
      ellipse 130% 90% at 0% 45%,
      rgb(0 0 0 / 0.62) 0%,
      rgb(0 0 0 / 0.22) 48%,
      transparent 72%
    ),
    radial-gradient(ellipse 95% 65% at 50% 100%, rgb(0 0 0 / 0.5) 0%, transparent 58%),
    radial-gradient(ellipse 85% 55% at 18% 0%, rgb(0 0 0 / 0.48) 0%, transparent 52%),
    linear-gradient(180deg, rgb(0 0 0 / 0.22) 0%, transparent 40%, rgb(0 0 0 / 0.28) 100%),
    linear-gradient(90deg, rgb(0 0 0 / 0.35) 0%, transparent 58%);
}

.login-showcase-inner {
  position: relative;
  z-index: 3;
}

/* 轮播图偏暗：此区强制浅色文案，避免浅色主题下深色字不可读 */
.login-showcase-brand-title {
  color: oklch(0.99 0.002 280);
  text-shadow:
    0 1px 2px rgb(0 0 0 / 0.92),
    0 2px 28px rgb(0 0 0 / 0.55);
}

.login-showcase-brand-sub {
  color: oklch(0.94 0.02 280 / 0.94);
  text-shadow:
    0 1px 2px rgb(0 0 0 / 0.88),
    0 1px 18px rgb(0 0 0 / 0.45);
}

.login-showcase-lead {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 500;
  line-height: 1.7;
  letter-spacing: 0.03em;
  color: oklch(0.99 0.01 280 / 0.9);
  text-shadow:
    0 1px 2px rgb(0 0 0 / 0.88),
    0 2px 20px rgb(0 0 0 / 0.42);
}

.login-showcase-list {
  margin: 1.15rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.login-showcase-list li {
  position: relative;
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: 0.02em;
  color: oklch(0.97 0.02 280 / 0.68);
  text-shadow: 0 1px 12px rgb(0 0 0 / 0.55);
}

.login-showcase-list li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.58em;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: oklch(0.95 0.08 280 / 0.42);
  box-shadow: 0 0 12px oklch(0.85 0.12 280 / 0.25);
}

.login-showcase-mark {
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.85)) drop-shadow(0 2px 12px rgb(0 0 0 / 0.5));
}

.login-card {
  background: var(--surface-strong);
}

.captcha-panel {
  overflow: visible;
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
  display: block;
  width: 100%;
  min-height: 4.25rem;
}

.captcha-widget :deep(iframe) {
  max-width: 100%;
}

.captcha-widget--altcha {
  min-height: 5rem;
  --altcha-border-color: color-mix(in oklch, var(--border), transparent 8%);
  --altcha-border-radius: 0.5rem;
  --altcha-color-base: color-mix(in oklch, var(--card), transparent 8%);
  --altcha-color-base-content: var(--foreground);
  --altcha-color-error: var(--destructive);
  --altcha-color-error-content: var(--primary-foreground);
  --altcha-color-neutral: color-mix(in oklch, var(--muted-foreground), transparent 55%);
  --altcha-color-neutral-content: var(--muted-foreground);
  --altcha-color-primary: var(--primary);
  --altcha-color-primary-content: var(--primary-foreground);
  --altcha-color-success: var(--accent);
  --altcha-color-success-content: var(--accent-foreground);
  --altcha-checkbox-border-color: color-mix(in oklch, var(--border), transparent 2%);
  --altcha-input-background-color: var(--surface);
  --altcha-input-color: var(--foreground);
  --altcha-max-width: 100%;
  --altcha-padding: 0.75rem;
  --altcha-shadow: drop-shadow(0 0.75rem 1.5rem rgb(0 0 0 / 0.28));
  --altcha-spinner-color: var(--foreground);
}

.captcha-panel--altcha.captcha-panel--problem .captcha-widget--altcha {
  min-height: 7rem;
}

@media (min-width: 1024px) {
  .login-page {
    grid-template-columns: minmax(28rem, 0.95fr) minmax(24rem, 0.72fr);
  }
}
</style>
