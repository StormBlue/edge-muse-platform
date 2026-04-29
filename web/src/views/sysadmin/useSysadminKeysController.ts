import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";

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

export function useSysadminKeysController() {
  const keys = ref<KeyRow[]>([]);
  const providers = ref<ProviderRow[]>([]);
  const { t } = useI18n();
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

  const supportedProviders = computed(() =>
    providers.value.filter((provider) => provider.enabled && provider.builtIn)
  );
  const keyListOffset = computed(() => 0);
  const editProviderOptions = computed(() => {
    const current = providers.value.find((provider) => provider.id === editForm.value.providerId);
    if (!current || current.builtIn) return supportedProviders.value;
    return [current, ...supportedProviders.value];
  });

  async function load() {
    const [keyBody, providerBody] = await Promise.all([
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

  function syncCreateModelWithProvider() {
    const provider = providers.value.find((item) => item.id === form.value.providerId);
    if (!provider) return;
    form.value.model = provider.defaultModel;
  }

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

  return {
    keys,
    providers,
    t,
    createOpen,
    editOpen,
    editing,
    testingKeyId,
    createSaving,
    editSaving,
    form,
    editForm,
    supportedProviders,
    editProviderOptions,
    load,
    openCreate,
    create,
    syncCreateModelWithProvider,
    openEdit,
    syncEditModelWithProvider,
    saveEdit,
    toggleKey,
    deleteKey,
    testKey,
    providerLabel,
    providerMeta,
    tableRowNumber
  };
}
