<script setup lang="ts">
/**
 * 系统管理员偏好：个人默认生图密钥 + 全局 Prompt Assistant 大模型。
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Loader2, Save } from "@lucide/vue";
import AppShell from "@/components/layout/AppShell.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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

type CaptchaProvider = "tencent" | "turnstile" | "altcha" | "disabled";

type CaptchaSettingsSource = "database" | "environment" | "default";

type CaptchaSettings = {
  domesticProvider: CaptchaProvider;
  overseasProvider: CaptchaProvider;
  domesticAltchaDifficulty: number;
  overseasAltchaDifficulty: number;
  /** @deprecated 兼容旧接口响应。 */
  altchaDifficulty: number;
  source: CaptchaSettingsSource;
  updatedAt: number;
  updatedBy: string | null;
};

type CaptchaProviderOption = {
  id: CaptchaProvider;
  label: string;
  description: string;
};

type GenerationFeatureAdmin = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  status: string;
  granted: boolean;
};

type GenerationFeaturesBody = {
  micuGrok: {
    admins: GenerationFeatureAdmin[];
  };
};

type PreferencesBody = {
  preferredProviderKeyId: string | null;
  promptAssistantModel: PromptAssistantModelSettings;
  promptAssistantModelOptions: PromptAssistantModelOption[];
  captcha: CaptchaSettings;
  captchaProviderOptions: CaptchaProviderOption[];
};

const auth = useAuthStore();
const { t } = useI18n();
const NO_PROVIDER_KEY_VALUE = "__none__";
const keys = ref<ProviderKeyRow[]>([]);
/** 可空：空串表示不指定，走服务端其它默认 */
const preferredProviderKeyId = ref("");
const promptAssistantModel = ref("");
const promptAssistantModelSettings = ref<PromptAssistantModelSettings | null>(null);
const promptAssistantModelOptions = ref<PromptAssistantModelOption[]>([]);
const captchaSettings = ref<CaptchaSettings | null>(null);
const captchaProviderOptions = ref<CaptchaProviderOption[]>([]);
const micuGrokAdmins = ref<GenerationFeatureAdmin[]>([]);
const micuGrokAdminIds = ref<string[]>([]);
const domesticCaptchaProvider = ref<CaptchaProvider>("tencent");
const overseasCaptchaProvider = ref<CaptchaProvider>("turnstile");
const domesticAltchaDifficulty = ref(50_000);
const overseasAltchaDifficulty = ref(50_000);
const loading = ref(false);
const saving = ref(false);

const selectedModelOption = computed(() =>
  promptAssistantModelOptions.value.find((option) => option.id === promptAssistantModel.value)
);
const preferredProviderKeySelectValue = computed({
  get: () => preferredProviderKeyId.value || NO_PROVIDER_KEY_VALUE,
  set: (value: string) => {
    preferredProviderKeyId.value = value === NO_PROVIDER_KEY_VALUE ? "" : value;
  }
});
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
const captchaSourceLabel = computed(() => {
  const source = captchaSettings.value?.source ?? "default";
  return t(`sysadmin.modelSource.${source}`);
});
const captchaUpdatedAt = computed(() => {
  const updatedAt = captchaSettings.value?.updatedAt ?? 0;
  return updatedAt ? new Date(updatedAt).toLocaleString() : "-";
});
const showDomesticAltchaDifficulty = computed(() => domesticCaptchaProvider.value === "altcha");
const showOverseasAltchaDifficulty = computed(() => overseasCaptchaProvider.value === "altcha");
const micuGrokGrantedAdminCount = computed(() => micuGrokAdminIds.value.length);

