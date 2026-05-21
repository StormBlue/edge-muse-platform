<script setup lang="ts">
/**
 * 移动端案例详情 bottom sheet。
 *
 * 桌面端继续使用中间栏；移动端通过 sheet 展示详情，避免案例内容把生成面板挤到很远。
 */
import { computed } from "vue";
import { X } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBottomContent, DialogTitle } from "@/components/ui/dialog";
import PromptCaseDetail from "./PromptCaseDetail.vue";
import type { PromptCase, PromptCaseListItem } from "@/types/promptCases";

const props = withDefaults(
  defineProps<{
    open: boolean;
    item: PromptCaseListItem | PromptCase | null;
    detailItem: PromptCase | null;
    loading?: boolean;
    error?: string | null;
    applying?: boolean;
  }>(),
  { applying: false, error: null, loading: false }
);

const emit = defineEmits<{
  close: [];
  apply: [item: PromptCase];
}>();

const { t } = useI18n();
const sheetActive = computed(() => props.open && Boolean(props.item));

function updateOpen(open: boolean) {
  if (!open) emit("close");
}
</script>

<template>
  <Dialog :open="sheetActive" @update:open="updateOpen">
    <DialogBottomContent v-if="item" class="case-sheet-dialog">
      <div class="border-b border-border px-4 pb-3 pt-2">
        <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">
              {{ t("aiImage.caseDetail") }}
            </p>
            <DialogTitle class="truncate text-base font-semibold">{{ item.title }}</DialogTitle>
          </div>
          <Button
            class="shrink-0"
            variant="secondary"
            size="icon"
            type="button"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>
      <PromptCaseDetail
        :applying="applying"
        :error="error"
        :item="detailItem"
        :loading="loading"
        variant="sheet"
        @apply="(caseItem) => emit('apply', caseItem)"
      />
    </DialogBottomContent>
  </Dialog>
</template>

<style scoped>
.case-sheet-dialog {
  overscroll-behavior: contain;
  touch-action: pan-y;
}

.case-sheet-dialog :deep(.thin-scrollbar) {
  overscroll-behavior: contain;
}
</style>
