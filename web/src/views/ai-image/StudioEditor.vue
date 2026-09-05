<script setup lang="ts">
import { ref } from "vue";
import {
  ArrowUpRight,
  Copy,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import PromptAssistantPanel from "./PromptAssistantPanel.vue";
import { imageFilesFromDataTransfer, imageFilesFromFileList } from "@/utils/referenceImageFiles";
import { useImageStudioContext } from "./studioContext";
import { toast } from "vue-sonner";

// 控制器由页面统一创建，编辑页签切换仅隐藏面板，不销毁正在进行的助手请求。
const s = useImageStudioContext();
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
function onTabKeydown(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next =
    !s.auth.promptAssistantEnabled || event.key === "Home"
      ? "editor"
      : event.key === "End"
        ? "assistant"
        : s.editorTab.value === "editor"
          ? "assistant"
          : "editor";
  s.editorTab.value = next;
  document.getElementById(`studio-${next}-tab`)?.focus();
}
function addFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  void s.addFiles(imageFilesFromFileList(input.files));
  input.value = "";
}
function onPaste(event: ClipboardEvent) {
  if (s.mode.value !== "image2image" || s.submitting.value) return;
  const files = imageFilesFromDataTransfer(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  void s.addFiles(files);
}
function onDrop(event: DragEvent) {
  dragging.value = false;
  void s.addFiles(imageFilesFromDataTransfer(event.dataTransfer));
}
async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(s.prompt.value);
    toast.success(s.t("viewer.promptCopied"));
  } catch {
    toast.error(s.t("studio.requestFailed"));
  }
}
</script>

