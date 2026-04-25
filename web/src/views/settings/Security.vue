<script setup lang="ts">
import { ref } from "vue";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

const oldPassword = ref("");
const newPassword = ref("");

async function save() {
  await apiFetch("/auth/password/change", {
    method: "POST",
    body: JSON.stringify({ oldPassword: oldPassword.value, newPassword: newPassword.value })
  });
  toast.success("密码已修改");
  oldPassword.value = "";
  newPassword.value = "";
}
</script>

<template>
  <AppShell>
    <div class="max-w-xl">
      <h1 class="mb-4 text-xl font-semibold">安全设置</h1>
      <form class="panel space-y-4 p-5" @submit.prevent="save">
        <input
          v-model="oldPassword"
          class="ui-field h-11 px-3"
          placeholder="旧密码"
          type="password"
        />
        <input
          v-model="newPassword"
          class="ui-field h-11 px-3"
          placeholder="新密码"
          type="password"
        />
        <button class="ui-button ui-button-primary" type="submit">修改密码</button>
      </form>
    </div>
  </AppShell>
</template>
