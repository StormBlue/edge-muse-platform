<script setup lang="ts">
/**
 * sysadmin 案例列表表格。
 *
 * 表格只负责展示与行级动作派发；实际保存、状态流转和错误处理仍由 usePromptCasesAdmin 统一收口。
 */
import { computed } from "vue";
import { Archive, EyeOff, Star, WandSparkles } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import type { PromptCase, PromptCaseStatus } from "@/types/promptCases";

const props = defineProps<{
  items: PromptCase[];
  loading: boolean;
  selectedId: string | null;
  selectedIds: Set<string>;
}>();

const emit = defineEmits<{
  changeStatus: [item: PromptCase, status: PromptCaseStatus];
  edit: [item: PromptCase];
  toggleAllVisible: [checked: boolean];
  toggleFeatured: [item: PromptCase];
  toggleSelected: [id: string, checked: boolean];
  "update:selectedId": [value: string | null];
}>();

const { t } = useI18n();
const allVisibleSelected = computed(
  () => props.items.length > 0 && props.items.every((item) => props.selectedIds.has(item.id))
);
const someVisibleSelected = computed(
  () => props.items.some((item) => props.selectedIds.has(item.id)) && !allVisibleSelected.value
);

function rowClass(item: PromptCase) {
  return item.id === props.selectedId ? "bg-muted/60" : "";
}

function statusTone(status: PromptCase["status"]) {
  if (status === "published") return "bg-primary/15 text-primary";
  if (status === "hidden") return "bg-muted text-muted-foreground";
  if (status === "archived") return "bg-destructive/10 text-destructive";
  return "bg-accent/20 text-foreground";
}
</script>

<template>
  <div class="panel overflow-hidden">
    <div class="thin-scrollbar max-h-[calc(100vh-18rem)] overflow-auto">
      <table class="w-full min-w-[72rem] text-sm">
        <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
          <tr>
            <th class="w-10 p-3">
              <input
                :checked="allVisibleSelected"
                :disabled="loading || !items.length"
                :indeterminate="someVisibleSelected"
                type="checkbox"
                @change="emit('toggleAllVisible', ($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th class="p-3">{{ t("promptCases.case") }}</th>
            <th class="p-3">{{ t("promptCases.category") }}</th>
            <th class="p-3">{{ t("promptCases.modes") }}</th>
            <th class="p-3">{{ t("promptCases.recommendedSize") }}</th>
            <th class="p-3">{{ t("adminUsers.status") }}</th>
            <th class="p-3">{{ t("promptCases.source") }}</th>
            <th class="p-3">{{ t("promptCases.sortOrder") }}</th>
            <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading" class="border-t border-border">
            <td class="p-4 text-center text-muted-foreground" colspan="9">
              {{ t("common.loading") }}
            </td>
          </tr>
          <tr v-else-if="!items.length" class="border-t border-border">
            <td class="p-4 text-center text-muted-foreground" colspan="9">
              {{ t("promptCases.noCases") }}
            </td>
          </tr>
          <template v-else>
            <tr
              v-for="item in items"
              :key="item.id"
              class="border-t border-border transition hover:bg-muted/40"
              :class="rowClass(item)"
              @click="emit('update:selectedId', item.id)"
            >
              <td class="p-3" @click.stop>
                <input
                  :checked="selectedIds.has(item.id)"
                  type="checkbox"
                  @change="
                    emit('toggleSelected', item.id, ($event.target as HTMLInputElement).checked)
                  "
                />
              </td>
              <td class="max-w-sm p-3">
                <div class="flex items-start gap-3">
                  <div
                    class="h-14 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <img
                      v-if="item.thumbnailUrl"
                      class="h-full w-full object-contain"
                      :src="item.thumbnailUrl"
                      :alt="item.title"
                    />
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-medium">{{ item.title }}</p>
                    <p class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {{ item.promptSummary }}
                    </p>
                  </div>
                </div>
              </td>
              <td class="p-3">{{ item.category }}</td>
              <td class="p-3">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="mode in item.modes"
                    :key="mode"
                    class="rounded-full bg-muted px-2 py-1 text-xs"
                  >
                    {{ t(`workspace.${mode}`) }}
                  </span>
                </div>
              </td>
              <td class="p-3">{{ item.recommendedSize }}</td>
              <td class="p-3">
                <span class="rounded-full px-2 py-1 text-xs" :class="statusTone(item.status)">
                  {{ t(`promptCases.status.${item.status}`) }}
                </span>
              </td>
              <td class="max-w-[12rem] truncate p-3">
                {{ item.sourceAuthor || item.sourceRepo || item.sourceLicense }}
              </td>
              <td class="p-3 font-mono">{{ item.sortOrder }}</td>
              <td class="space-x-2 whitespace-nowrap p-3 text-right" @click.stop>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="emit('edit', item)"
                >
                  {{ t("sysadmin.edit") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="emit('toggleFeatured', item)"
                >
                  <Star class="h-3.5 w-3.5" />
                  {{ item.featured ? t("promptCases.unfeature") : t("promptCases.feature") }}
                </button>
                <button
                  v-if="item.status !== 'published'"
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="emit('changeStatus', item, 'published')"
                >
                  <WandSparkles class="h-3.5 w-3.5" />
                  {{ t("promptCases.publish") }}
                </button>
                <button
                  v-if="item.status !== 'hidden'"
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="emit('changeStatus', item, 'hidden')"
                >
                  <EyeOff class="h-3.5 w-3.5" />
                  {{ t("promptCases.hide") }}
                </button>
                <button
                  v-if="item.status !== 'archived'"
                  class="ui-button ui-button-secondary h-8 text-xs text-destructive"
                  type="button"
                  @click="emit('changeStatus', item, 'archived')"
                >
                  <Archive class="h-3.5 w-3.5" />
                  {{ t("promptCases.archive") }}
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
