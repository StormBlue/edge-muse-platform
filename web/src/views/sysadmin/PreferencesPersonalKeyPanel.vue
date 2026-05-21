<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { NO_PROVIDER_KEY_VALUE, type ProviderKeyRow } from "./preferencesTypes";

defineProps<{
  keys: ProviderKeyRow[];
  loading: boolean;
  saving: boolean;
  t: (key: string) => string;
}>();

const preferredProviderKeySelectValue = defineModel<string>("preferredProviderKeySelectValue", {
  required: true
});
</script>

<template>
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
          <SelectItem :value="NO_PROVIDER_KEY_VALUE">{{ t("sysadmin.selectKey") }}</SelectItem>
          <SelectItem v-for="key in keys" :key="key.id" :value="key.id">
            {{ key.label }} ({{ key.keyHint }})
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
  </section>
</template>
