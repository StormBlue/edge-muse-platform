<script setup lang="ts">
/**
 * 服务商 API 密钥：创建时提交明文，服务端 AES 入库；列表仅显示 keyHint；可配配额与归属。
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2, PlugZap, Plus, RefreshCw } from "lucide-vue-next";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

/** 上游 OpenAI 兼容服务商标识，密钥必须归属某一 provider */
type ProviderRow = {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  requestFormat: string;
  supportedSizes: string[];
  enabled: boolean;
  builtIn: boolean;
};

/** 一行密钥：明文在创建/编辑时提交，列表仅回显 keyHint 与额度用量 */
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
/** 创建/编辑弹层 */
const createOpen = ref(false);
const editOpen = ref(false);
const editing = ref<KeyRow | null>(null);
const testingKeyId = ref<string | null>(null);
const createSaving = ref(false);
const editSaving = ref(false);
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

/** 创建/改绑密钥只允许产品内置支持项；旧 provider 仅保留在列表里用于历史 key 展示。 */
const supportedProviders = computed(() =>
  providers.value.filter((provider) => provider.enabled && provider.builtIn)
);
/** 当前密钥列表接口未分页；后续接入 page/pageSize 时只需替换这里的起始偏移。 */
const keyListOffset = computed(() => 0);
const editProviderOptions = computed(() => {
  const current = providers.value.find((provider) => provider.id === editForm.value.providerId);
  if (!current || current.builtIn) return supportedProviders.value;
  return [current, ...supportedProviders.value];
});

/** 并行拉密钥与 provider；首次设置默认 `form.providerId` */
async function load() {
  const [keyBody, providerBody] = await Promise.all([
    // 密钥管理页需要展示历史旧 provider key；分配下拉仍使用默认接口返回的受支持 key。
    apiFetch<{ items: KeyRow[] }>("/sysadmin/provider-keys?includeUnsupported=1"),
    apiFetch<{ items: ProviderRow[] }>("/sysadmin/providers")
  ]);
  keys.value = keyBody.items;
  providers.value = providerBody.items;
  if (!form.value.providerId && supportedProviders.value[0]) {
    form.value.providerId = supportedProviders.value[0].id;
    form.value.model = supportedProviders.value[0].defaultModel;
  }
}

/** 打开创建并重置表单项；默认绑第一个可用 provider */
function openCreate() {
  createSaving.value = false;
  const provider = supportedProviders.value[0];
  form.value = {
    providerId: provider?.id ?? "",
    label: "",
    model: provider?.defaultModel ?? "gpt-image-2",
    apiKey: "",
    allocatedQuota: null,
    enabled: true
  };
  createOpen.value = true;
}

/** POST 明文 apiKey，服务端加密落库 */
async function create() {
  if (createSaving.value) return;
  createSaving.value = true;
  try {
    await apiFetch("/sysadmin/provider-keys", {
      method: "POST",
      body: JSON.stringify(form.value)
    });
    toast.success(t("sysadmin.keyCreated"));
    createOpen.value = false;
    await load();
  } finally {
    createSaving.value = false;
  }
}

/** 切换服务商时自动带出默认模型，仍允许 sysadmin 手动覆盖为其它兼容模型名。 */
function syncCreateModelWithProvider() {
  const provider = providers.value.find((item) => item.id === form.value.providerId);
  if (!provider) return;
  form.value.model = provider.defaultModel;
}

/** 编辑时 apiKey 留空表示不更换 */
function openEdit(key: KeyRow) {
  editSaving.value = false;
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

function syncEditModelWithProvider() {
  const provider = providers.value.find((item) => item.id === editForm.value.providerId);
  if (!provider) return;
  editForm.value.model = provider.defaultModel;
}

async function saveEdit() {
  if (!editing.value || editSaving.value) return;
  editSaving.value = true;
  const key = editing.value;
  // 空串不传 apiKey，避免无意覆盖
  const providerChanged = editForm.value.providerId !== key.providerId;
  try {
    await apiFetch(`/sysadmin/provider-keys/${key.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        providerId: providerChanged ? editForm.value.providerId : undefined,
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
  } finally {
    editSaving.value = false;
  }
}

/** 行内快速启停，不调弹层 */
async function toggleKey(key: KeyRow) {
  const enabled = !key.enabled;
  await apiFetch(`/sysadmin/provider-keys/${key.id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled })
  });
  toast.success(enabled ? t("sysadmin.keyEnabled") : t("sysadmin.keyDisabled"));
  await load();
}

