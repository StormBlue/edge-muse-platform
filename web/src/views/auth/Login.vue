<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "sonner";
import { Sparkles } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
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
        : "登录失败";
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
        <div class="mb-8 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
            <Sparkles class="h-5 w-5" />
          </div>
          <div>
            <h1 class="text-xl font-semibold">Edge Muse</h1>
            <p class="text-sm text-muted-foreground">Cloudflare image generation platform</p>
          </div>
        </div>
        <form class="panel space-y-4 p-5" @submit.prevent="submit">
          <div>
            <label class="mb-1 block text-sm font-medium">邮箱</label>
            <input v-model="email" class="ui-field h-11 px-3" type="email" autocomplete="email" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">密码</label>
            <input
              v-model="password"
              class="ui-field h-11 px-3"
              type="password"
              autocomplete="current-password"
            />
          </div>
          <button class="ui-button ui-button-primary w-full" :disabled="loading" type="submit">
            {{ loading ? "登录中" : "登录" }}
          </button>
          <div class="flex justify-between text-sm">
            <RouterLink class="text-muted-foreground hover:text-foreground" to="/forgot-password">
              忘记密码
            </RouterLink>
          </div>
        </form>
      </div>
    </section>
    <section class="hidden border-l border-border bg-muted p-8 lg:flex lg:items-center">
      <div class="w-full rounded-[2rem] border border-border bg-card p-8">
        <div class="mb-8 flex items-center justify-between">
          <p class="text-sm font-semibold">Live task room</p>
          <span class="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">mock ready</span>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-xl border border-border bg-background p-4">
            <p class="text-xs text-muted-foreground">Queued</p>
            <p class="mt-2 text-3xl font-semibold">12</p>
          </div>
          <div class="rounded-xl border border-border bg-background p-4">
            <p class="text-xs text-muted-foreground">Success rate</p>
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
