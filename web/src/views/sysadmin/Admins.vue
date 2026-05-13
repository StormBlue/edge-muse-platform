<script setup lang="ts">
/**
 * 平台级租户管理员维护：sysadmin 分配 key group、配额池和管理员自身最大同时任务数。
 */
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "lucide-vue-next";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { apiFetch } from "@/api/client";

type AdminRow = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  status: "active" | "disabled";
  providerKeyGroupId: string | null;
  providerKeyGroupName?: string | null;
  providerKeyGroupProviderId?: string | null;
  maxConcurrentTasks?: number | null;
  allocatedQuota: number | null;
  usedQuota: number | null;
};

type ProviderKeyGroupRow = {
  id: string;
  providerId: string;
  name: string;
  enabled: boolean;
};

type AdminUpdatePayload = {
  nickname?: string;
  status?: "active" | "disabled";
  providerKeyGroupId?: string;
  maxConcurrentTasks?: number;
  quota?: number | null;
  password?: string;
};

const admins = ref<AdminRow[]>([]);
const groups = ref<ProviderKeyGroupRow[]>([]);
const { t } = useI18n();
const createOpen = ref(false);
const editOpen = ref(false);
const editing = ref<AdminRow | null>(null);
const createSaving = ref(false);
const editSaving = ref(false);
const form = ref({
  email: "",
  username: "",
  password: "",
  nickname: "",
  providerKeyGroupId: "",
  maxConcurrentTasks: 10,
  quota: 100
});
const editForm = ref({
  nickname: "",
  status: "active" as "active" | "disabled",
  providerKeyGroupId: "",
  maxConcurrentTasks: 10,
  quota: 100 as number | null,
  password: ""
});

async function load() {
  const [adminBody, groupBody] = await Promise.all([
    apiFetch<{ items: AdminRow[] }>("/sysadmin/admins"),
    apiFetch<{ items: ProviderKeyGroupRow[] }>("/sysadmin/provider-key-groups")
  ]);
  admins.value = adminBody.items;
  groups.value = groupBody.items.filter((group) => group.enabled);
  if (!form.value.providerKeyGroupId && groups.value[0]) {
    form.value.providerKeyGroupId = groups.value[0].id;
  }
}

function setCreateOpen(open: boolean) {
  if (!createSaving.value) createOpen.value = open;
}

function setEditOpen(open: boolean) {
  if (!editSaving.value) editOpen.value = open;
}

function openCreate() {
  createSaving.value = false;
  form.value = {
    email: "",
    username: "",
    password: "",
    nickname: "",
    providerKeyGroupId: groups.value[0]?.id ?? "",
    maxConcurrentTasks: 10,
    quota: 100
  };
  createOpen.value = true;
}

async function create() {
  if (createSaving.value) return;
  createSaving.value = true;
  try {
    await apiFetch("/sysadmin/admins", { method: "POST", body: JSON.stringify(form.value) });
    toast.success(t("sysadmin.adminCreated"));
    createOpen.value = false;
    await load();
  } finally {
    createSaving.value = false;
  }
}

function openEdit(admin: AdminRow) {
  editSaving.value = false;
  editing.value = admin;
  editForm.value = {
    nickname: admin.nickname,
    status: admin.status,
    providerKeyGroupId: admin.providerKeyGroupId ?? "",
    maxConcurrentTasks: admin.maxConcurrentTasks ?? 10,
    quota: admin.allocatedQuota,
    password: ""
  };
  editOpen.value = true;
}

