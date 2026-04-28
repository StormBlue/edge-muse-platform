<script setup lang="ts">
/**
 * AI 助手最终 Prompt 确认区。
 *
 * 用户可在这里手动编辑最终 prompt，再复制或回填到生成面板。
 */
import { Copy, WandSparkles } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

const editablePrompt = defineModel<string>({ required: true });

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  copy: [];
  fill: [];
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
    </div>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("aiImage.assistantFinalPromptLabel") }}
      </span>
      <textarea
        v-model="editablePrompt"
        class="ui-field min-h-36 resize-y p-3 text-xs leading-5"
        spellcheck="false"
      />
    </label>
    <div class="flex flex-wrap justify-end gap-2">
      <button class="ui-button ui-button-secondary h-8 text-xs" type="button" @click="emit('copy')">
        <Copy class="h-3.5 w-3.5" />
        {{ t("promptCases.copyPrompt") }}
      </button>
      <button class="ui-button ui-button-primary h-8 text-xs" type="button" @click="emit('fill')">
        <WandSparkles class="h-3.5 w-3.5" />
        {{ t("aiImage.fillFinalPrompt") }}
      </button>
    </div>
  </div>
</template>
