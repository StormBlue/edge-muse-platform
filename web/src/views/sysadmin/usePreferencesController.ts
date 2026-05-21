import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import {
  NO_PROVIDER_KEY_VALUE,
  type CaptchaProvider,
  type CaptchaProviderOption,
  type CaptchaSettings,
  type GenerationFeatureAdmin,
  type GenerationFeaturesBody,
  type PreferencesBody,
  type PromptAssistantModelOption,
  type PromptAssistantModelSettings,
  type ProviderKeyRow
} from "./preferencesTypes";

export function usePreferencesController() {
  const auth = useAuthStore();
  const { t } = useI18n();
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

  onMounted(load);

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
      applyPreferences(preferencesBody);
      applyGenerationFeatures(generationFeaturesBody);
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
      applyPreferences(body);
      applyGenerationFeatures(generationFeaturesBody);
      await auth.bootstrap();
      toast.success(t("sysadmin.preferencesSaved"));
    } finally {
      saving.value = false;
    }
  }

  function applyPreferences(body: {
    promptAssistantModel: PromptAssistantModelSettings;
    promptAssistantModelOptions?: PromptAssistantModelOption[];
    captcha: CaptchaSettings;
    captchaProviderOptions?: CaptchaProviderOption[];
  }) {
    promptAssistantModelSettings.value = body.promptAssistantModel;
    promptAssistantModel.value = body.promptAssistantModel.model;
    if (body.promptAssistantModelOptions) {
      promptAssistantModelOptions.value = body.promptAssistantModelOptions;
    }
    captchaSettings.value = body.captcha;
    if (body.captchaProviderOptions) {
      captchaProviderOptions.value = body.captchaProviderOptions;
    }
    domesticCaptchaProvider.value = body.captcha.domesticProvider;
    overseasCaptchaProvider.value = body.captcha.overseasProvider;
    domesticAltchaDifficulty.value =
      body.captcha.domesticAltchaDifficulty ?? body.captcha.altchaDifficulty;
    overseasAltchaDifficulty.value =
      body.captcha.overseasAltchaDifficulty ?? body.captcha.altchaDifficulty;
  }

  function applyGenerationFeatures(body: GenerationFeaturesBody) {
    micuGrokAdmins.value = body.micuGrok.admins;
    micuGrokAdminIds.value = body.micuGrok.admins
      .filter((admin) => admin.granted)
      .map((admin) => admin.id);
  }

  return {
    t,
    keys,
    preferredProviderKeySelectValue,
    promptAssistantModel,
    promptAssistantModelOptions,
    captchaProviderOptions,
    micuGrokAdmins,
    micuGrokAdminIds,
    domesticCaptchaProvider,
    overseasCaptchaProvider,
    domesticAltchaDifficulty,
    overseasAltchaDifficulty,
    loading,
    saving,
    selectedModelDescription,
    saveDisabled,
    modelSourceLabel,
    modelUpdatedAt,
    captchaSourceLabel,
    captchaUpdatedAt,
    showDomesticAltchaDifficulty,
    showOverseasAltchaDifficulty,
    micuGrokGrantedAdminCount,
    save
  };
}
