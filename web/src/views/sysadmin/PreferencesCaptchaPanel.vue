<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { CaptchaProvider, CaptchaProviderOption } from "./preferencesTypes";

defineProps<{
  captchaProviderOptions: CaptchaProviderOption[];
  captchaSourceLabel: string;
  captchaUpdatedAt: string;
  loading: boolean;
  saving: boolean;
  showDomesticAltchaDifficulty: boolean;
  showOverseasAltchaDifficulty: boolean;
  t: (key: string) => string;
}>();

const domesticCaptchaProvider = defineModel<CaptchaProvider>("domesticCaptchaProvider", {
  required: true
});
const overseasCaptchaProvider = defineModel<CaptchaProvider>("overseasCaptchaProvider", {
  required: true
});
const domesticAltchaDifficulty = defineModel<number>("domesticAltchaDifficulty", {
  required: true
});
const overseasAltchaDifficulty = defineModel<number>("overseasAltchaDifficulty", {
  required: true
});
</script>

<template>
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
        <Input
          v-model.number="domesticAltchaDifficulty"
          class="h-10"
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
        <Input
          v-model.number="overseasAltchaDifficulty"
          class="h-10"
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
</template>
