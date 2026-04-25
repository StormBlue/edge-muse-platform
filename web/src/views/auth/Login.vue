<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import BrandMark from "@/components/brand/BrandMark.vue";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const email = ref("sysadmin@example.com");
const password = ref("password123");
const loading = ref(false);

async function submit() {
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
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
  }
}
</script>

<template>
  <main class="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
    <section class="flex items-center justify-center px-6 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <BrandMark class="size-10" />
            <div>
              <h1 class="text-xl font-semibold">Edge Muse</h1>
              <p class="text-sm text-muted-foreground">{{ t("auth.platformSubtitle") }}</p>
            </div>
          </div>
          <select
            class="ui-field h-9 w-24 px-2 text-sm"
            :value="ui.locale"
            @change="ui.setLocale(($event.target as HTMLSelectElement).value)"
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">EN</option>
          </select>
        </div>
        <form class="panel space-y-4 p-5" @submit.prevent="submit">
          <div>
            <label class="mb-1 block text-sm font-medium">{{ t("auth.email") }}</label>
            <input v-model="email" class="ui-field h-11 px-3" type="email" autocomplete="email" />
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
          <button class="ui-button ui-button-primary w-full" :disabled="loading" type="submit">
            {{ loading ? t("common.loginLoading") : t("common.login") }}
          </button>
        </form>
      </div>
    </section>
    <section class="hidden border-l border-border bg-muted p-8 lg:flex lg:items-center">
      <div class="w-full rounded-[2rem] border border-border bg-card p-8">
        <div class="mb-8 flex items-center justify-between">
          <p class="text-sm font-semibold">{{ t("auth.liveTaskRoom") }}</p>
          <span class="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            {{ t("auth.mockReady") }}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-xl border border-border bg-background p-4">
            <p class="text-xs text-muted-foreground">{{ t("auth.queued") }}</p>
            <p class="mt-2 text-3xl font-semibold">12</p>
          </div>
          <div class="rounded-xl border border-border bg-background p-4">
            <p class="text-xs text-muted-foreground">{{ t("auth.successRate") }}</p>
            <p class="mt-2 text-3xl font-semibold">98%</p>
          </div>
          <div class="col-span-2 rounded-xl border border-border bg-background p-4">
            <div class="mb-3 h-3 w-2/3 rounded bg-muted"></div>
            <div class="grid grid-cols-3 gap-3">
              <div class="aspect-square rounded-lg bg-primary/70"></div>
              <div class="aspect-square rounded-lg bg-accent/50"></div>
              <div class="aspect-square rounded-lg bg-muted"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
