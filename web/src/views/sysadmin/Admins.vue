<script setup lang="ts">
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

type AdminRow = {
  id: string;
  email: string;
  nickname: string;
  status: "active" | "disabled";
  providerKeyId: string | null;
  allocatedQuota: number | null;
  usedQuota: number | null;
};

type ProviderKeyRow = {
  id: string;
  label: string;
  keyHint: string;
  enabled: boolean;
};

const admins = ref<AdminRow[]>([]);
const keys = ref<ProviderKeyRow[]>([]);
const createOpen = ref(false);
const editOpen = ref(false);
const editing = ref<AdminRow | null>(null);
const form = ref({
  email: "",
  password: "password123",
  nickname: "",
  providerKeyId: "",
  quota: 100
});
const editForm = ref({
  nickname: "",
  status: "active" as "active" | "disabled",
  providerKeyId: "",
  quota: 100 as number | null
});

async function load() {
  const [adminBody, keyBody] = await Promise.all([
    apiFetch<{ items: AdminRow[] }>("/sysadmin/admins"),
    apiFetch<{ items: ProviderKeyRow[] }>("/sysadmin/provider-keys")
  ]);
  admins.value = adminBody.items;
  keys.value = keyBody.items.filter((key) => key.enabled);
}

async function create() {
  await apiFetch("/sysadmin/admins", { method: "POST", body: JSON.stringify(form.value) });
  toast.success("管理员已创建");
  createOpen.value = false;
  form.value = { email: "", password: "password123", nickname: "", providerKeyId: "", quota: 100 };
  await load();
}

function openEdit(admin: AdminRow) {
  editing.value = admin;
  editForm.value = {
    nickname: admin.nickname,
    status: admin.status,
    providerKeyId: admin.providerKeyId ?? "",
    quota: admin.allocatedQuota
  };
  editOpen.value = true;
}

async function saveEdit() {
  if (!editing.value) return;
  await apiFetch(`/sysadmin/admins/${editing.value.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      nickname: editForm.value.nickname,
      status: editForm.value.status,
      providerKeyId: editForm.value.providerKeyId || undefined,
      quota: editForm.value.quota
    })
  });
  toast.success("管理员已更新");
  editOpen.value = false;
  await load();
}

function keyLabel(id: string | null) {
  const key = keys.value.find((item) => item.id === id);
  return key ? `${key.label} (${key.keyHint})` : id || "未分配";
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">管理员</h1>
      <button class="ui-button ui-button-primary" type="button" @click="createOpen = true">
        创建管理员
      </button>
    </div>

    <div class="panel overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted text-left text-muted-foreground">
          <tr>
            <th class="p-3">管理员</th>
            <th class="p-3">密钥</th>
            <th class="p-3">配额</th>
            <th class="p-3">状态</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="admin in admins" :key="admin.id" class="border-t border-border">
            <td class="p-3">
              <p class="font-medium">{{ admin.nickname }}</p>
              <p class="text-xs text-muted-foreground">{{ admin.email }}</p>
            </td>
            <td class="p-3">{{ keyLabel(admin.providerKeyId) }}</td>
            <td class="p-3">{{ admin.usedQuota ?? 0 }} / {{ admin.allocatedQuota ?? "∞" }}</td>
            <td class="p-3">{{ admin.status === "active" ? "启用" : "禁用" }}</td>
            <td class="p-3 text-right">
              <button
                class="ui-button ui-button-secondary h-8 text-xs"
                type="button"
                @click="openEdit(admin)"
              >
                编辑
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
      <form class="panel w-full max-w-md space-y-3 p-5" @submit.prevent="create">
        <h2 class="font-semibold">创建管理员</h2>
        <input v-model="form.email" class="ui-field h-10 px-3" placeholder="邮箱" />
        <input v-model="form.nickname" class="ui-field h-10 px-3" placeholder="昵称" />
        <input
          v-model="form.password"
          class="ui-field h-10 px-3"
          type="password"
          placeholder="密码"
        />
        <select v-model="form.providerKeyId" class="ui-field h-10 px-3">
          <option value="">选择密钥</option>
          <option v-for="key in keys" :key="key.id" :value="key.id">
            {{ key.label }} ({{ key.keyHint }})
          </option>
        </select>
        <input
          v-model.number="form.quota"
          class="ui-field h-10 px-3"
          type="number"
          placeholder="总配额"
        />
        <button class="ui-button ui-button-primary w-full" type="submit">创建</button>
      </form>
    </div>

    <div
      v-if="editOpen && editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="editOpen = false"
    >
      <form class="panel w-full max-w-md space-y-3 p-5" @submit.prevent="saveEdit">
        <h2 class="font-semibold">编辑管理员</h2>
        <input v-model="editForm.nickname" class="ui-field h-10 px-3" placeholder="昵称" />
        <select v-model="editForm.status" class="ui-field h-10 px-3">
          <option value="active">启用</option>
          <option value="disabled">禁用</option>
        </select>
        <select v-model="editForm.providerKeyId" class="ui-field h-10 px-3">
          <option value="">保持未分配</option>
          <option v-for="key in keys" :key="key.id" :value="key.id">
            {{ key.label }} ({{ key.keyHint }})
          </option>
        </select>
        <input
          v-model.number="editForm.quota"
          class="ui-field h-10 px-3"
          type="number"
          placeholder="总配额"
        />
        <button class="ui-button ui-button-primary w-full" type="submit">保存</button>
      </form>
    </div>
  </AppShell>
</template>
