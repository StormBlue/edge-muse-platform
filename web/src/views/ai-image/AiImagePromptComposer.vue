<script setup lang="ts">
import { Copy, RotateCcw, Sparkles, Trash2, WandSparkles } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import AiImageReferenceInput from "./AiImageReferenceInput.vue";
import GenerationSizeSelector from "@/components/generation/GenerationSizeSelector.vue";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PromptCaseMode } from "@/types/promptCases";
import type { SizeOption } from "@/views/workspace/workspaceOptions";

type PreviewImage = {
  file: File;
  url: string;
};

defineProps<{
  canAcceptReferenceFiles: boolean;
  canResetPrompt: boolean;
  hasPrompt: boolean;
  hasRunningTask: boolean;
  interactionLocked: boolean;
  mode: PromptCaseMode;
  prompt: string;
  previews: PreviewImage[];
  selectedCaseTitle: string;
  size: string;
  sizeFallbackNotice: string;
  sizeOptions: SizeOption[];
  submitDisabled: boolean;
  supportedModes: PromptCaseMode[];
  assistantEnabled: boolean;
  workflowExpanded: boolean;
}>();

const referenceDescription = defineModel<string>("referenceDescription", { required: true });
const emit = defineEmits<{
  addFiles: [files: File[]];
  clearPrompt: [];
  copyPrompt: [];
  openAssistant: [];
  removeFile: [index: number];
  resetPrompt: [];
  submit: [];
  "update:mode": [value: PromptCaseMode];
  "update:prompt": [value: string];
  "update:size": [value: string];
}>();

const { t } = useI18n();

function onPromptInput(event: Event) {
  emit("update:prompt", (event.target as HTMLTextAreaElement).value);
}

function updateMode(value: string | number) {
  if (value === "image2image" || value === "text2image") emit("update:mode", value);
}
</script>

<template>
  <section class="prompt-compose-panel panel">
    <div class="prompt-compose-header">
      <h2 class="truncate text-sm font-semibold">{{ selectedCaseTitle }}</h2>
      <Tabs :model-value="mode" @update:model-value="updateMode">
        <TabsList class="shrink-0">
          <TabsTrigger
            v-for="item in supportedModes"
            :key="item"
            :value="item"
            :disabled="interactionLocked"
          >
            {{ t(`workspace.${item}`) }}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
    <div class="prompt-compose-body thin-scrollbar">
      <p
        v-if="sizeFallbackNotice"
        class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100"
      >
        {{ sizeFallbackNotice }}
      </p>

      <div>
        <p class="mb-2 text-xs font-medium text-muted-foreground">
          {{ t("workspace.canvasSize") }}
        </p>
        <GenerationSizeSelector
          :model-value="size"
          :options="sizeOptions"
          :disabled="interactionLocked"
          @update:model-value="emit('update:size', $event)"
        />
      </div>

      <AiImageReferenceInput
        v-if="mode === 'image2image'"
        v-model:description="referenceDescription"
        class="prompt-compose-reference"
        :can-accept-files="canAcceptReferenceFiles"
        :previews="previews"
        @add-files="emit('addFiles', $event)"
        @remove-file="emit('removeFile', $event)"
      />

      <label class="prompt-compose-field">
        <textarea
          class="ui-field prompt-compose-textarea resize-none p-3 text-sm leading-6"
          :aria-label="t('workspace.prompt')"
          :placeholder="t('aiImage.promptPlaceholder')"
          :value="prompt"
          :disabled="interactionLocked"
          @input="onPromptInput"
        />
      </label>

      <button
        v-if="assistantEnabled && (hasPrompt || workflowExpanded)"
        class="assistant-open-inline ui-button ui-button-secondary h-9 text-xs"
        type="button"
        :disabled="interactionLocked"
        @click="emit('openAssistant')"
      >
        <WandSparkles class="h-3.5 w-3.5" />
        {{ t("aiImage.openAssistant") }}
      </button>
    </div>

    <div class="prompt-compose-footer">
      <div class="flex gap-2">
        <button
          v-if="canResetPrompt"
          class="ui-button ui-button-secondary"
          type="button"
          :disabled="interactionLocked"
          @click="emit('resetPrompt')"
        >
          <RotateCcw class="h-4 w-4" />
          {{ t("aiImage.resetPrompt") }}
        </button>
        <button
          class="ui-button ui-button-secondary"
          type="button"
          :disabled="interactionLocked || !hasPrompt"
          @click="emit('copyPrompt')"
        >
          <Copy class="h-4 w-4" />
          {{ t("promptCases.copyPrompt") }}
        </button>
        <button
          class="ui-button ui-button-secondary"
          type="button"
          :disabled="interactionLocked || !hasPrompt"
          @click="emit('clearPrompt')"
        >
          <Trash2 class="h-4 w-4" />
          {{ t("aiImage.clearPrompt") }}
        </button>
      </div>
      <button
        class="ui-button ui-button-primary"
        type="button"
        :disabled="submitDisabled"
        @click="emit('submit')"
      >
        <Sparkles class="h-4 w-4" />
        {{ hasRunningTask ? t("workspace.generationRunning") : t("aiImage.oneClickGenerate") }}
      </button>
    </div>
  </section>
</template>
<style scoped>
.prompt-compose-panel {
  grid-area: composer;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.prompt-compose-header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding: 0.75rem 1rem;
}

.prompt-compose-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding: 1rem;
}

.prompt-compose-field {
  display: flex;
  min-height: 12rem;
  flex: 1;
  flex-direction: column;
}

.prompt-compose-reference {
  flex: 0 0 auto;
}

.prompt-compose-textarea {
  min-height: 0;
  flex: 1;
}

.prompt-compose-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  border-top: 1px solid var(--border);
  padding: 1rem;
}

:global(.ai-prompt-workspace--expanded) .assistant-open-inline {
  display: none;
}

@media (max-width: 767px) {
  :global(.ai-prompt-workspace--expanded) .assistant-open-inline {
    display: inline-flex;
  }
}
</style>
