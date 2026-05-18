<script setup lang="ts">
/**
 * 服务商 API 密钥与 key group 调度配置：key 保存密文，group 决定生成请求调度优先级。
 */
import { onBeforeUnmount, watch } from "vue";
import { Plus, RefreshCw } from "@lucide/vue";
import AppShell from "@/components/layout/AppShell.vue";
import KeyDialogs from "./KeyDialogs.vue";
import KeyGroupPanel from "./KeyGroupPanel.vue";
import KeyTable from "./KeyTable.vue";
import { useSysadminKeysController } from "./useSysadminKeysController";

const {
  keys,
  groups,
  t,
  createOpen,
  editOpen,
  groupCreateOpen,
  groupEditOpen,
  editing,
  editingGroup,
  testingKeyId,
  createSaving,
  editSaving,
  groupSaving,
  memberSaving,
  form,
  editForm,
  groupForm,
  groupEditForm,
  availableKeysForGroup,
  supportedProviders,
  editProviderOptions,
  groupEditProviderOptions,
  load,
  openCreate,
  create,
  syncCreateModelWithProvider,
  openEdit,
  syncEditModelWithProvider,
  saveEdit,
  toggleKey,
  deleteKey,
  testKey,
  openCreateGroup,
  createGroup,
  openEditGroup,
  saveGroupEdit,
  deleteGroup,
  addMember,
  removeMember,
  moveMember,
  providerLabel,
  providerMeta
} = useSysadminKeysController();

let escapeListenerActive = false;

function closeCreateDialog() {
  if (!createSaving.value) createOpen.value = false;
}

function closeEditDialog() {
  if (!editSaving.value) editOpen.value = false;
}

function closeGroupCreateDialog() {
  if (!groupSaving.value) groupCreateOpen.value = false;
}

function closeGroupEditDialog() {
  if (!groupSaving.value) groupEditOpen.value = false;
}

function onDialogEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (createOpen.value) return closeCreateDialog();
  if (editOpen.value) return closeEditDialog();
  if (groupCreateOpen.value) return closeGroupCreateDialog();
  if (groupEditOpen.value) closeGroupEditDialog();
}

function syncEscapeListener() {
  const shouldListen =
    createOpen.value || editOpen.value || groupCreateOpen.value || groupEditOpen.value;
  if (shouldListen && !escapeListenerActive) {
    document.addEventListener("keydown", onDialogEscape);
    escapeListenerActive = true;
  } else if (!shouldListen && escapeListenerActive) {
    document.removeEventListener("keydown", onDialogEscape);
    escapeListenerActive = false;
  }
}

watch([createOpen, editOpen, groupCreateOpen, groupEditOpen], syncEscapeListener, {
  immediate: true
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onDialogEscape);
});
</script>

<template>
  <AppShell :content-scrollable="false" main-class="flex min-h-0 flex-col">
    <div class="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">{{ t("nav.keys") }}</h1>
      <div class="flex flex-wrap gap-2">
        <button class="ui-button ui-button-secondary" type="button" @click="load">
          <RefreshCw class="h-4 w-4" />
          {{ t("sysadmin.refreshList") }}
        </button>
        <button class="ui-button ui-button-secondary" type="button" @click="openCreateGroup">
          <Plus class="h-4 w-4" />
          {{ t("sysadmin.createKeyGroup") }}
        </button>
        <button class="ui-button ui-button-primary" type="button" @click="openCreate">
          <Plus class="h-4 w-4" />
          {{ t("sysadmin.createKey") }}
        </button>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 grid-rows-2 gap-4 xl:grid-cols-2 xl:grid-rows-1">
      <KeyTable
        :keys="keys"
        :provider-label="providerLabel"
        :testing-key-id="testingKeyId"
        :t="t"
        @delete-key="deleteKey"
        @open-edit="openEdit"
        @test-key="testKey"
        @toggle-key="toggleKey"
      />

      <KeyGroupPanel
        :available-keys-for-group="availableKeysForGroup"
        :groups="groups"
        :member-saving="memberSaving"
        :provider-label="providerLabel"
        :t="t"
        @add-member="addMember"
        @delete-group="deleteGroup"
        @move-member="moveMember"
        @open-edit-group="openEditGroup"
        @remove-member="removeMember"
      />
    </div>

    <KeyDialogs
      :create-open="createOpen"
      :create-saving="createSaving"
      :edit-form="editForm"
      :edit-open="editOpen"
      :edit-provider-options="editProviderOptions"
      :edit-saving="editSaving"
      :editing="editing"
      :editing-group="editingGroup"
      :form="form"
      :group-create-open="groupCreateOpen"
      :group-edit-form="groupEditForm"
      :group-edit-open="groupEditOpen"
      :group-edit-provider-options="groupEditProviderOptions"
      :group-form="groupForm"
      :group-saving="groupSaving"
      :provider-meta="providerMeta"
      :supported-providers="supportedProviders"
      :t="t"
      @update:edit-form="editForm = $event"
      @update:form="form = $event"
      @update:group-edit-form="groupEditForm = $event"
      @update:group-form="groupForm = $event"
      @close-create="closeCreateDialog"
      @close-edit="closeEditDialog"
      @close-group-create="closeGroupCreateDialog"
      @close-group-edit="closeGroupEditDialog"
      @create="create"
      @create-group="createGroup"
      @save-edit="saveEdit"
      @save-group-edit="saveGroupEdit"
      @sync-create-model-with-provider="syncCreateModelWithProvider"
      @sync-edit-model-with-provider="syncEditModelWithProvider"
    />
  </AppShell>
</template>
