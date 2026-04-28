<script setup lang="ts">
/**
 * 移动端案例详情 bottom sheet。
 *
 * 桌面端继续使用中间栏；移动端通过 sheet 展示详情，避免案例内容把生成面板挤到很远。
 */
import { X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import PromptCaseDetail from "./PromptCaseDetail.vue";
import type { PromptCase } from "@/types/promptCases";

defineProps<{
  open: boolean;
  item: PromptCase | null;
}>();

const emit = defineEmits<{
  close: [];
  apply: [item: PromptCase];
}>();

const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <Transition name="case-sheet">
      <div
        v-if="open && item"
        class="fixed inset-0 z-50 bg-black/45 xl:hidden"
        role="dialog"
        aria-modal="true"
        @click.self="emit('close')"
      >
        <div
          class="absolute bottom-0 left-0 right-0 max-h-[86dvh] overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl"
        >
          <div class="border-b border-border px-4 pb-3 pt-2">
            <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-xs font-medium text-muted-foreground">
                  {{ t("aiImage.caseDetail") }}
                </p>
                <h2 class="truncate text-base font-semibold">{{ item.title }}</h2>
              </div>
              <button
                class="ui-button ui-button-secondary ui-icon-button shrink-0"
                type="button"
                :aria-label="t('common.close')"
                @click="emit('close')"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>
          <PromptCaseDetail
            :item="item"
            variant="sheet"
            @apply="(caseItem) => emit('apply', caseItem)"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.case-sheet-enter-active,
.case-sheet-leave-active {
  transition: opacity 160ms ease;
}

.case-sheet-enter-active > div,
.case-sheet-leave-active > div {
  transition: transform 180ms ease;
}

.case-sheet-enter-from,
.case-sheet-leave-to {
  opacity: 0;
}

.case-sheet-enter-from > div,
.case-sheet-leave-to > div {
  transform: translateY(1.5rem);
}
</style>
