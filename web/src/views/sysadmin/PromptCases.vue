<script setup lang="ts">
/**
 * 系统管理员案例管理页。
 *
 * 页面负责装配筛选区、列表、预览、编辑器和导入弹层；复杂状态流转收口在控制器。
 */
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import {
  Archive,
  EyeOff,
  Plus,
  RefreshCw,
  Star,
  StarOff,
  Upload,
  WandSparkles,
  X
} from "@lucide/vue";
import AppShell from "@/components/layout/AppShell.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import PromptCaseEditor from "./PromptCaseEditor.vue";
import PromptCaseImportDialog from "./PromptCaseImportDialog.vue";
import PromptCasePreview from "./PromptCasePreview.vue";
import PromptCaseTable from "./PromptCaseTable.vue";
import { usePromptCasesAdmin } from "./usePromptCasesAdmin";
import {
  emptyPromptCaseForm,
  PROMPT_CASE_LOCALES,
  PROMPT_CASE_MODES,
  PROMPT_CASE_STATUSES
} from "@/types/promptCases";

const { t } = useI18n();
const admin = usePromptCasesAdmin();

const editorInitial = computed(() =>
  admin.editing.value ? admin.promptCaseToForm(admin.editing.value) : emptyPromptCaseForm()
);

const editorTitle = computed(() =>
  admin.editing.value ? t("promptCases.editCase") : t("promptCases.createCase")
);

const ALL_STATUSES_VALUE = "__all_statuses__";
const ALL_MODES_VALUE = "__all_modes__";
const ALL_LOCALES_VALUE = "__all_locales__";
const ALL_SOURCES_VALUE = "__all_sources__";
const ALL_FEATURED_VALUE = "__all_featured__";

const statusSelectValue = computed({
  get: () => admin.filters.value.status || ALL_STATUSES_VALUE,
  set: (value: string) => {
    admin.filters.value.status =
      value === ALL_STATUSES_VALUE ? "" : (value as (typeof PROMPT_CASE_STATUSES)[number]);
  }
});
const modeSelectValue = computed({
  get: () => admin.filters.value.mode || ALL_MODES_VALUE,
  set: (value: string) => {
    admin.filters.value.mode =
      value === ALL_MODES_VALUE ? "" : (value as (typeof PROMPT_CASE_MODES)[number]);
  }
});
const localeSelectValue = computed({
  get: () => admin.filters.value.locale || ALL_LOCALES_VALUE,
  set: (value: string) => {
    admin.filters.value.locale =
      value === ALL_LOCALES_VALUE ? "" : (value as (typeof PROMPT_CASE_LOCALES)[number]);
  }
});
const sourceSelectValue = computed({
  get: () => admin.filters.value.source || ALL_SOURCES_VALUE,
  set: (value: string) => {
    admin.filters.value.source =
      value === ALL_SOURCES_VALUE ? "" : (value as "external" | "internal");
  }
});
const featuredSelectValue = computed({
  get: () => admin.filters.value.featured || ALL_FEATURED_VALUE,
  set: (value: string) => {
    admin.filters.value.featured = value === ALL_FEATURED_VALUE ? "" : (value as "0" | "1");
  }
});

onMounted(admin.load);
</script>

