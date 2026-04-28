<script setup lang="ts">
/**
 * 系统管理员案例管理页。
 *
 * 页面负责装配筛选区、列表、预览、编辑器和导入弹层；复杂状态流转收口在控制器。
 */
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, RefreshCw, Upload } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
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
        <button class="ui-button ui-button-secondary" type="button" @click="admin.load">
          <RefreshCw class="h-4 w-4" />
          {{ t("sysadmin.refreshList") }}
        </button>
        <button class="ui-button ui-button-secondary" type="button" @click="admin.openImport">
          <Upload class="h-4 w-4" />
          {{ t("promptCases.importJson") }}
        </button>
        <button class="ui-button ui-button-primary" type="button" @click="admin.openCreate">
          <Plus class="h-4 w-4" />
          {{ t("promptCases.createCase") }}
        </button>
      </div>
    </div>

    <form
      class="panel mb-4 grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-8"
      @submit.prevent="admin.load"
    >
      <input
        v-model="admin.filters.value.search"
        class="ui-field h-10 px-3 md:col-span-2 xl:col-span-2"
        :placeholder="t('promptCases.searchPlaceholder')"
      />
      <input
        v-model="admin.filters.value.category"
        class="ui-field h-10 px-3"
        list="prompt-case-categories"
        :placeholder="t('promptCases.category')"
      />
      <datalist id="prompt-case-categories">
        <option v-for="category in admin.categories.value" :key="category" :value="category" />
      </datalist>
      <select v-model="admin.filters.value.status" class="ui-field h-10 px-3" @change="admin.load">
        <option value="">{{ t("promptCases.allStatuses") }}</option>
        <option v-for="status in PROMPT_CASE_STATUSES" :key="status" :value="status">
          {{ t(`promptCases.status.${status}`) }}
        </option>
      </select>
      <select v-model="admin.filters.value.mode" class="ui-field h-10 px-3" @change="admin.load">
        <option value="">{{ t("promptCases.allModes") }}</option>
        <option v-for="mode in PROMPT_CASE_MODES" :key="mode" :value="mode">
          {{ t(`workspace.${mode}`) }}
        </option>
      </select>
      <select v-model="admin.filters.value.locale" class="ui-field h-10 px-3" @change="admin.load">
        <option value="">{{ t("promptCases.allLocales") }}</option>
        <option v-for="locale in PROMPT_CASE_LOCALES" :key="locale" :value="locale">
          {{ locale }}
        </option>
      </select>
      <select v-model="admin.filters.value.source" class="ui-field h-10 px-3" @change="admin.load">
        <option value="">{{ t("promptCases.allSources") }}</option>
        <option value="external">{{ t("promptCases.externalSource") }}</option>
        <option value="internal">{{ t("promptCases.internalSource") }}</option>
      </select>
      <select
        v-model="admin.filters.value.featured"
        class="ui-field h-10 px-3"
        @change="admin.load"
      >
        <option value="">{{ t("promptCases.allFeatured") }}</option>
        <option value="1">{{ t("promptCases.featured") }}</option>
        <option value="0">{{ t("promptCases.notFeatured") }}</option>
      </select>
      <div class="flex gap-2 md:col-span-3 xl:col-span-8">
        <button class="ui-button ui-button-primary" type="submit">{{ t("common.search") }}</button>
        <button class="ui-button ui-button-secondary" type="button" @click="admin.resetFilters">
          {{ t("promptCases.resetFilters") }}
        </button>
      </div>
    </form>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <PromptCaseTable
        v-model:selected-id="admin.selectedId.value"
        :items="admin.items.value"
        :loading="admin.loading.value"
        @change-status="admin.changeStatus"
        @edit="admin.openEdit"
        @toggle-featured="admin.toggleFeatured"
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
