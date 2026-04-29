<script setup lang="ts">
/**
 * 系统管理员偏好：个人默认生图密钥 + 全局 Prompt Assistant 大模型。
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Loader2, Save } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

/** 下拉候选项；与全局密钥表一致，仅作展示用 hint */
type ProviderKeyRow = {
  id: string;
  label: string;
  keyHint: string;
  enabled: boolean;
};

type PromptAssistantModelSource = "database" | "environment" | "default";

type PromptAssistantModelSettings = {
  model: string;
  source: PromptAssistantModelSource;
  updatedAt: number;
  updatedBy: string | null;
};

type PromptAssistantModelOption = {
  id: string;
  label: string;
  description: string;
};

type PreferencesBody = {
  preferredProviderKeyId: string | null;
  promptAssistantModel: PromptAssistantModelSettings;
  promptAssistantModelOptions: PromptAssistantModelOption[];
};

const auth = useAuthStore();
const { t } = useI18n();
const keys = ref<ProviderKeyRow[]>([]);
/** 可空：空串表示不指定，走服务端其它默认 */
const preferredProviderKeyId = ref("");
const promptAssistantModel = ref("");
const promptAssistantModelSettings = ref<PromptAssistantModelSettings | null>(null);
const promptAssistantModelOptions = ref<PromptAssistantModelOption[]>([]);
const loading = ref(false);
const saving = ref(false);

const selectedModelOption = computed(() =>
  promptAssistantModelOptions.value.find((option) => option.id === promptAssistantModel.value)
);
const selectedModelDescription = computed(() => {
  if (!selectedModelOption.value) return "";
  if (selectedModelOption.value.id === "@cf/qwen/qwen3-30b-a3b-fp8") {
    return t("sysadmin.promptAssistantModelQwenDescription");
  }
  if (selectedModelOption.value.id === "@cf/meta/llama-3.1-8b-instruct-fp8") {
    return t("sysadmin.promptAssistantModelLlamaFp8Description");
  }
  if (selectedModelOption.value.id === "@cf/meta/llama-3.1-8b-instruct") {
    return t("sysadmin.promptAssistantModelLlamaDescription");
  }
  return selectedModelOption.value.description;
});
const saveDisabled = computed(() => loading.value || saving.value || !promptAssistantModel.value);
const modelSourceLabel = computed(() => {
  const source = promptAssistantModelSettings.value?.source ?? "default";
  return t(`sysadmin.modelSource.${source}`);
});
const modelUpdatedAt = computed(() => {
  const updatedAt = promptAssistantModelSettings.value?.updatedAt ?? 0;
  return updatedAt ? new Date(updatedAt).toLocaleString() : "-";
});

/** 拉密钥列表并同步当前用户已保存的偏好 */
async function load() {
  loading.value = true;
  try {
    const [keysBody, preferencesBody] = await Promise.all([
      apiFetch<{ items: ProviderKeyRow[] }>("/sysadmin/provider-keys"),
      apiFetch<PreferencesBody>("/sysadmin/preferences")
    ]);
    keys.value = keysBody.items.filter((key) => key.enabled);
    preferredProviderKeyId.value =
      preferencesBody.preferredProviderKeyId ?? auth.user?.preferredProviderKeyId ?? "";
    promptAssistantModelSettings.value = preferencesBody.promptAssistantModel;
    promptAssistantModel.value = preferencesBody.promptAssistantModel.model;
    promptAssistantModelOptions.value = preferencesBody.promptAssistantModelOptions;
  } finally {
    loading.value = false;
  }
}

/** PATCH 后 bootstrap 以刷新顶栏/配额等依赖 user 的展示 */
async function save() {
  saving.value = true;
  try {
    const body = await apiFetch<{
      preferredProviderKeyId: string | null;
      promptAssistantModel: PromptAssistantModelSettings;
    }>("/sysadmin/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        preferredProviderKeyId: preferredProviderKeyId.value,
        promptAssistantModel: promptAssistantModel.value
      })
    });
    preferredProviderKeyId.value = body.preferredProviderKeyId ?? "";
    promptAssistantModelSettings.value = body.promptAssistantModel;
    promptAssistantModel.value = body.promptAssistantModel.model;
    await auth.bootstrap();
    toast.success(t("sysadmin.preferencesSaved"));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AppShell>
    <form class="space-y-4" @submit.prevent="save">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">{{ t("sysadmin.preferencesTitle") }}</h1>
          <p class="mt-1 text-sm leading-6 text-muted-foreground">
            {{ t("sysadmin.preferencesDescription") }}
          </p>
        </div>
        <button class="ui-button ui-button-primary" type="submit" :disabled="saveDisabled">
          <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
          <Save v-else class="h-4 w-4" />
          {{ saving ? t("common.loading") : t("common.save") }}
        </button>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="panel space-y-4 p-5">
          <div>
            <h2 class="font-semibold">{{ t("sysadmin.personalKeyTitle") }}</h2>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              {{ t("sysadmin.personalKeyDescription") }}
            </p>
          </div>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("sysadmin.providerKey") }}
            </span>
            <select
              v-model="preferredProviderKeyId"
              class="ui-field h-10 px-3"
              :disabled="loading || saving"
            >
              <option value="">{{ t("sysadmin.selectKey") }}</option>
              <option v-for="key in keys" :key="key.id" :value="key.id">
                {{ key.label }} ({{ key.keyHint }})
              </option>
            </select>
          </label>
        </section>

        <section class="panel space-y-4 p-5">
          <div>
            <h2 class="font-semibold">{{ t("sysadmin.promptAssistantModelTitle") }}</h2>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              {{ t("sysadmin.promptAssistantModelDescription") }}
            </p>
          </div>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("sysadmin.promptAssistantModel") }}
            </span>
            <select
              v-model="promptAssistantModel"
              class="ui-field h-10 px-3"
              :disabled="loading || saving"
              required
            >
              <option
                v-for="option in promptAssistantModelOptions"
                :key="option.id"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <div class="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-6">
            <p class="font-mono text-xs text-muted-foreground">{{ promptAssistantModel }}</p>
            <p v-if="selectedModelDescription" class="mt-2 text-muted-foreground">
              {{ selectedModelDescription }}
            </p>
            <dl class="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt>{{ t("sysadmin.modelSettingSource") }}</dt>
                <dd class="mt-1 font-medium text-foreground">{{ modelSourceLabel }}</dd>
              </div>
              <div>
                <dt>{{ t("sysadmin.modelUpdatedAt") }}</dt>
                <dd class="mt-1 font-medium text-foreground">{{ modelUpdatedAt }}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </form>
  </AppShell>
</template>
