<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, RefreshCw } from "lucide-vue-next";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

type ProviderRow = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
};

type KeyRow = {
  id: string;
  providerId: string;
  label: string;
  model?: string | null;
  keyHint: string;
  enabled: boolean;
  allocatedQuota: number | null;
  usedQuota: number;
};

const keys = ref<KeyRow[]>([]);
const providers = ref<ProviderRow[]>([]);
const { t } = useI18n();
const createOpen = ref(false);
const editOpen = ref(false);
const editing = ref<KeyRow | null>(null);
const form = ref({
  providerId: "",
  label: "",
  model: "",
  apiKey: "",
  allocatedQuota: null as number | null,
  enabled: true
});
const editForm = ref({
  providerId: "",
  label: "",
  model: "",
  apiKey: "",
  allocatedQuota: null as number | null,
  enabled: true
});

const activeProviders = computed(() => providers.value.filter((provider) => provider.enabled));

async function load() {
  const [keyBody, providerBody] = await Promise.all([
    apiFetch<{ items: KeyRow[] }>("/sysadmin/provider-keys"),
    apiFetch<{ items: ProviderRow[] }>("/sysadmin/providers")
  ]);
  keys.value = keyBody.items;
  providers.value = providerBody.items;
  if (!form.value.providerId && activeProviders.value[0]) {
    form.value.providerId = activeProviders.value[0].id;
  }
}

function openCreate() {
  form.value = {
    providerId: activeProviders.value[0]?.id ?? "",
    label: "",
    model: "",
    apiKey: "",
    allocatedQuota: null,
    enabled: true
  };
  createOpen.value = true;
}

async function create() {
  await apiFetch("/sysadmin/provider-keys", {
    method: "POST",
    body: JSON.stringify(form.value)
  });
  toast.success(t("sysadmin.keyCreated"));
  createOpen.value = false;
  await load();
}

function openEdit(key: KeyRow) {
  editing.value = key;
  editForm.value = {
    providerId: key.providerId,
    label: key.label,
    model: key.model ?? "",
    apiKey: "",
    allocatedQuota: key.allocatedQuota,
    enabled: key.enabled
  };
  editOpen.value = true;
}

async function saveEdit() {
  if (!editing.value) return;
  await apiFetch(`/sysadmin/provider-keys/${editing.value.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      providerId: editForm.value.providerId,
      label: editForm.value.label,
      model: editForm.value.model,
      apiKey: editForm.value.apiKey || undefined,
      allocatedQuota: editForm.value.allocatedQuota,
      enabled: editForm.value.enabled
    })
  });
  toast.success(t("sysadmin.keyUpdated"));
  editOpen.value = false;
  editing.value = null;
  await load();
}

async function toggleKey(key: KeyRow) {
  const enabled = !key.enabled;
  await apiFetch(`/sysadmin/provider-keys/${key.id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled })
  });
  toast.success(enabled ? t("sysadmin.keyEnabled") : t("sysadmin.keyDisabled"));
  await load();
}

async function deleteKey(key: KeyRow) {
  if (!window.confirm(t("sysadmin.deleteKeyConfirm", { label: key.label }))) return;
  await apiFetch(`/sysadmin/provider-keys/${key.id}`, { method: "DELETE" });
  toast.success(t("sysadmin.keyDeleted"));
  await load();
}

