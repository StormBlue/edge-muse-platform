<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Copy, Plus } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { assistantReviewMessages } from "./promptAssistantMessages";

const editablePrompt = defineModel<string>({ required: true });
const props = withDefaults(
  defineProps<{
    visible: boolean;
    disabled?: boolean;
    warnings?: string[];
    originalPrompt?: string;
    currentPrompt?: string;
  }>(),
  { originalPrompt: "", currentPrompt: "", disabled: false, warnings: () => [] }
);
const emit = defineEmits<{ copy: []; apply: []; append: [paragraphs: string[]] }>();
const { t } = useI18n({
  useScope: "local",
  messages: assistantReviewMessages,
  missingWarn: false,
  fallbackWarn: false
});
const selected = ref<number[]>([]);
const confirmationPrompt = ref<string | null>(null);
// 按用户可见的换行分段，保留原文；不推断语义或自动改写用户内容。
const paragraphs = computed(() =>
  editablePrompt.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
);
watch(editablePrompt, () => {
  selected.value = [];
  confirmationPrompt.value = null;
});
watch(
  () => props.currentPrompt,
  () => {
    confirmationPrompt.value = null;
  }
);
function apply() {
  if (props.disabled || !editablePrompt.value.trim()) return;
  // 二次确认绑定当前版本；确认期间再编辑必须重新审阅。
  if (
    props.currentPrompt !== props.originalPrompt &&
    confirmationPrompt.value !== props.currentPrompt
  ) {
    confirmationPrompt.value = props.currentPrompt;
    return;
  }
  emit("apply");
  confirmationPrompt.value = null;
}
</script>

<template>
  <section v-if="visible" class="space-y-3 border-t border-border p-3">
    <h4 class="text-sm font-semibold">{{ t("review.title") }}</h4>
    <ul v-if="warnings?.length" class="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>
    <div class="grid min-w-0 gap-3 xl:grid-cols-2">
      <div class="min-w-0">
        <p class="mb-1.5 text-xs font-medium">{{ t("review.original") }}</p>
        <p
          class="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border p-3 text-xs leading-5"
        >
          {{ originalPrompt || t("review.empty") }}
        </p>
      </div>
      <label class="block min-w-0">
        <span class="mb-1.5 block text-xs font-medium">{{ t("review.proposed") }}</span>
        <Textarea
          v-model="editablePrompt"
          data-testid="assistant-suggestion"
          class="min-h-40 resize-y p-3 text-xs leading-5"
          :disabled="disabled"
        />
      </label>
    </div>
    <div class="space-y-2">
      <label
        v-for="(paragraph, index) in paragraphs"
        :key="index"
        class="flex min-w-0 items-start gap-2 text-xs leading-5"
      >
        <input
          v-model="selected"
          type="checkbox"
          :value="index"
          :disabled="disabled"
          :aria-label="`${t('review.select')} ${index + 1}`"
          class="mt-1 shrink-0"
        />
        <span class="min-w-0 whitespace-pre-wrap break-words">{{ paragraph }}</span>
      </label>
    </div>
    <div
      v-if="confirmationPrompt !== null"
      role="alert"
      class="space-y-2 border-l-2 border-amber-500 pl-3 text-xs"
    >
      <p>{{ t("review.changed") }}</p>
      <p class="font-medium">{{ t("review.current") }}</p>
      <p class="max-h-48 overflow-y-auto whitespace-pre-wrap break-words">{{ currentPrompt }}</p>
      <Button variant="ghost" size="sm" @click="confirmationPrompt = null">
        {{ t("review.cancel") }}
      </Button>
    </div>
    <div class="flex flex-wrap justify-end gap-2">
      <Button
        variant="ghost"
        size="icon"
        :title="t('promptCases.copyPrompt')"
        :aria-label="t('promptCases.copyPrompt')"
        :disabled="disabled || !editablePrompt.trim()"
        @click="emit('copy')"
      >
        <Copy class="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        class="h-auto min-h-9 whitespace-normal text-xs"
        data-testid="append-assistant"
        :disabled="disabled || !selected.length"
        @click="
          emit(
            'append',
            paragraphs.filter((_, index) => selected.includes(index))
          )
        "
      >
        <Plus class="h-4 w-4 shrink-0" />{{ t("review.append") }}
      </Button>
      <Button
        class="h-auto min-h-9 whitespace-normal text-xs"
        data-testid="apply-assistant"
        :disabled="disabled || !editablePrompt.trim()"
        @click="apply"
      >
        <Check class="h-4 w-4 shrink-0" />{{
          t(confirmationPrompt !== null ? "review.confirm" : "review.apply")
        }}
      </Button>
    </div>
  </section>
</template>
