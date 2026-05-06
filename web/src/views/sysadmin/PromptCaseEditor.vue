<script setup lang="ts">
/**
 * 案例编辑弹层。
 *
 * 表单只做轻量清洗：空字符串转 null、标签按逗号/换行切分；发布归因等强规则仍以后端为准。
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { uploadSysadminPromptCaseAsset } from "@/api/promptCases";
import {
  PROMPT_CASE_LICENSES,
  PROMPT_CASE_LOCALES,
  PROMPT_CASE_MODES,
  PROMPT_CASE_STATUSES,
  type PromptCaseFormInput,
  type PromptCaseMode
} from "@/types/promptCases";
import {
  applyPromptCaseModeToggle,
  clonePromptCaseForm,
  normalizePromptCaseEditorForm
} from "./promptCaseEditorForm";

const props = defineProps<{
  open: boolean;
  initial: PromptCaseFormInput;
  saving: boolean;
  title: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [value: PromptCaseFormInput];
}>();

const { t } = useI18n();
const form = ref<PromptCaseFormInput>(clonePromptCaseForm(props.initial));
const tagsText = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const uploadingAsset = ref(false);

const externalSource = computed(
  () =>
    form.value.sourceLicense !== "internal" ||
    Boolean(form.value.sourceUrl || form.value.sourceAuthor || form.value.sourceRepo)
);

watch(
  () => [props.open, props.initial] as const,
  () => {
    if (!props.open) return;
    form.value = clonePromptCaseForm(props.initial);
    tagsText.value = props.initial.tags.join(", ");
  },
  { immediate: true }
);

watch(
  () => props.open,
  (open) => {
    if (open) uploadInput.value = null;
  }
);

function toggleMode(mode: PromptCaseMode, checked: boolean) {
  form.value.modes = applyPromptCaseModeToggle(form.value.modes, mode, checked);
}

function submit() {
  emit("save", normalizePromptCaseEditorForm(form.value, tagsText.value));
}

function setDialogOpen(open: boolean) {
  if (!open && !props.saving) emit("close");
}

function pickAssetFile() {
  if (props.saving || uploadingAsset.value) return;
  uploadInput.value?.click();
}

async function uploadAsset(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || uploadingAsset.value) return;
  uploadingAsset.value = true;
  try {
    const asset = await uploadSysadminPromptCaseAsset({
      file,
      category: form.value.category
    });
    form.value.thumbnailUrl = asset.url;
  } catch {
    toast.error(t("promptCases.uploadImageFailed"));
  } finally {
    uploadingAsset.value = false;
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="setDialogOpen">
    <DialogContent
      class="prompt-case-editor-dialog flex flex-col gap-0 overflow-hidden p-0"
      prevent-outside-close
    >
      <form class="flex min-h-0 flex-1 flex-col" :aria-busy="saving" @submit.prevent="submit">
        <DialogHeader class="shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-5">
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription class="sr-only">
            {{ t("promptCases.editorDescription") }}
          </DialogDescription>
        </DialogHeader>

        <div
          class="thin-scrollbar grid min-h-0 flex-1 auto-rows-min gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5 md:grid-cols-2"
        >
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.title") }}
            </span>
            <input v-model="form.title" class="ui-field h-10 px-3" required />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.category") }}
            </span>
            <input v-model="form.category" class="ui-field h-10 px-3" required />
          </label>

          <div class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.modes") }}
            </span>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="mode in PROMPT_CASE_MODES"
                :key="mode"
                class="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
              >
                <input
                  type="checkbox"
                  :checked="form.modes.includes(mode)"
                  @change="toggleMode(mode, ($event.target as HTMLInputElement).checked)"
                />
                {{ t(`workspace.${mode}`) }}
              </label>
            </div>
          </div>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.recommendedSize") }}
            </span>
            <input v-model="form.recommendedSize" class="ui-field h-10 px-3" required />
          </label>

          <label class="block md:col-span-2">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.tags") }}
            </span>
            <input
              v-model="tagsText"
              class="ui-field h-10 px-3"
              :placeholder="t('promptCases.tagsPlaceholder')"
            />
          </label>

          <label class="block md:col-span-2">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.summary") }}
            </span>
            <textarea v-model="form.promptSummary" class="ui-field min-h-24 p-3" required />
          </label>
          <label class="block md:col-span-2">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.promptTemplate") }}
            </span>
            <textarea v-model="form.promptTemplate" class="ui-field min-h-48 p-3" required />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.thumbnailUrl") }}
            </span>
            <div class="flex flex-col gap-2 sm:flex-row">
              <input v-model="form.thumbnailUrl" class="ui-field h-10 min-w-0 flex-1 px-3" />
              <button
                class="ui-button ui-button-secondary w-full shrink-0 sm:w-auto"
                type="button"
                :disabled="saving || uploadingAsset"
                @click="pickAssetFile"
              >
                {{
                  uploadingAsset ? t("promptCases.uploadingImage") : t("promptCases.uploadImage")
                }}
              </button>
            </div>
            <input
              ref="uploadInput"
              class="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              @change="uploadAsset"
            />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.sourceLicense") }}
            </span>
            <select v-model="form.sourceLicense" class="ui-field h-10 px-3">
              <option v-for="license in PROMPT_CASE_LICENSES" :key="license" :value="license">
                {{ license }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.sourceUrl") }}
            </span>
            <input v-model="form.sourceUrl" class="ui-field h-10 px-3" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.sourceAuthor") }}
            </span>
            <input v-model="form.sourceAuthor" class="ui-field h-10 px-3" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.sourceRepo") }}
            </span>
            <input v-model="form.sourceRepo" class="ui-field h-10 px-3" />
          </label>
          <div
            class="rounded-lg border border-border bg-muted/35 p-3 text-xs text-muted-foreground"
          >
            {{
              externalSource
                ? t("promptCases.externalAttributionHint")
                : t("promptCases.internalAttributionHint")
            }}
          </div>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("adminUsers.status") }}
            </span>
            <select v-model="form.status" class="ui-field h-10 px-3">
              <option v-for="status in PROMPT_CASE_STATUSES" :key="status" :value="status">
                {{ t(`promptCases.status.${status}`) }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.locale") }}
            </span>
            <select v-model="form.locale" class="ui-field h-10 px-3">
              <option v-for="locale in PROMPT_CASE_LOCALES" :key="locale" :value="locale">
                {{ locale }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.sortOrder") }}
            </span>
            <input
              v-model.number="form.sortOrder"
              class="ui-field h-10 px-3"
              min="0"
              type="number"
            />
          </label>
          <label class="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <input v-model="form.featured" type="checkbox" />
            {{ t("promptCases.featured") }}
          </label>
        </div>

        <DialogFooter class="shrink-0 border-t border-border px-4 py-3 sm:px-5 sm:py-4">
          <DialogClose as-child>
            <button
              class="ui-button ui-button-secondary w-full sm:w-auto"
              type="button"
              :disabled="saving"
            >
              {{ t("common.cancel") }}
            </button>
          </DialogClose>
          <button
            class="ui-button ui-button-primary w-full sm:w-auto"
            type="submit"
            :disabled="saving"
          >
            {{ t("common.save") }}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
:global(.prompt-case-editor-dialog) {
  display: flex;
  width: calc(100vw - 1rem);
  max-width: calc(100vw - 1rem);
  height: calc(100dvh - 1rem);
  max-height: calc(100dvh - 1rem);
}

@media (min-width: 640px) {
  :global(.prompt-case-editor-dialog) {
    width: min(72rem, calc(100vw - 2rem));
    max-width: calc(100vw - 2rem);
    height: min(92dvh, 56rem);
    max-height: calc(100dvh - 2rem);
  }
}
</style>