/** 拉密钥列表并同步当前用户已保存的偏好 */
async function load() {
  loading.value = true;
  try {
    const [keysBody, preferencesBody, generationFeaturesBody] = await Promise.all([
      apiFetch<{ items: ProviderKeyRow[] }>("/sysadmin/provider-keys"),
      apiFetch<PreferencesBody>("/sysadmin/preferences"),
      apiFetch<GenerationFeaturesBody>("/sysadmin/generation-features")
    ]);
    keys.value = keysBody.items.filter((key) => key.enabled);
    preferredProviderKeyId.value =
      preferencesBody.preferredProviderKeyId ?? auth.user?.preferredProviderKeyId ?? "";
    promptAssistantModelSettings.value = preferencesBody.promptAssistantModel;
    promptAssistantModel.value = preferencesBody.promptAssistantModel.model;
    promptAssistantModelOptions.value = preferencesBody.promptAssistantModelOptions;
    captchaSettings.value = preferencesBody.captcha;
    captchaProviderOptions.value = preferencesBody.captchaProviderOptions;
    domesticCaptchaProvider.value = preferencesBody.captcha.domesticProvider;
    overseasCaptchaProvider.value = preferencesBody.captcha.overseasProvider;
    domesticAltchaDifficulty.value =
      preferencesBody.captcha.domesticAltchaDifficulty ?? preferencesBody.captcha.altchaDifficulty;
    overseasAltchaDifficulty.value =
      preferencesBody.captcha.overseasAltchaDifficulty ?? preferencesBody.captcha.altchaDifficulty;
    micuGrokAdmins.value = generationFeaturesBody.micuGrok.admins;
    micuGrokAdminIds.value = generationFeaturesBody.micuGrok.admins
      .filter((admin) => admin.granted)
      .map((admin) => admin.id);
  } finally {
    loading.value = false;
  }
}