<template>
  <AppShell>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">{{ t("nav.promptCases") }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ t("promptCases.adminSubtitle") }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" type="button" @click="admin.load">
          <RefreshCw class="h-4 w-4" />
          {{ t("sysadmin.refreshList") }}
        </Button>
        <Button variant="secondary" type="button" @click="admin.openImport">
          <Upload class="h-4 w-4" />
          {{ t("promptCases.importJson") }}
        </Button>
        <Button type="button" @click="admin.openCreate">
          <Plus class="h-4 w-4" />
          {{ t("promptCases.createCase") }}
        </Button>
      </div>
    </div>

    <form
      class="panel mb-4 grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-8"
      @submit.prevent="admin.load"
    >
      <Input
        v-model="admin.filters.value.search"
        class="h-10 px-3 md:col-span-2 xl:col-span-2"
        :placeholder="t('promptCases.searchPlaceholder')"
      />
      <Input
        v-model="admin.filters.value.category"
        class="h-10 px-3"
        list="prompt-case-categories"
        :placeholder="t('promptCases.category')"
      />
      <datalist id="prompt-case-categories">
        <option v-for="category in admin.categories.value" :key="category" :value="category" />
      </datalist>
      <Select v-model="statusSelectValue" @update:model-value="admin.load">
        <SelectTrigger class="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_STATUSES_VALUE">{{ t("promptCases.allStatuses") }}</SelectItem>
          <SelectItem v-for="status in PROMPT_CASE_STATUSES" :key="status" :value="status">
            {{ t(`promptCases.status.${status}`) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="modeSelectValue" @update:model-value="admin.load">
        <SelectTrigger class="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_MODES_VALUE">{{ t("promptCases.allModes") }}</SelectItem>
          <SelectItem v-for="mode in PROMPT_CASE_MODES" :key="mode" :value="mode">
            {{ t(`workspace.${mode}`) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="localeSelectValue" @update:model-value="admin.load">
        <SelectTrigger class="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_LOCALES_VALUE">{{ t("promptCases.allLocales") }}</SelectItem>
          <SelectItem v-for="locale in PROMPT_CASE_LOCALES" :key="locale" :value="locale">
            {{ locale }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="sourceSelectValue" @update:model-value="admin.load">
        <SelectTrigger class="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_SOURCES_VALUE">{{ t("promptCases.allSources") }}</SelectItem>
          <SelectItem value="external">{{ t("promptCases.externalSource") }}</SelectItem>
          <SelectItem value="internal">{{ t("promptCases.internalSource") }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="featuredSelectValue" @update:model-value="admin.load">
        <SelectTrigger class="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_FEATURED_VALUE">{{ t("promptCases.allFeatured") }}</SelectItem>
          <SelectItem value="1">{{ t("promptCases.featured") }}</SelectItem>
          <SelectItem value="0">{{ t("promptCases.notFeatured") }}</SelectItem>
        </SelectContent>
      </Select>
      <div class="flex gap-2 md:col-span-3 xl:col-span-8">
        <Button type="submit">{{ t("common.search") }}</Button>
        <Button variant="secondary" type="button" @click="admin.resetFilters">
          {{ t("promptCases.resetFilters") }}
        </Button>
      </div>
    </form>

    <div
      v-if="admin.selectedCount.value"
      class="panel mb-4 flex flex-wrap items-center gap-2 p-3 text-sm"
    >
      <span class="mr-1 text-muted-foreground">
        {{ t("promptCases.bulkSelected", { count: admin.selectedCount.value }) }}
      </span>
      <Button
        class="h-8 text-xs"
        variant="secondary"
        type="button"
        :disabled="admin.saving.value"
        @click="admin.bulkChangeStatus('published')"
      >
        <WandSparkles class="h-3.5 w-3.5" />
        {{ t("promptCases.publish") }}
      </Button>
      <Button
        class="h-8 text-xs"
        variant="secondary"
        type="button"
        :disabled="admin.saving.value"
        @click="admin.bulkChangeStatus('hidden')"
      >
        <EyeOff class="h-3.5 w-3.5" />
        {{ t("promptCases.hide") }}
      </Button>
      <Button
        class="h-8 text-xs text-destructive"
        variant="secondary"
        type="button"
        :disabled="admin.saving.value"
        @click="admin.bulkChangeStatus('archived')"
      >
        <Archive class="h-3.5 w-3.5" />
        {{ t("promptCases.archive") }}
      </Button>
      <Button
        class="h-8 text-xs"
        variant="secondary"
        type="button"
        :disabled="admin.saving.value"
        @click="admin.bulkSetFeatured(true)"
      >
        <Star class="h-3.5 w-3.5" />
        {{ t("promptCases.feature") }}
      </Button>
      <Button
        class="h-8 text-xs"
        variant="secondary"
        type="button"
        :disabled="admin.saving.value"
        @click="admin.bulkSetFeatured(false)"
      >
        <StarOff class="h-3.5 w-3.5" />
        {{ t("promptCases.unfeature") }}
      </Button>
      <div class="flex min-w-[14rem] flex-1 gap-2">
        <Input
          v-model="admin.bulkCategory.value"
          class="h-8 min-w-0 flex-1 px-3 text-xs"
          list="prompt-case-categories"
          :placeholder="t('promptCases.bulkCategoryPlaceholder')"
        />
        <Button
          class="h-8 text-xs"
          variant="secondary"
          type="button"
          :disabled="admin.saving.value || !admin.bulkCategory.value.trim()"
          @click="admin.bulkSetCategory"
        >
          {{ t("promptCases.bulkSetCategory") }}
        </Button>
      </div>
      <Button class="h-8 text-xs" variant="ghost" type="button" @click="admin.clearSelection">
        <X class="h-3.5 w-3.5" />
        {{ t("common.cancel") }}
      </Button>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <PromptCaseTable
        v-model:selected-id="admin.selectedId.value"
        :items="admin.items.value"
        :loading="admin.loading.value"
        :selected-ids="admin.selectedIds.value"
        @change-status="admin.changeStatus"
        @edit="admin.openEdit"
        @toggle-all-visible="admin.toggleAllVisible"
        @toggle-featured="admin.toggleFeatured"
        @toggle-selected="admin.toggleSelected"
      />

      <PromptCasePreview :item="admin.selected.value" @copy-prompt="admin.copyPrompt" />
    </div>

    <PromptCaseEditor
      :initial="editorInitial"
      :open="admin.editorOpen.value"
      :saving="admin.saving.value"
      :title="editorTitle"
      @close="admin.editorOpen.value = false"
      @save="admin.save"
    />

    <PromptCaseImportDialog
      v-model:open="admin.importOpen.value"
      v-model:payload="admin.importText.value"
      v-model:source="admin.importSource.value"
      v-model:source-url="admin.importSourceUrl.value"
      :saving="admin.saving.value"
      @submit="admin.submitImport"
    />
  </AppShell>
</template>