async function saveEdit() {
  if (!editing.value || editSaving.value) return;
  editSaving.value = true;
  const admin = editing.value;
  const payload: AdminUpdatePayload = {};
  if (editForm.value.nickname !== admin.nickname) payload.nickname = editForm.value.nickname;
  if (editForm.value.status !== admin.status) payload.status = editForm.value.status;
  if (
    editForm.value.providerKeyGroupId &&
    editForm.value.providerKeyGroupId !== admin.providerKeyGroupId
  ) {
    payload.providerKeyGroupId = editForm.value.providerKeyGroupId;
  }
  if (editForm.value.maxConcurrentTasks !== (admin.maxConcurrentTasks ?? 10)) {
    payload.maxConcurrentTasks = editForm.value.maxConcurrentTasks;
  }
  if (editForm.value.quota !== admin.allocatedQuota) payload.quota = editForm.value.quota;
  if (editForm.value.password) payload.password = editForm.value.password;
  if (Object.keys(payload).length === 0) {
    editOpen.value = false;
    editSaving.value = false;
    return;
  }
  try {
    await apiFetch(`/sysadmin/admins/${admin.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    toast.success(t("sysadmin.adminUpdated"));
    editOpen.value = false;
    await load();
  } finally {
    editSaving.value = false;
  }
}

function groupLabel(admin: AdminRow) {
  if (admin.providerKeyGroupName) return admin.providerKeyGroupName;
  if (!admin.providerKeyGroupId) return t("sysadmin.unassigned");
  return (
    groups.value.find((item) => item.id === admin.providerKeyGroupId)?.name ??
    admin.providerKeyGroupId
  );
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">{{ t("sysadmin.adminsTitle") }}</h1>
      <button class="ui-button ui-button-primary" type="button" @click="openCreate">
        {{ t("sysadmin.createAdmin") }}
      </button>
    </div>

    <div class="panel overflow-hidden">
      <table class="w-full min-w-[56rem] text-sm">
        <thead class="bg-muted text-left text-muted-foreground">
          <tr>
            <th class="p-3">{{ t("sysadmin.adminsTitle") }}</th>
            <th class="p-3">{{ t("sysadmin.providerKeyGroup") }}</th>
            <th class="p-3">{{ t("adminUsers.maxConcurrentTasks") }}</th>
            <th class="p-3">{{ t("common.quota") }}</th>
            <th class="p-3">{{ t("adminUsers.status") }}</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="admin in admins" :key="admin.id" class="border-t border-border">
            <td class="p-3">
              <p class="font-medium">{{ admin.nickname }}</p>
              <p class="text-xs text-muted-foreground">{{ admin.username }} · {{ admin.email }}</p>
            </td>
            <td class="p-3">
              <p>{{ groupLabel(admin) }}</p>
              <p class="text-xs text-muted-foreground">
                {{ admin.providerKeyGroupProviderId ?? admin.providerKeyGroupId ?? "-" }}
              </p>
            </td>
            <td class="p-3">{{ admin.maxConcurrentTasks ?? 10 }}</td>
            <td class="p-3">{{ admin.usedQuota ?? 0 }} / {{ admin.allocatedQuota ?? "∞" }}</td>
            <td class="p-3">
              {{ admin.status === "active" ? t("common.enabled") : t("common.disabled") }}
            </td>
            <td class="p-3 text-right">
              <button
                class="ui-button ui-button-secondary h-8 text-xs"
                type="button"
                @click="openEdit(admin)"
              >
                {{ t("sysadmin.edit") }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Dialog :open="createOpen" @update:open="setCreateOpen">
      <DialogContent class="sm:max-w-md" prevent-outside-close>
        <DialogHeader>
          <DialogTitle>{{ t("sysadmin.createAdmin") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" :aria-busy="createSaving" @submit.prevent="create">
          <label class="block text-sm font-medium">
            <span>{{ t("auth.usernameForLogin") }}</span>
            <input v-model="form.username" class="ui-field mt-1.5 h-10 px-3" required />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.nicknameForDisplay") }}</span>
            <input v-model="form.nickname" class="ui-field mt-1.5 h-10 px-3" required />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.password") }}</span>
            <input
              v-model="form.password"
              class="ui-field mt-1.5 h-10 px-3"
              minlength="8"
              required
              type="password"
            />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.emailOptional") }}</span>
            <input v-model="form.email" class="ui-field mt-1.5 h-10 px-3" type="email" />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.providerKeyGroup") }}</span>
            <select v-model="form.providerKeyGroupId" class="ui-field mt-1.5 h-10 px-3" required>
              <option value="">{{ t("sysadmin.selectKeyGroup") }}</option>
              <option v-for="group in groups" :key="group.id" :value="group.id">
                {{ group.name }}
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.maxConcurrentTasks") }}</span>
            <input
              v-model.number="form.maxConcurrentTasks"
              class="ui-field mt-1.5 h-10 px-3"
              max="15"
              min="1"
              type="number"
            />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.initialQuota") }}</span>
            <input v-model.number="form.quota" class="ui-field mt-1.5 h-10 px-3" type="number" />
          </label>
          <DialogFooter class="mt-1">
            <DialogClose as-child>
              <button class="ui-button ui-button-secondary" type="button" :disabled="createSaving">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit" :disabled="createSaving">
              <Loader2 v-if="createSaving" class="h-4 w-4 animate-spin" />
              {{ t("common.create") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="editOpen" @update:open="setEditOpen">
      <DialogContent v-if="editing" class="sm:max-w-md" prevent-outside-close>
        <DialogHeader>
          <DialogTitle>{{ t("sysadmin.editAdmin") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" :aria-busy="editSaving" @submit.prevent="saveEdit">
          <label class="block text-sm font-medium">
            <span>{{ t("auth.nicknameForDisplay") }}</span>
            <input v-model="editForm.nickname" class="ui-field mt-1.5 h-10 px-3" />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.status") }}</span>
            <select v-model="editForm.status" class="ui-field mt-1.5 h-10 px-3">
              <option value="active">{{ t("common.enabled") }}</option>
              <option value="disabled">{{ t("common.disabled") }}</option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.providerKeyGroup") }}</span>
            <select v-model="editForm.providerKeyGroupId" class="ui-field mt-1.5 h-10 px-3">
              <option value="">{{ t("sysadmin.selectKeyGroup") }}</option>
              <option v-for="group in groups" :key="group.id" :value="group.id">
                {{ group.name }}
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.maxConcurrentTasks") }}</span>
            <input
              v-model.number="editForm.maxConcurrentTasks"
              class="ui-field mt-1.5 h-10 px-3"
              max="15"
              min="1"
              type="number"
            />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.totalQuota") }}</span>
            <input
              v-model.number="editForm.quota"
              class="ui-field mt-1.5 h-10 px-3"
              type="number"
            />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.passwordOptional") }}</span>
            <input
              v-model="editForm.password"
              class="ui-field mt-1.5 h-10 px-3"
              minlength="8"
              type="password"
            />
          </label>
          <DialogFooter class="mt-1">
            <DialogClose as-child>
              <button class="ui-button ui-button-secondary" type="button" :disabled="editSaving">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit" :disabled="editSaving">
              <Loader2 v-if="editSaving" class="h-4 w-4 animate-spin" />
              {{ t("common.save") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AppShell>
</template>
