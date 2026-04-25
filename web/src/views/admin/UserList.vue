<script setup lang="ts">
import { onMounted, ref } from "vue";
import { toast } from "sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

type AdminUser = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
  allocatedQuota: number | null;
  usedQuota: number | null;
};

const users = ref<AdminUser[]>([]);
const q = ref("");
const createOpen = ref(false);
const form = ref({ email: "", password: "password123", nickname: "", quota: 10 });

async function load() {
  const body = await apiFetch<{ items: AdminUser[] }>(
    `/admin/users${q.value ? `?q=${encodeURIComponent(q.value)}` : ""}`
  );
  users.value = body.items;
}

async function createUser() {
  await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(form.value) });
  toast.success("用户已创建");
  createOpen.value = false;
  await load();
}

async function grant(user: AdminUser) {
  const amount = Number(prompt("增加配额", "10"));
  if (!amount) return;
  await apiFetch(`/admin/users/${user.id}/quota`, {
    method: "POST",
    body: JSON.stringify({ amount })
  });
  await load();
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">用户管理</h1>
      <div class="flex gap-2">
        <input
          v-model="q"
          class="ui-field h-10 w-64 px-3"
          placeholder="搜索邮箱"
          @keyup.enter="load"
        />
        <button class="ui-button ui-button-secondary" type="button" @click="load">搜索</button>
        <button class="ui-button ui-button-primary" type="button" @click="createOpen = true">
          创建用户
        </button>
      </div>
    </div>
    <div class="panel overflow-hidden">
      <table class="w-full border-collapse text-sm">
        <thead class="bg-muted text-left text-muted-foreground">
          <tr>
            <th class="p-3">用户</th>
            <th class="p-3">角色</th>
            <th class="p-3">配额</th>
            <th class="p-3">状态</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-t border-border">
            <td class="p-3">
              <p class="font-medium">{{ user.nickname }}</p>
              <p class="text-xs text-muted-foreground">{{ user.email }}</p>
            </td>
            <td class="p-3">{{ user.role }}</td>
            <td class="p-3">{{ user.usedQuota ?? 0 }} / {{ user.allocatedQuota ?? "∞" }}</td>
            <td class="p-3">{{ user.status }}</td>
            <td class="p-3 text-right">
              <button
                class="ui-button ui-button-secondary h-8 text-xs"
                type="button"
                @click="grant(user)"
              >
                改配额
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="createOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="createOpen = false"
    >
      <form class="panel w-full max-w-md space-y-3 p-5" @submit.prevent="createUser">
        <h2 class="font-semibold">创建用户</h2>
        <input v-model="form.email" class="ui-field h-10 px-3" placeholder="邮箱" />
        <input v-model="form.nickname" class="ui-field h-10 px-3" placeholder="昵称" />
        <input
          v-model="form.password"
          class="ui-field h-10 px-3"
          placeholder="密码"
          type="password"
        />
        <input
          v-model.number="form.quota"
          class="ui-field h-10 px-3"
          placeholder="初始配额"
          type="number"
        />
        <button class="ui-button ui-button-primary w-full" type="submit">创建</button>
      </form>
    </div>
  </AppShell>
</template>
