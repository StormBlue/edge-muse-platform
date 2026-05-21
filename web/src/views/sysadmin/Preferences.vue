<script setup lang="ts">
/**
 * 系统管理员偏好：个人默认生图密钥、Prompt Assistant 大模型、
 * 验证码策略与米醋 Grok 功能可见性。
 */
import { Loader2, Save } from "@lucide/vue";
import AppShell from "@/components/layout/AppShell.vue";
import { Button } from "@/components/ui/button";
import PreferencesCaptchaPanel from "./PreferencesCaptchaPanel.vue";
import PreferencesMicuGrokPanel from "./PreferencesMicuGrokPanel.vue";
import PreferencesPersonalKeyPanel from "./PreferencesPersonalKeyPanel.vue";
import PreferencesPromptAssistantPanel from "./PreferencesPromptAssistantPanel.vue";
import { usePreferencesController } from "./usePreferencesController";

const {
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
} = usePreferencesController();
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
        <Button type="submit" :disabled="saveDisabled">
          <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
          <Save v-else class="h-4 w-4" />
          {{ saving ? t("common.loading") : t("common.save") }}
        </Button>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <PreferencesPersonalKeyPanel
          v-model:preferred-provider-key-select-value="preferredProviderKeySelectValue"
          :keys="keys"
          :loading="loading"
          :saving="saving"
          :t="t"
        />

        <PreferencesPromptAssistantPanel
          v-model:prompt-assistant-model="promptAssistantModel"
          :loading="loading"
          :model-source-label="modelSourceLabel"
          :model-updated-at="modelUpdatedAt"
          :prompt-assistant-model-options="promptAssistantModelOptions"
          :saving="saving"
          :selected-model-description="selectedModelDescription"
          :t="t"
        />

        <PreferencesCaptchaPanel
          v-model:domestic-altcha-difficulty="domesticAltchaDifficulty"
          v-model:domestic-captcha-provider="domesticCaptchaProvider"
          v-model:overseas-altcha-difficulty="overseasAltchaDifficulty"
          v-model:overseas-captcha-provider="overseasCaptchaProvider"
          :captcha-provider-options="captchaProviderOptions"
          :captcha-source-label="captchaSourceLabel"
          :captcha-updated-at="captchaUpdatedAt"
          :loading="loading"
          :saving="saving"
          :show-domestic-altcha-difficulty="showDomesticAltchaDifficulty"
          :show-overseas-altcha-difficulty="showOverseasAltchaDifficulty"
          :t="t"
        />

        <PreferencesMicuGrokPanel
          v-model:micu-grok-admin-ids="micuGrokAdminIds"
          :loading="loading"
          :micu-grok-admins="micuGrokAdmins"
          :micu-grok-granted-admin-count="micuGrokGrantedAdminCount"
          :saving="saving"
          :t="t"
        />
      </div>
    </form>
  </AppShell>
</template>