/** PATCH 后 bootstrap 以刷新顶栏/配额等依赖 user 的展示 */
async function save() {
  saving.value = true;
  try {
    const [body, generationFeaturesBody] = await Promise.all([
      apiFetch<{
        preferredProviderKeyId: string | null;
        promptAssistantModel: PromptAssistantModelSettings;
        captcha: CaptchaSettings;
      }>("/sysadmin/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferredProviderKeyId: preferredProviderKeyId.value,
          promptAssistantModel: promptAssistantModel.value,
          captcha: {
            domesticProvider: domesticCaptchaProvider.value,
            overseasProvider: overseasCaptchaProvider.value,
            domesticAltchaDifficulty: domesticAltchaDifficulty.value,
            overseasAltchaDifficulty: overseasAltchaDifficulty.value
          }
        })
      }),
      apiFetch<GenerationFeaturesBody>("/sysadmin/generation-features", {
        method: "PATCH",
        body: JSON.stringify({ micuGrokAdminIds: micuGrokAdminIds.value })
      })
    ]);
    preferredProviderKeyId.value = body.preferredProviderKeyId ?? "";
    promptAssistantModelSettings.value = body.promptAssistantModel;
    promptAssistantModel.value = body.promptAssistantModel.model;
    captchaSettings.value = body.captcha;
    domesticCaptchaProvider.value = body.captcha.domesticProvider;
    overseasCaptchaProvider.value = body.captcha.overseasProvider;
    domesticAltchaDifficulty.value =
      body.captcha.domesticAltchaDifficulty ?? body.captcha.altchaDifficulty;
    overseasAltchaDifficulty.value =
      body.captcha.overseasAltchaDifficulty ?? body.captcha.altchaDifficulty;
    micuGrokAdmins.value = generationFeaturesBody.micuGrok.admins;
    micuGrokAdminIds.value = generationFeaturesBody.micuGrok.admins
      .filter((admin) => admin.granted)
      .map((admin) => admin.id);
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
            <Select v-model="preferredProviderKeySelectValue" :disabled="loading || saving">
              <SelectTrigger class="h-10">
                <SelectValue :placeholder="t('sysadmin.selectKey')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="NO_PROVIDER_KEY_VALUE">{{
                  t("sysadmin.selectKey")
                }}</SelectItem>
                <SelectItem v-for="key in keys" :key="key.id" :value="key.id">
                  {{ key.label }} ({{ key.keyHint }})
                </SelectItem>
              </SelectContent>
            </Select>
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
            <Select v-model="promptAssistantModel" :disabled="loading || saving" required>
              <SelectTrigger class="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in promptAssistantModelOptions"
                  :key="option.id"
                  :value="option.id"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
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

        <section class="panel space-y-4 p-5 lg:col-span-2">
          <div>
            <h2 class="font-semibold">{{ t("sysadmin.captchaSettingsTitle") }}</h2>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              {{ t("sysadmin.captchaSettingsDescription") }}
            </p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
                {{ t("sysadmin.captchaDomesticProvider") }}
              </span>
              <Select v-model="domesticCaptchaProvider" :disabled="loading || saving">
                <SelectTrigger class="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in captchaProviderOptions"
                    :key="option.id"
                    :value="option.id"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ t("sysadmin.captchaDomesticHint") }}
              </p>
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
                {{ t("sysadmin.captchaOverseasProvider") }}
              </span>
              <Select v-model="overseasCaptchaProvider" :disabled="loading || saving">
                <SelectTrigger class="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in captchaProviderOptions"
                    :key="option.id"
                    :value="option.id"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ t("sysadmin.captchaOverseasHint") }}
              </p>
            </label>
          </div>
          <div
            v-if="showDomesticAltchaDifficulty || showOverseasAltchaDifficulty"
            class="grid gap-4 sm:grid-cols-2"
          >
            <label v-if="showDomesticAltchaDifficulty" class="block">
              <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
                {{ t("sysadmin.domesticAltchaDifficulty") }}
              </span>
              <input
                v-model.number="domesticAltchaDifficulty"
                class="ui-field h-10 px-3"
                type="number"
                min="10000"
                max="200000"
                step="1000"
                :disabled="loading || saving"
              />
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ t("sysadmin.altchaDifficultyHint") }}
              </p>
            </label>
            <label v-if="showOverseasAltchaDifficulty" class="block">
              <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
                {{ t("sysadmin.overseasAltchaDifficulty") }}
              </span>
              <input
                v-model.number="overseasAltchaDifficulty"
                class="ui-field h-10 px-3"
                type="number"
                min="10000"
                max="200000"
                step="1000"
                :disabled="loading || saving"
              />
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ t("sysadmin.altchaDifficultyHint") }}
              </p>
            </label>
          </div>
          <div class="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-6">
            <dl class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt>{{ t("sysadmin.modelSettingSource") }}</dt>
                <dd class="mt-1 font-medium text-foreground">{{ captchaSourceLabel }}</dd>
              </div>
              <div>
                <dt>{{ t("sysadmin.modelUpdatedAt") }}</dt>
                <dd class="mt-1 font-medium text-foreground">{{ captchaUpdatedAt }}</dd>
              </div>
              <div v-if="showDomesticAltchaDifficulty">
                <dt>{{ t("sysadmin.domesticAltchaDifficulty") }}</dt>
                <dd class="mt-1 font-medium text-foreground">{{ domesticAltchaDifficulty }}</dd>
              </div>
              <div v-if="showOverseasAltchaDifficulty">
                <dt>{{ t("sysadmin.overseasAltchaDifficulty") }}</dt>
                <dd class="mt-1 font-medium text-foreground">{{ overseasAltchaDifficulty }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="panel space-y-4 p-5 lg:col-span-2">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">{{ t("sysadmin.micuGrokFeatureTitle") }}</h2>
              <p class="mt-1 text-sm leading-6 text-muted-foreground">
                {{ t("sysadmin.micuGrokFeatureDescription") }}
              </p>
            </div>
            <span class="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {{ t("sysadmin.micuGrokGrantedAdmins", { count: micuGrokGrantedAdminCount }) }}
            </span>
          </div>
          <div v-if="micuGrokAdmins.length" class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <label
              v-for="admin in micuGrokAdmins"
              :key="admin.id"
              class="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-muted/20 p-3"
            >
              <input
                v-model="micuGrokAdminIds"
                class="mt-1 h-4 w-4"
                type="checkbox"
                :value="admin.id"
                :disabled="loading || saving || admin.status !== 'active'"
              />
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">
                  {{ admin.nickname || admin.username }}
                </span>
                <span class="mt-1 block truncate text-xs text-muted-foreground">
                  {{ admin.email }}
                </span>
                <span
                  v-if="admin.status !== 'active'"
                  class="mt-1 block text-xs text-muted-foreground"
                >
                  {{ t("common.disabled") }}
                </span>
              </span>
            </label>
          </div>
          <p
            v-else
            class="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground"
          >
            {{ t("sysadmin.micuGrokNoAdmins") }}
          </p>
        </section>
      </div>
    </form>
  </AppShell>
</template>
