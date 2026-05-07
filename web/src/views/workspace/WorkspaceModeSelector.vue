<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionMode } from "@/stores/session";
import type { ModeOption } from "./workspaceOptions";

defineProps<{
  activeMode: SessionMode;
  modeOptions: ModeOption[];
  disabled: boolean;
  draftTitle: string;
  sessionTitle: string;
  canEditTitle: boolean;
  submitting: boolean;
}>();

const emit = defineEmits<{
  select: [mode: SessionMode];
  "update:draftTitle": [value: string];
}>();

const { t } = useI18n();

function updateDraftTitle(event: Event) {
  emit("update:draftTitle", (event.target as HTMLInputElement).value);
}

function updateMode(value: string | number) {
  if (value === "image2image" || value === "text2image") emit("select", value);
}
</script>

<template>
  <section class="panel p-2.5 sm:p-3">
    <div class="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
      <div class="min-w-0 xl:w-72">
        <label v-if="canEditTitle" class="block">
          <span class="sr-only">{{ t("workspace.sessionTitle") }}</span>
          <input
            class="ui-field h-10 px-3 text-sm font-medium"
            maxlength="80"
            :placeholder="t('workspace.sessionTitlePlaceholder')"
            :value="draftTitle"
            :disabled="submitting"
            @input="updateDraftTitle"
          />
        </label>
        <p v-else class="truncate px-1 text-sm font-semibold leading-10">
          {{ sessionTitle }}
        </p>
      </div>
      <Tabs class="min-w-0" :model-value="activeMode" @update:model-value="updateMode">
        <TabsList
          class="grid h-10 w-full xl:w-auto"
          :class="modeOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'"
        >
          <TabsTrigger
            v-for="option in modeOptions"
            :key="option.value"
            class="h-8 min-w-0 gap-2 px-3 text-sm"
            :value="option.value"
            :disabled="disabled"
          >
            <component :is="option.icon" class="h-4 w-4 shrink-0" />
            <span class="truncate">{{ option.label }}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  </section>
</template>
