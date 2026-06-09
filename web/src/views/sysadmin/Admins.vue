<script setup lang="ts">
/**
 * 平台级租户管理员维护：sysadmin 分配 key group、配额池和管理员自身最大同时任务数。
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
  maxImagesPerGeneration?: number | null;
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
  maxImagesPerGeneration?: number;
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
  maxImagesPerGeneration: 1,
  quota: 100
});
const editForm = ref({
  nickname: "",
  status: "active" as "active" | "disabled",
  providerKeyGroupId: "",
  maxConcurrentTasks: 10,
  maxImagesPerGeneration: 1,
  quota: 100 as number | null,
  password: ""
});
const NO_PROVIDER_KEY_GROUP_VALUE = "__none__";
const createProviderKeyGroupSelectValue = computed({
  get: () => form.value.providerKeyGroupId || NO_PROVIDER_KEY_GROUP_VALUE,
  set: (value: string) => {
    form.value.providerKeyGroupId = value === NO_PROVIDER_KEY_GROUP_VALUE ? "" : value;
  }
});
const editProviderKeyGroupSelectValue = computed({
  get: () => editForm.value.providerKeyGroupId || NO_PROVIDER_KEY_GROUP_VALUE,
  set: (value: string) => {
    editForm.value.providerKeyGroupId = value === NO_PROVIDER_KEY_GROUP_VALUE ? "" : value;
  }
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
    maxImagesPerGeneration: 1,
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
    maxImagesPerGeneration: admin.maxImagesPerGeneration ?? 1,
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
  if (editForm.value.maxImagesPerGeneration !== (admin.maxImagesPerGeneration ?? 1)) {
    payload.maxImagesPerGeneration = editForm.value.maxImagesPerGeneration;
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
      <Button type="button" @click="openCreate">
        {{ t("sysadmin.createAdmin") }}
      </Button>
    </div>

    <div class="panel overflow-hidden">
      <table class="w-full min-w-[56rem] text-sm">
        <thead class="bg-muted text-left text-muted-foreground">
          <tr>
            <th class="p-3">{{ t("sysadmin.adminsTitle") }}</th>
            <th class="p-3">{{ t("sysadmin.providerKeyGroup") }}</th>
            <th class="p-3">{{ t("adminUsers.maxConcurrentTasks") }}</th>
            <th class="p-3">{{ t("adminUsers.maxImagesPerGeneration") }}</th>
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
            <td class="p-3">{{ admin.maxImagesPerGeneration ?? 1 }}</td>
            <td class="p-3">{{ admin.usedQuota ?? 0 }} / {{ admin.allocatedQuota ?? "∞" }}</td>
            <td class="p-3">
              {{ admin.status === "active" ? t("common.enabled") : t("common.disabled") }}
            </td>
            <td class="p-3 text-right">
              <Button size="sm" variant="secondary" type="button" @click="openEdit(admin)">
                {{ t("sysadmin.edit") }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <FormDialog
      :open="createOpen"
      :cancel-label="t('common.cancel')"
      :saving="createSaving"
      :submit-label="t('common.create')"
      :title="t('sysadmin.createAdmin')"
      @submit="create"
      @update:open="setCreateOpen"
    >
      <label class="block text-sm font-medium">
        <span>{{ t("auth.usernameForLogin") }}</span>
        <Input v-model="form.username" class="mt-1.5 h-10" required />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("auth.nicknameForDisplay") }}</span>
        <Input v-model="form.nickname" class="mt-1.5 h-10" required />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("auth.password") }}</span>
        <Input v-model="form.password" class="mt-1.5 h-10" minlength="8" required type="password" />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("auth.emailOptional") }}</span>
        <Input v-model="form.email" class="mt-1.5 h-10" type="email" />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("sysadmin.providerKeyGroup") }}</span>
        <Select v-model="createProviderKeyGroupSelectValue" required>
          <SelectTrigger class="mt-1.5 h-10">
            <SelectValue :placeholder="t('sysadmin.selectKeyGroup')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NO_PROVIDER_KEY_GROUP_VALUE">
              {{ t("sysadmin.selectKeyGroup") }}
            </SelectItem>
            <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("adminUsers.maxConcurrentTasks") }}</span>
        <Input
          v-model.number="form.maxConcurrentTasks"
          class="mt-1.5 h-10"
          max="15"
          min="1"
          type="number"
        />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("adminUsers.maxImagesPerGeneration") }}</span>
        <Input
          v-model.number="form.maxImagesPerGeneration"
          class="mt-1.5 h-10"
          max="20"
          min="1"
          type="number"
        />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("adminUsers.initialQuota") }}</span>
        <Input v-model.number="form.quota" class="mt-1.5 h-10" type="number" />
      </label>
    </FormDialog>

    <FormDialog
      v-if="editing"
      :open="editOpen"
      :cancel-label="t('common.cancel')"
      :saving="editSaving"
      :submit-label="t('common.save')"
      :title="t('sysadmin.editAdmin')"
      @submit="saveEdit"
      @update:open="setEditOpen"
    >
      <label class="block text-sm font-medium">
        <span>{{ t("auth.nicknameForDisplay") }}</span>
        <Input v-model="editForm.nickname" class="mt-1.5 h-10" />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("adminUsers.status") }}</span>
        <Select v-model="editForm.status">
          <SelectTrigger class="mt-1.5 h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{{ t("common.enabled") }}</SelectItem>
            <SelectItem value="disabled">{{ t("common.disabled") }}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("sysadmin.providerKeyGroup") }}</span>
        <Select v-model="editProviderKeyGroupSelectValue">
          <SelectTrigger class="mt-1.5 h-10">
            <SelectValue :placeholder="t('sysadmin.selectKeyGroup')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NO_PROVIDER_KEY_GROUP_VALUE">
              {{ t("sysadmin.selectKeyGroup") }}
            </SelectItem>
            <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("adminUsers.maxConcurrentTasks") }}</span>
        <Input
          v-model.number="editForm.maxConcurrentTasks"
          class="mt-1.5 h-10"
          max="15"
          min="1"
          type="number"
        />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("adminUsers.maxImagesPerGeneration") }}</span>
        <Input
          v-model.number="editForm.maxImagesPerGeneration"
          class="mt-1.5 h-10"
          max="20"
          min="1"
          type="number"
        />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("sysadmin.totalQuota") }}</span>
        <Input v-model.number="editForm.quota" class="mt-1.5 h-10" type="number" />
      </label>
      <label class="block text-sm font-medium">
        <span>{{ t("sysadmin.passwordOptional") }}</span>
        <Input v-model="editForm.password" class="mt-1.5 h-10" minlength="8" type="password" />
      </label>
    </FormDialog>
  </AppShell>
</template>
