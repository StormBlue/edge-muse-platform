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
  <main class="flex min-h-screen bg-background">
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
            <input v-model="email" class="ui-field h-11 px-3" type="text" autocomplete="username" />
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
  </main>
</template>
