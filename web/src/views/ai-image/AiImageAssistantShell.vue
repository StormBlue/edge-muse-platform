<script setup lang="ts">
import { computed, ref } from "vue";
import { RotateCcw, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import PromptAssistantPanel from "./PromptAssistantPanel.vue";
import type { ProviderCapabilities } from "@/stores/auth";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";

type PreviewImage = {
  file: File;
  url: string;
};

const props = defineProps<{
  caseItem: PromptCase | null;
  disabled: boolean;
  mode: PromptCaseMode;
  provider: ProviderCapabilities | null;
  referenceCount: number;
  previews: PreviewImage[];
  referenceDescription: string;
  workflowExpanded: boolean;
}>();
const emit = defineEmits<{
  fill: [value: { prompt: string; recommendedSize: string; turnCount: number; auto?: boolean }];
  open: [];
}>();

const { t } = useI18n();
const assistantAnchor = ref<HTMLElement | null>(null);
const assistantPanelRef = ref<{ reset: () => void } | null>(null);
const assistantDialogOpen = ref(false);
const assistantOpenTrackedKeys = new Set<string>();

const referenceContextKey = computed(() =>
  [
    props.previews
      .map(({ file }) => `${file.name}:${file.type}:${file.size}:${file.lastModified}`)
      .join("|"),
    props.referenceDescription.trim()
  ].join("::")
);
const assistantOpenKey = computed(() =>
  [props.caseItem?.id ?? "", props.mode, referenceContextKey.value].join("::")
);

function openAssistantView() {
  if (props.disabled) return;
  trackAssistantOpen();
  if (!props.workflowExpanded || isMobileAssistantViewport()) {
    assistantDialogOpen.value = true;
    return;
  }
  assistantAnchor.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function trackAssistantOpen() {
  const key = assistantOpenKey.value;
  if (assistantOpenTrackedKeys.has(key)) return;
  assistantOpenTrackedKeys.add(key);
  emit("open");
}

function fillAssistantPrompt(value: {
  prompt: string;
  recommendedSize: string;
  turnCount: number;
  auto?: boolean;
}) {
  emit("fill", value);
  if (!value.auto) assistantDialogOpen.value = false;
}

function isMobileAssistantViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

defineExpose({ openAssistantView });
</script>

<template>
  <div
    ref="assistantAnchor"
    class="assistant-shell"
    :class="{ 'assistant-shell--dialog': assistantDialogOpen }"
  >
    <div class="assistant-dialog-card">
      <div class="assistant-dialog-header">
        <div class="min-w-0">
          <h3 class="truncate text-sm font-semibold">{{ t("aiImage.assistantTitle") }}</h3>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            class="ui-button ui-button-secondary h-8 shrink-0 whitespace-nowrap text-xs"
            type="button"
            :disabled="disabled"
            @click="assistantPanelRef?.reset()"
          >
            <RotateCcw class="h-3.5 w-3.5" />
            {{ t("aiImage.restartAssistant") }}
          </button>
          <button
            class="ui-button ui-button-secondary h-8 w-8 p-0"
            type="button"
            :aria-label="t('viewer.close')"
            :disabled="disabled"
            @click="assistantDialogOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>
      <PromptAssistantPanel
        ref="assistantPanelRef"
        :case-item="caseItem"
        :chrome="assistantDialogOpen ? 'embedded' : 'panel'"
        :mode="mode"
        :provider="provider"
        :reference-count="referenceCount"
        :reference-description="referenceDescription"
        :reference-context-key="referenceContextKey"
        :disabled="disabled"
        @fill="fillAssistantPrompt"
        @open="trackAssistantOpen"
      />
    </div>
  </div>
</template>

<style scoped>
.assistant-dialog-header {
  display: none;
}

.assistant-shell {
  grid-area: assistant;
  min-width: 0;
  min-height: 0;
}

.assistant-dialog-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

:global(.ai-prompt-workspace:not(.ai-prompt-workspace--expanded)) .assistant-shell {
  display: none;
}

:global(.ai-prompt-workspace--expanded) .assistant-shell {
  height: 100%;
  min-height: 0;
}

:global(.ai-prompt-workspace--expanded) .assistant-shell {
  display: flex;
  overflow: hidden;
}

:global(.ai-prompt-workspace--expanded) .assistant-shell :deep(.prompt-assistant-panel) {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

:global(.ai-prompt-workspace--expanded) .assistant-shell :deep(.prompt-assistant-messages) {
  max-height: none;
  min-height: 0;
  flex: 1;
}

.assistant-shell--dialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid !important;
  min-width: 0;
  min-height: 0;
  place-items: center;
  padding: clamp(0.75rem, 3vw, 2rem);
  background: rgb(0 0 0 / 0.52);
}

.assistant-shell--dialog .assistant-dialog-card {
  height: min(42rem, calc(100dvh - 2rem));
  width: min(56rem, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--card);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.34);
}

.assistant-shell--dialog .assistant-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding: 0.75rem;
}

.assistant-shell--dialog :deep(.prompt-assistant-panel) {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  border-radius: 0;
}

.assistant-shell--dialog :deep(.prompt-assistant-messages) {
  max-height: none;
  min-height: 0;
  flex: 1;
}

@media (max-width: 767px) {
  .assistant-shell:not(.assistant-shell--dialog) {
    display: none;
  }
}
</style>
