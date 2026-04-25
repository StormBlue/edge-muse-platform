<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "sonner";
import { apiFetch } from "@/api/client";

const route = useRoute();
const router = useRouter();
const password = ref("");

async function submit() {
  await apiFetch("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ token: route.query.token, password: password.value })
  });
  toast.success("密码已重置");
  await router.push("/login");
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background px-4">
    <form class="panel w-full max-w-sm space-y-4 p-5" @submit.prevent="submit">
      <h1 class="text-lg font-semibold">重置密码</h1>
      <input v-model="password" class="ui-field h-11 px-3" placeholder="新密码" type="password" />
      <button class="ui-button ui-button-primary w-full" type="submit">保存新密码</button>
    </form>
  </main>
</template>