<template>
  <section class="studio-editor" :aria-label="s.t('studio.create')" @paste="onPaste">
    <div
      class="studio-editor-tabs"
      role="tablist"
      :aria-label="s.t('studio.create')"
      @keydown="onTabKeydown"
    >
      <button
        id="studio-editor-tab"
        role="tab"
        type="button"
        :aria-selected="s.editorTab.value === 'editor'"
        :tabindex="s.editorTab.value === 'editor' ? 0 : -1"
        aria-controls="studio-editor-fields"
        @click="s.editorTab.value = 'editor'"
      >
        {{ s.t("studio.editor") }}
      </button>
      <button
        v-if="s.auth.promptAssistantEnabled"
        id="studio-assistant-tab"
        role="tab"
        type="button"
        :aria-selected="s.editorTab.value === 'assistant'"
        :tabindex="s.editorTab.value === 'assistant' ? 0 : -1"
        aria-controls="studio-assistant-fields"
        @click="s.editorTab.value = 'assistant'"
      >
        <Sparkles class="size-4" />{{ s.t("studio.assistant") }}
      </button>
    </div>
    <div class="studio-editor-scroll thin-scrollbar">
      <div
        v-show="s.editorTab.value === 'editor'"
        id="studio-editor-fields"
        role="tabpanel"
        aria-labelledby="studio-editor-tab"
        class="studio-fields"
      >
        <fieldset :disabled="s.submitting.value || s.loadingTask.value" class="space-y-5 min-w-0">
          <div class="studio-mode" role="group" :aria-label="s.t('workspace.generationMode')">
            <button
              v-for="mode in s.supportedModes.value"
              :key="mode"
              type="button"
              :aria-pressed="s.mode.value === mode"
              @click="s.mode.value = mode"
            >
              {{ s.t(`workspace.${mode}`) }}
            </button>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <label for="studio-prompt" class="text-xs font-medium">{{
                s.t("studio.prompt")
              }}</label>
              <div class="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="s.undoPrompt.value === null"
                  :title="s.t('studio.undo')"
                  :aria-label="s.t('studio.undo')"
                  @click="s.undo"
                >
                  <RotateCcw class="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="!s.prompt.value"
                  :title="s.t('studio.copy')"
                  :aria-label="s.t('studio.copy')"
                  @click="copyPrompt"
                >
                  <Copy class="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="!s.prompt.value"
                  :title="s.t('studio.clear')"
                  :aria-label="s.t('studio.clear')"
                  @click="s.replacePrompt('')"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>
            <Textarea
              id="studio-prompt"
              v-model="s.prompt.value"
              data-testid="studio-prompt"
              class="studio-prompt"
              :placeholder="s.t('studio.promptPlaceholder')"
              :aria-invalid="s.prompt.value.length > 4000"
            />
            <p
              class="text-right text-xs tabular-nums"
              :class="s.prompt.value.length > 4000 ? 'text-destructive' : 'text-muted-foreground'"
            >
              {{ s.prompt.value.length }} / 4000
            </p>
          </div>
          <label class="studio-field">
            <span>{{ s.t("studio.target") }}</span>
            <select v-model="s.targetId.value" data-testid="studio-target" class="studio-select">
              <option v-for="target in s.targets.value" :key="target.id" :value="target.id">
                {{ target.label }} · {{ target.providerCapabilities.model }}
              </option>
            </select>
          </label>
          <details class="studio-brief" :open="Boolean(s.briefText.value)">
            <summary>{{ s.t("studio.brief") }}</summary>
            <div class="space-y-3 pt-3">
              <label
                v-for="key in ['subject', 'purpose', 'style', 'preserve', 'changes'] as const"
                :key="key"
                class="studio-field"
              >
                <span>{{ s.t(`studio.${key}`) }}</span>
                <input
                  v-model="s.brief.value[key]"
                  type="text"
                  maxlength="500"
                  class="studio-select"
                  :placeholder="s.t(`studio.${key}Placeholder`)"
                />
              </label>
              <Button type="button" variant="secondary" class="w-full" @click="s.addBriefToPrompt">
                <Plus class="size-4" />{{ s.t("studio.composeBrief") }}
              </Button>
            </div>
          </details>
          <div v-if="s.mode.value === 'image2image'" class="space-y-2">
            <div v-if="s.missingReferences.value" class="studio-notice" role="alert">
              <p>{{ s.t("studio.referencesMissing") }}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                class="mt-2"
                @click="s.acceptCurrentReferences"
              >
                {{ s.t("studio.acceptReferences") }}
              </Button>
            </div>
            <div class="flex justify-between gap-2 text-xs">
              <span class="font-medium">{{ s.t("studio.references") }}</span><span class="text-muted-foreground">{{ s.references.value.length }} / {{ s.referenceLimit.value }}</span>
            </div>
            <div class="studio-references">
              <div
                v-for="(reference, index) in s.references.value"
                :key="reference.key"
                class="studio-reference"
              >
                <button
                  type="button"
                  :title="s.t('studio.previewReference')"
                  :aria-label="`${s.t('studio.previewReference')} ${index + 1}`"
                  @click="
                    s.viewerImage.value = reference.image ?? {
                      id: reference.key,
                      url: reference.url,
                      mime: reference.file?.type ?? 'image/png',
                      byteSize: reference.file?.size ?? 0,
                      displayName: reference.name
                    }
                  "
                >
                  <img :src="reference.url" :alt="reference.name" />
                </button>
                <button
                  type="button"
                  class="studio-reference-remove"
                  :title="s.t('studio.removeReference')"
                  :aria-label="`${s.t('studio.removeReference')} ${index + 1}`"
                  @click="s.removeReference(index)"
                >
                  <X class="size-3.5" />
                </button>
              </div>
              <button
                v-if="s.references.value.length < s.referenceLimit.value"
                type="button"
                class="studio-upload"
                :class="{ 'studio-upload--dragging': dragging }"
                :disabled="s.preparingReferences.value"
                :title="s.t('studio.addReference')"
                :aria-label="s.t('studio.addReference')"
                @click="fileInput?.click()"
                @dragover.prevent="dragging = true"
                @dragleave.prevent="dragging = false"
                @drop.prevent="onDrop"
              >
                <Loader2 v-if="s.preparingReferences.value" class="size-5 animate-spin" /><ImagePlus
                  v-else
                  class="size-5"
                /><span>{{ s.t("studio.addReference") }}</span>
              </button>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              class="sr-only"
              tabindex="-1"
              :aria-label="s.t('studio.addReference')"
              @change="addFiles"
            />
          </div>
          <div class="studio-settings">
            <label class="studio-field"><span>{{ s.t("studio.size") }}</span><select v-model="s.size.value" class="studio-select" data-testid="studio-size">
              <option
                v-for="option in s.sizeOptions.value"
                :key="option.value"
                :value="option.value"
              >
                {{
                  option.ratio === option.label
                    ? option.label
                    : `${option.ratio} · ${option.label}`
                }}
              </option>
            </select></label>
            <label class="studio-field"><span>{{ s.t("studio.count") }}</span><input
              v-model.number="s.count.value"
              class="studio-select"
              type="number"
              min="1"
              :max="s.imageLimit.value"
              step="1"
              data-testid="studio-count"
            /></label>
          </div>
          <p v-if="s.notice.value" role="status" class="studio-notice">{{ s.notice.value }}</p>
        </fieldset>
      </div>
      <div
        v-if="s.auth.promptAssistantEnabled"
        v-show="s.editorTab.value === 'assistant'"
        id="studio-assistant-fields"
        role="tabpanel"
        aria-labelledby="studio-assistant-tab"
        class="studio-assistant"
      >
        <PromptAssistantPanel
          :case-item="s.activeCase.value"
          :current-prompt="s.prompt.value"
          :creative-brief="s.briefText.value"
          :account-context-key="s.auth.user?.id ?? ''"
          :mode="s.mode.value"
          :provider="s.provider.value"
          :reference-count="s.mode.value === 'image2image' ? s.references.value.length : 0"
          :reference-description="s.referenceDescription.value"
          :reference-context-key="s.referenceContextKey.value"
          :disabled="s.submitting.value || s.loadingTask.value"
          chrome="embedded"
          @fill="s.applyAssistant"
        />
      </div>
    </div>
    <div class="studio-submit">
      <p v-if="s.error.value" class="text-xs text-destructive break-words" role="alert">
        {{ s.error.value }}
      </p>
      <p
        v-if="s.issueMessage.value && s.prompt.value"
        class="text-xs text-destructive"
        role="status"
      >
        {{ s.issueMessage.value }}
      </p>
      <Button
        type="button"
        class="studio-generate"
        :disabled="!s.canSubmit.value"
        data-testid="studio-generate"
        @click="s.submit"
      >
        <Loader2 v-if="s.submitting.value" class="size-4 animate-spin" /><ArrowUpRight
          v-else
          class="size-4"
        />{{ s.t(s.submitting.value ? `studio.${s.submitPhase.value}` : "studio.generate") }}
      </Button>
      <div class="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
        <span>{{ s.t("studio.precharge", { count: s.count.value }) }}</span><span>{{
          s.auth.quota?.remainingQuota == null
            ? s.t("studio.unlimited")
            : s.t("studio.remaining", { count: s.auth.quota.remainingQuota })
        }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.studio-editor {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--card);
}
.studio-editor-tabs {
  display: flex;
  gap: 1.25rem;
  padding: 0 1.25rem;
  border-bottom: 1px solid var(--border);
}
.studio-editor-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 3rem;
  border-bottom: 2px solid transparent;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
}
.studio-editor-tabs button[aria-selected="true"] {
  border-bottom-color: var(--accent);
  color: var(--foreground);
  font-weight: 600;
}
.studio-editor-scroll {
  min-height: 0;
  overflow-y: auto;
  flex: 1;
}
.studio-fields {
  padding: 1.25rem;
}
.studio-mode {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.25rem;
  padding: 0.25rem;
  background: var(--muted);
  border-radius: 6px;
}
.studio-mode button {
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border-radius: 4px;
}
.studio-mode button[aria-pressed="true"] {
  background: var(--card);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.09);
  font-weight: 600;
}
.studio-field {
  display: grid;
  min-width: 0;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
}
.studio-select {
  width: 100%;
  min-width: 0;
  height: 2.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  padding: 0.5rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 400;
}
.studio-prompt {
  min-height: 11rem;
  max-height: 24rem;
  resize: vertical;
  padding: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.studio-brief {
  border-block: 1px solid var(--border);
  padding-block: 0.875rem;
}
.studio-brief summary {
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
}
.studio-references {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
  gap: 0.5rem;
}
.studio-reference {
  position: relative;
  min-width: 0;
  aspect-ratio: 1;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.studio-reference > button:first-child {
  display: block;
  height: 100%;
  width: 100%;
}
.studio-reference img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.studio-reference-remove {
  position: absolute;
  right: 0.2rem;
  top: 0.2rem;
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 4px;
  color: white;
  background: rgb(0 0 0 / 0.65);
}
.studio-upload {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.375rem;
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--muted-foreground);
  font-size: 0.625rem;
}
.studio-upload--dragging {
  border-color: var(--accent);
  background: var(--muted);
}
.studio-settings {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.5rem;
  gap: 0.75rem;
}
.studio-notice {
  border-left: 2px solid var(--accent);
  padding-left: 0.625rem;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.studio-submit {
  display: grid;
  gap: 0.625rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
  background: var(--card);
}
.studio-generate {
  min-height: 2.75rem;
  width: 100%;
  border-radius: 6px;
  background: var(--foreground);
  color: var(--background);
}
.studio-assistant {
  min-height: 25rem;
}
.studio-assistant :deep(.prompt-assistant-panel) {
  box-shadow: none;
  background: transparent;
}
.studio-assistant :deep(.prompt-assistant-messages) {
  max-height: 20rem;
}
@media (prefers-reduced-motion: reduce) {
  .animate-spin {
    animation: none;
  }
}
</style>
