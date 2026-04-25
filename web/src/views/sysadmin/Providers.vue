<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, RefreshCw } from "lucide-vue-next";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
  supportedSizes: string[];
};

const items = ref<Provider[]>([]);
const { t } = useI18n();
const createOpen = ref(false);
const editOpen = ref(false);
const editing = ref<Provider | null>(null);
const form = ref({
  name: "",
  baseUrl: ""
});
const editForm = ref({
  name: "",
  baseUrl: ""
});
const defaultProviderSettings = {
  defaultModel: "gpt-image-2",
  supportedSizes: ["1024x1024", "1024x1536", "1536x1024", "auto"],
  enabled: true
};

async function load() {
  items.value = (await apiFetch<{ items: Provider[] }>("/sysadmin/providers")).items;
}

function openCreate() {
  form.value = { name: "", baseUrl: "" };
  createOpen.value = true;
}

async function create() {
  await apiFetch("/sysadmin/providers", {
    method: "POST",
    body: JSON.stringify({ ...form.value, ...defaultProviderSettings })
  });
  toast.success(t("sysadmin.providerCreated"));
  createOpen.value = false;
  await load();
}

function openEdit(provider: Provider) {
  editing.value = provider;
  editForm.value = {
    name: provider.name,
    baseUrl: provider.baseUrl
  };
  editOpen.value = true;
}

async function saveEdit() {
  if (!editing.value) return;
  await apiFetch(`/sysadmin/providers/${editing.value.id}`, {
    method: "PATCH",
    body: JSON.stringify(editForm.value)
  });
  toast.success(t("sysadmin.providerUpdated"));
  editOpen.value = false;
  editing.value = null;
  await load();
}

async function toggleProvider(provider: Provider) {
  const enabled = !provider.enabled;
  await apiFetch(`/sysadmin/providers/${provider.id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled })
  });
  toast.success(enabled ? t("sysadmin.providerEnabled") : t("sysadmin.providerDisabled"));
  await load();
}

async function deleteProvider(provider: Provider) {
  if (!window.confirm(t("sysadmin.deleteProviderConfirm", { name: provider.name }))) return;
  await apiFetch(`/sysadmin/providers/${provider.id}`, { method: "DELETE" });
  toast.success(t("sysadmin.providerDeleted"));
  await load();
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">{{ t("nav.providers") }}</h1>
      <div class="flex flex-wrap gap-2">
        <button class="ui-button ui-button-secondary" type="button" @click="load">
          <RefreshCw class="h-4 w-4" />
          {{ t("sysadmin.refreshList") }}
        </button>
        <button class="ui-button ui-button-primary" type="button" @click="openCreate">
          <Plus class="h-4 w-4" />
          {{ t("sysadmin.createProvider") }}
        </button>
      </div>
    </div>

    <div class="panel overflow-hidden">
      <div class="thin-scrollbar max-h-[calc(100vh-10rem)] overflow-auto">
        <table class="w-full min-w-[48rem] text-sm">
          <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>
              <th class="p-3">{{ t("sysadmin.providerName") }}</th>
              <th class="p-3">{{ t("sysadmin.providerDomain") }}</th>
              <th class="p-3">{{ t("adminUsers.status") }}</th>
              <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!items.length" class="border-t border-border">
              <td class="p-4 text-center text-muted-foreground" colspan="4">
                {{ t("sysadmin.noProviders") }}
              </td>
            </tr>
            <tr v-for="provider in items" :key="provider.id" class="border-t border-border">
              <td class="p-3">
                <p class="font-medium">{{ provider.name }}</p>
                <p class="text-xs text-muted-foreground">{{ provider.id }}</p>
              </td>
              <td class="break-all p-3">{{ provider.baseUrl }}</td>
              <td class="p-3">
                <span
                  class="rounded-full px-2 py-1 text-xs"
                  :class="
                    provider.enabled
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ provider.enabled ? t("common.enabled") : t("common.disabled") }}
                </span>
              </td>
              <td class="space-x-2 p-3 text-right">
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="openEdit(provider)"
                >
                  {{ t("sysadmin.edit") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="toggleProvider(provider)"
                >
                  {{ provider.enabled ? t("common.disabled") : t("common.enabled") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs text-destructive"
                  type="button"
                  @click="deleteProvider(provider)"
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
        <h2 class="font-semibold">{{ t("sysadmin.createProvider") }}</h2>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.providerName") }}
          </span>
          <input
            v-model="form.name"
            class="ui-field h-10 px-3"
            :placeholder="t('sysadmin.providerName')"
            required
          />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.providerDomain") }}
          </span>
          <input
            v-model="form.baseUrl"
            class="ui-field h-10 px-3"
            :placeholder="t('sysadmin.providerDomainPlaceholder')"
            required
          />
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
        <h2 class="font-semibold">{{ t("sysadmin.editProvider") }}</h2>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.providerName") }}
          </span>
          <input v-model="editForm.name" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.providerDomain") }}
          </span>
          <input v-model="editForm.baseUrl" class="ui-field h-10 px-3" required />
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