function providerLabel(id: string) {
  const provider = providers.value.find((item) => item.id === id);
  return provider ? provider.name : id;
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">{{ t("nav.keys") }}</h1>
      <div class="flex flex-wrap gap-2">
        <button class="ui-button ui-button-secondary" type="button" @click="load">
          <RefreshCw class="h-4 w-4" />
          {{ t("sysadmin.refreshList") }}
        </button>
        <button class="ui-button ui-button-primary" type="button" @click="openCreate">
          <Plus class="h-4 w-4" />
          {{ t("sysadmin.createKey") }}
        </button>
      </div>
    </div>

    <div class="panel overflow-hidden">
      <div class="thin-scrollbar max-h-[calc(100vh-10rem)] overflow-auto">
        <table class="w-full min-w-[60rem] text-sm">
          <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>
              <th class="p-3">{{ t("sysadmin.label") }}</th>
              <th class="p-3">{{ t("sysadmin.provider") }}</th>
              <th class="p-3">{{ t("sysadmin.keyModel") }}</th>
              <th class="p-3">{{ t("sysadmin.keyHint") }}</th>
              <th class="p-3">{{ t("common.quota") }}</th>
              <th class="p-3">{{ t("adminUsers.status") }}</th>
              <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!keys.length" class="border-t border-border">
              <td class="p-4 text-center text-muted-foreground" colspan="7">
                {{ t("sysadmin.noKeys") }}
              </td>
            </tr>
            <tr v-for="key in keys" :key="key.id" class="border-t border-border">
              <td class="p-3">
                <p class="font-medium">{{ key.label }}</p>
                <p class="text-xs text-muted-foreground">{{ key.id }}</p>
              </td>
              <td class="p-3">{{ providerLabel(key.providerId) }}</td>
              <td class="p-3">{{ key.model || "-" }}</td>
              <td class="p-3 font-mono">{{ key.keyHint }}</td>
              <td class="p-3">{{ key.usedQuota }} / {{ key.allocatedQuota ?? "∞" }}</td>
              <td class="p-3">
                <span
                  class="rounded-full px-2 py-1 text-xs"
                  :class="
                    key.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ key.enabled ? t("common.enabled") : t("common.disabled") }}
                </span>
              </td>
              <td class="space-x-2 p-3 text-right">
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="openEdit(key)"
                >
                  {{ t("sysadmin.edit") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="toggleKey(key)"
                >
                  {{ key.enabled ? t("common.disabled") : t("common.enabled") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs text-destructive"
                  type="button"
                  @click="deleteKey(key)"
                >
                  {{ t("common.delete") }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="createOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="createOpen = false"
    >
      <form class="panel w-full max-w-md space-y-3 p-5" @submit.prevent="create">
        <h2 class="font-semibold">{{ t("sysadmin.createKey") }}</h2>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.provider") }}
          </span>
          <select v-model="form.providerId" class="ui-field h-10 px-3" required>
            <option value="">{{ t("sysadmin.selectProvider") }}</option>
            <option v-for="provider in activeProviders" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.label") }}
          </span>
          <input v-model="form.label" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.keyModel") }}
          </span>
          <input v-model="form.model" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.apiKey") }}
          </span>
          <input v-model="form.apiKey" class="ui-field h-10 px-3" required type="password" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button class="ui-button ui-button-secondary" type="button" @click="createOpen = false">
            {{ t("common.cancel") }}
          </button>
          <button class="ui-button ui-button-primary" type="submit">
            {{ t("common.create") }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="editOpen && editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="editOpen = false"
    >
      <form class="panel w-full max-w-md space-y-3 p-5" @submit.prevent="saveEdit">
        <h2 class="font-semibold">{{ t("sysadmin.editKey") }}</h2>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.provider") }}
          </span>
          <select v-model="editForm.providerId" class="ui-field h-10 px-3" required>
            <option v-for="provider in providers" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.label") }}
          </span>
          <input v-model="editForm.label" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.keyModel") }}
          </span>
          <input v-model="editForm.model" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.apiKeyOptional") }}
          </span>
          <input v-model="editForm.apiKey" class="ui-field h-10 px-3" type="password" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button class="ui-button ui-button-secondary" type="button" @click="editOpen = false">
            {{ t("common.cancel") }}
          </button>
          <button class="ui-button ui-button-primary" type="submit">
            {{ t("common.save") }}
          </button>
        </div>
      </form>
    </div>
  </AppShell>
</template>
