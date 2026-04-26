<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
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
const { t } = useI18n();
const createOpen = ref(false);
const editOpen = ref(false);
const editing = ref<AdminRow | null>(null);
const form = ref({
  email: "",
  username: "",
  password: "",
  nickname: "",
  providerKeyId: "",
  quota: 100
});
const editForm = ref({
  nickname: "",
  status: "active" as "active" | "disabled",
  providerKeyId: "",
  quota: 100 as number | null,
  password: ""
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
  toast.success(t("sysadmin.adminCreated"));
  createOpen.value = false;
  form.value = {
    email: "",
    username: "",
    password: "",
    nickname: "",
    providerKeyId: "",
    quota: 100
  };
  await load();
}

function openEdit(admin: AdminRow) {
  editing.value = admin;
  editForm.value = {
    nickname: admin.nickname,
    status: admin.status,
    providerKeyId: admin.providerKeyId ?? "",
    quota: admin.allocatedQuota,
    password: ""
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
      quota: editForm.value.quota,
      password: editForm.value.password || undefined
    })
  });
  toast.success(t("sysadmin.adminUpdated"));
  editOpen.value = false;
  await load();
}

function keyLabel(id: string | null) {
  const key = keys.value.find((item) => item.id === id);
  return key ? `${key.label} (${key.keyHint})` : id || t("sysadmin.unassigned");
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">{{ t("sysadmin.adminsTitle") }}</h1>
      <button class="ui-button ui-button-primary" type="button" @click="createOpen = true">
        {{ t("sysadmin.createAdmin") }}
      </button>
    </div>

    <div class="panel overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted text-left text-muted-foreground">
          <tr>
            <th class="p-3">{{ t("sysadmin.adminsTitle") }}</th>
            <th class="p-3">{{ t("sysadmin.providerKey") }}</th>
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
            <td class="p-3">{{ keyLabel(admin.providerKeyId) }}</td>
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

    <Dialog v-model:open="createOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t("sysadmin.createAdmin") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" @submit.prevent="create">
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
              type="password"
              required
            />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("auth.emailOptional") }}</span>
            <input v-model="form.email" class="ui-field mt-1.5 h-10 px-3" type="email" />
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("sysadmin.providerKey") }}</span>
            <select v-model="form.providerKeyId" class="ui-field mt-1.5 h-10 px-3" required>
              <option value="">{{ t("sysadmin.selectKey") }}</option>
              <option v-for="key in keys" :key="key.id" :value="key.id">
                {{ key.label }} ({{ key.keyHint }})
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            <span>{{ t("adminUsers.initialQuota") }}</span>
            <input v-model.number="form.quota" class="ui-field mt-1.5 h-10 px-3" type="number" />
          </label>
          <DialogFooter class="mt-1">
            <DialogClose as-child>
              <button class="ui-button ui-button-secondary" type="button">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit">
              {{ t("common.create") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="editOpen">
      <DialogContent v-if="editing" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t("sysadmin.editAdmin") }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" @submit.prevent="saveEdit">
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
            <span>{{ t("sysadmin.providerKey") }}</span>
            <select v-model="editForm.providerKeyId" class="ui-field mt-1.5 h-10 px-3">
              <option value="">{{ t("sysadmin.keepUnassigned") }}</option>
              <option v-for="key in keys" :key="key.id" :value="key.id">
                {{ key.label }} ({{ key.keyHint }})
              </option>
            </select>
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
              <button class="ui-button ui-button-secondary" type="button">
                {{ t("common.cancel") }}
              </button>
            </DialogClose>
            <button class="ui-button ui-button-primary" type="submit">
              {{ t("common.save") }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AppShell>
</template>
