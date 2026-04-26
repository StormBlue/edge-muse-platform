<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

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
const turnstileToken = ref("");
const turnstileEl = ref<HTMLElement | null>(null);
const turnstileWidgetId = ref<string | null>(null);

async function submit() {
  if (turnstileSiteKey.value && !turnstileToken.value) return;
  loading.value = true;
  try {
    await auth.login(email.value, password.value, turnstileToken.value || undefined);
    await router.push(
      typeof route.query.redirect === "string" ? route.query.redirect : "/workspace"
    );
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

function resetTurnstile() {
  if (!turnstileWidgetId.value || !window.turnstile) return;
  turnstileToken.value = "";
  window.turnstile.reset(turnstileWidgetId.value);
}

onMounted(() => {
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
  <ScrollArea class="h-dvh bg-background">
    <main class="flex min-h-dvh bg-background">
      <section class="flex flex-1 items-center justify-center px-6 py-10">
        <div class="w-full max-w-sm">
          <div class="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
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
          <form class="panel space-y-4 p-5" @submit.prevent="submit">
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
