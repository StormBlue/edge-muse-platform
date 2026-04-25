<script setup lang="ts">
import { ref } from "vue";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";

const email = ref("");
const sent = ref(false);

async function submit() {
  await apiFetch("/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email: email.value, turnstileToken: "dev" })
  });
  sent.value = true;
  toast.success("如果账号存在，重置邮件会发送到邮箱。");
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background px-4">
    <form class="panel w-full max-w-sm space-y-4 p-5" @submit.prevent="submit">
      <h1 class="text-lg font-semibold">忘记密码</h1>
      <input
        v-model="email"
        class="ui-field h-11 px-3"
        placeholder="email@example.com"
        type="email"
      />
      <button class="ui-button ui-button-primary w-full" type="submit">发送重置链接</button>
      <RouterLink class="block text-center text-sm text-muted-foreground" to="/login">
        返回登录
      </RouterLink>
    </form>
  </main>
</template>
