export const NO_PROVIDER_KEY_VALUE = "__none__";

/** 下拉候选项；与全局密钥表一致，仅作展示用 hint */
export type ProviderKeyRow = {
  id: string;
  label: string;
  keyHint: string;
  enabled: boolean;
};

export type PromptAssistantModelSource = "database" | "environment" | "default";

export type PromptAssistantModelSettings = {
  model: string;
  source: PromptAssistantModelSource;
  updatedAt: number;
  updatedBy: string | null;
};

export type PromptAssistantModelOption = {
  id: string;
  label: string;
  description: string;
};

export type CaptchaProvider = "tencent" | "turnstile" | "altcha" | "disabled";

export type CaptchaSettingsSource = "database" | "environment" | "default";

export type CaptchaSettings = {
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

export type CaptchaProviderOption = {
  id: CaptchaProvider;
  label: string;
  description: string;
};

export type GenerationFeatureAdmin = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  status: string;
  granted: boolean;
};

export type GenerationFeaturesBody = {
  micuGrok: {
    admins: GenerationFeatureAdmin[];
  };
};

export type PreferencesBody = {
  preferredProviderKeyId: string | null;
  promptAssistantModel: PromptAssistantModelSettings;
  promptAssistantModelOptions: PromptAssistantModelOption[];
  captcha: CaptchaSettings;
  captchaProviderOptions: CaptchaProviderOption[];
};