/** 硬删前二次确认，若有用户绑定会由后端拒绝或级联策略处理 */
async function deleteKey(key: KeyRow) {
  if (!window.confirm(t("sysadmin.deleteKeyConfirm", { label: key.label }))) return;
  await apiFetch(`/sysadmin/provider-keys/${key.id}`, { method: "DELETE" });
  toast.success(t("sysadmin.keyDeleted"));
  await load();
}

/** 调后端 health 探测；Cubence 这里只验证鉴权，share group 仍需真实生图 smoke test。 */
async function testKey(key: KeyRow) {
  testingKeyId.value = key.id;
  try {
    const body = await apiFetch<{ ok: boolean }>(`/sysadmin/provider-keys/${key.id}/test`, {
      method: "POST"
    });
    if (body.ok) {
      toast.success(t("sysadmin.keyTestPassed"));
    } else {
      toast.error(t("sysadmin.keyTestFailed"));
    }
  } catch {
    toast.error(t("sysadmin.keyTestFailed"));
  } finally {
    testingKeyId.value = null;
  }
}

/** 表格中 provider 列展示名，未找到时退回 raw id */
function providerLabel(id: string) {
  const provider = providers.value.find((item) => item.id === id);
  return provider ? provider.name : id;
}

function providerMeta(id: string) {
  const provider = providers.value.find((item) => item.id === id);
  if (!provider) return "";
  return `${provider.defaultModel} · ${provider.baseUrl}`;
}

function tableRowNumber(index: number) {
  return keyListOffset.value + index + 1;
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
        <table class="w-full min-w-[64rem] text-sm">
          <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>
              <th class="w-16 p-3">{{ t("common.sequence") }}</th>
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
              <td class="p-4 text-center text-muted-foreground" colspan="8">
                {{ t("sysadmin.noKeys") }}
              </td>
            </tr>
            <tr v-for="(key, index) in keys" :key="key.id" class="border-t border-border">
              <td class="p-3 font-mono text-muted-foreground">{{ tableRowNumber(index) }}</td>
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
                  :disabled="testingKeyId === key.id"
                  @click="testKey(key)"
                >
                  <Loader2 v-if="testingKeyId === key.id" class="h-3.5 w-3.5 animate-spin" />
                  <PlugZap v-else class="h-3.5 w-3.5" />
                  {{ t("sysadmin.testKey") }}
                </button>
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
      @click.self="!createSaving && (createOpen = false)"
    >
      <form
        class="panel w-full max-w-md space-y-3 p-5"
        :aria-busy="createSaving"
        @submit.prevent="create"
      >
        <h2 class="font-semibold">{{ t("sysadmin.createKey") }}</h2>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.provider") }}
          </span>
          <select
            v-model="form.providerId"
            class="ui-field h-10 px-3"
            required
            @change="syncCreateModelWithProvider"
          >
            <option value="">{{ t("sysadmin.selectProvider") }}</option>
            <option v-for="provider in supportedProviders" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
          <span v-if="form.providerId" class="mt-1 block text-xs text-muted-foreground">
            {{ providerMeta(form.providerId) }}
          </span>
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
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="createSaving"
            @click="createOpen = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button class="ui-button ui-button-primary" type="submit" :disabled="createSaving">
            <Loader2 v-if="createSaving" class="h-4 w-4 animate-spin" />
            {{ t("common.create") }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="editOpen && editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="!editSaving && (editOpen = false)"
    >
      <form
        class="panel w-full max-w-md space-y-3 p-5"
        :aria-busy="editSaving"
        @submit.prevent="saveEdit"
      >
        <h2 class="font-semibold">{{ t("sysadmin.editKey") }}</h2>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.provider") }}
          </span>
          <select
            v-model="editForm.providerId"
            class="ui-field h-10 px-3"
            required
            @change="syncEditModelWithProvider"
          >
            <option
              v-for="provider in editProviderOptions"
              :key="provider.id"
              :value="provider.id"
              :disabled="
                provider.id !== editForm.providerId && (!provider.builtIn || !provider.enabled)
              "
            >
              {{ provider.name }}
            </option>
          </select>
          <span v-if="editForm.providerId" class="mt-1 block text-xs text-muted-foreground">
            {{ providerMeta(editForm.providerId) }}
          </span>
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
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="editSaving"
            @click="editOpen = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button class="ui-button ui-button-primary" type="submit" :disabled="editSaving">
            <Loader2 v-if="editSaving" class="h-4 w-4 animate-spin" />
            {{ t("common.save") }}
          </button>
        </div>
      </form>
    </div>
  </AppShell>
</template>
