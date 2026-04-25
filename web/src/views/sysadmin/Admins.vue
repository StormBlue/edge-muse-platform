<script setup lang="ts">
import { ref } from "vue";
import { toast } from "sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

const form = ref({
  email: "",
  password: "password123",
  nickname: "",
  providerKeyId: "",
  quota: 100
});

async function create() {
  await apiFetch("/sysadmin/admins", { method: "POST", body: JSON.stringify(form.value) });
  toast.success("管理员已创建");
}
</script>

<template>
  <AppShell>
    <form class="panel max-w-md space-y-3 p-5" @submit.prevent="create">
      <h1 class="text-xl font-semibold">创建管理员</h1>
      <input v-model="form.email" class="ui-field h-10 px-3" placeholder="邮箱" />
      <input v-model="form.nickname" class="ui-field h-10 px-3" placeholder="昵称" />
      <input
        v-model="form.password"
        class="ui-field h-10 px-3"
        type="password"
        placeholder="密码"
      />
      <input
        v-model="form.providerKeyId"
        class="ui-field h-10 px-3"
        placeholder="Provider Key ID"
      />
      <input
        v-model.number="form.quota"
        class="ui-field h-10 px-3"
        type="number"
        placeholder="总配额"
      />
      <button class="ui-button ui-button-primary w-full" type="submit">创建</button>
    </form>
  </AppShell>
</template>
