<script setup lang="ts">
/**
 * 登录页：
 * - 先 GET `/api/config` 读 `turnstileSiteKey`；无 key 则不调起人机，直接可登录（开发/内网场景）。
 * - 有 key 时异步加载 Turnstile 脚本、`render` 到占位 div，token 经 `auth.login` 带给后端 `verifyTurnstile`。
 * - 成功：尊重 redirect；无 redirect 时 sysadmin 进系统看板，其它角色进图像生成。
 * - 顶栏语言切换走 `ui.setLocale`，与全站 i18n 一致。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

/** 防重复插入官方 challenge 脚本 */
const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";

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

async function submit() {
  if (turnstileSiteKey.value && !turnstileToken.value) return;
  loading.value = true;
  try {
    await auth.login(email.value, password.value, turnstileToken.value || undefined);
    await router.push(typeof route.query.redirect === "string" ? route.query.redirect : homePath());
  } catch (error) {
    const message =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : t("auth.loginFailed");
    toast.error(message);
  } finally {
    loading.value = false;
    resetTurnstile();
  }
}

function homePath() {
  return auth.isSysadmin ? "/sysadmin/dashboard" : "/workspace";
}

/** 拉配置 → 按需插脚本 → nextTick 后 render 一次，防重复用 turnstileWidgetId 判断 */
async function initTurnstile() {
  const config = await apiFetch<{ turnstileSiteKey: string | null }>("/config");
  turnstileSiteKey.value = config.turnstileSiteKey;
  if (!turnstileSiteKey.value) return;
  await loadTurnstileScript();
  await nextTick();
  if (!turnstileEl.value || !window.turnstile || turnstileWidgetId.value) return;
  turnstileWidgetId.value = window.turnstile.render(turnstileEl.value, {
    sitekey: turnstileSiteKey.value,
    callback: (token) => {
      turnstileToken.value = token;
    },
    "expired-callback": () => {
      turnstileToken.value = "";
    },
    "error-callback": () => {
      turnstileToken.value = "";
    }
  });
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

/** 登录失败或过期时清空 token 并 reset 组件，促使用户重新点选 */
function resetTurnstile() {
  if (!turnstileWidgetId.value || !window.turnstile) return;
  turnstileToken.value = "";
  window.turnstile.reset(turnstileWidgetId.value);
}

onMounted(() => {
  // 配置拉取失败时静默关闭 Turnstile，不阻塞无站点 key 的环境
  initTurnstile().catch(() => {
    turnstileSiteKey.value = null;
  });
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
            <div v-if="turnstileSiteKey" ref="turnstileEl" class="min-h-[65px]"></div>
            <button
              class="ui-button ui-button-primary w-full"
              :disabled="loading || Boolean(turnstileSiteKey && !turnstileToken)"
              type="submit"
            >
              {{ loading ? t("common.loginLoading") : t("common.login") }}
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

@media (min-width: 1024px) {
  .login-page {
    grid-template-columns: minmax(28rem, 0.95fr) minmax(24rem, 0.72fr);
  }
}
</style>
