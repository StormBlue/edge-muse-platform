<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { PromptAssistantModelOption } from "./preferencesTypes";

defineProps<{
  loading: boolean;
  modelSourceLabel: string;
  modelUpdatedAt: string;
  promptAssistantModelOptions: PromptAssistantModelOption[];
  saving: boolean;
  selectedModelDescription: string;
  t: (key: string) => string;
}>();

const promptAssistantModel = defineModel<string>("promptAssistantModel", { required: true });
</script>

<template>
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
</template>
