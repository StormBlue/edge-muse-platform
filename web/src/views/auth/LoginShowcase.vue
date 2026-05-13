<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import BrandMark from "@/components/brand/BrandMark.vue";

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

const { t } = useI18n();
const showcaseSlideIndex = ref(0);
const showcaseTxIndex = ref(0);
const showcaseTxId = computed(() => SHOWCASE_TX[showcaseTxIndex.value % SHOWCASE_TX.length].id);
const showcaseTxMs = computed(() => SHOWCASE_TX[showcaseTxIndex.value % SHOWCASE_TX.length].ms);
let showcaseTimer: number | undefined;
let mqReducedMotion: MediaQueryList | undefined;
let showcaseMotionHandler: (() => void) | undefined;

onMounted(() => {
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
</template>

<style scoped>
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
</style>
