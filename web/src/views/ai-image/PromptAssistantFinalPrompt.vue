<script setup lang="ts">
/**
 * AI 助手最终 Prompt 确认区。
 *
 * 助手整理出的最终 prompt 会自动同步到生成面板，这里只负责确认和复制。
 */
import { Copy } from "@lucide/vue";
import { useI18n } from "vue-i18n";

const editablePrompt = defineModel<string>({ required: true });

defineProps<{
  visible: boolean;
  disabled?: boolean;
  warnings?: string[];
}>();

const emit = defineEmits<{
  copy: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div v-if="visible" class="space-y-3 border-t border-border p-3">
    <div>
      <p class="text-sm font-semibold">{{ t("aiImage.assistantReadyTitle") }}</p>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        {{ t("aiImage.assistantReadyBody") }}
      </p>
      <ul
        v-if="warnings?.length"
        class="mt-2 list-disc space-y-1 rounded-lg border border-border bg-muted/35 px-3 py-2 pl-7 text-xs leading-5 text-muted-foreground"
      >
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("aiImage.assistantFinalPromptLabel") }}
      </span>
      <textarea
        v-model="editablePrompt"
        class="ui-field min-h-36 resize-y p-3 text-xs leading-5"
        spellcheck="false"
        readonly
        :disabled="disabled"
      />
    </label>
    <div class="flex flex-wrap justify-end gap-2">
      <button
        class="ui-button ui-button-secondary h-8 text-xs"
        type="button"
        :disabled="disabled"
        @click="emit('copy')"
      >
        <Copy class="h-3.5 w-3.5" />
        {{ t("promptCases.copyPrompt") }}
      </button>
    </div>
  </div>
</template>
