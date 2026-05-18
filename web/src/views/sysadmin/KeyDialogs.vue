<script setup lang="ts">
import { computed } from "vue";
import { Loader2 } from "@lucide/vue";
import type { KeyGroupRow, KeyRow, ProviderRow } from "./useSysadminKeysController";

type KeyForm = {
  providerId: string;
  label: string;
  model: string;
  apiKey: string;
  allocatedQuota: number | null;
  maxConcurrency: number;
  enabled: boolean;
};

type GroupForm = {
  providerId: string;
  name: string;
  description: string;
  enabled: boolean;
};

const props = defineProps<{
  createOpen: boolean;
  editOpen: boolean;
  groupCreateOpen: boolean;
  groupEditOpen: boolean;
  editing: KeyRow | null;
  editingGroup: KeyGroupRow | null;
  createSaving: boolean;
  editSaving: boolean;
  groupSaving: boolean;
  form: KeyForm;
  editForm: KeyForm;
  groupForm: GroupForm;
  groupEditForm: GroupForm;
  supportedProviders: ProviderRow[];
  editProviderOptions: ProviderRow[];
  groupEditProviderOptions: ProviderRow[];
  t: (key: string, params?: Record<string, unknown>) => string;
  providerMeta: (providerId: string) => string;
}>();

const emit = defineEmits<{
  "update:form": [value: KeyForm];
  "update:editForm": [value: KeyForm];
  "update:groupForm": [value: GroupForm];
  "update:groupEditForm": [value: GroupForm];
  closeCreate: [];
  closeEdit: [];
  closeGroupCreate: [];
  closeGroupEdit: [];
  create: [];
  saveEdit: [];
  createGroup: [];
  saveGroupEdit: [];
  syncCreateModelWithProvider: [];
  syncEditModelWithProvider: [];
}>();

const formModel = computed({
  get: () => props.form,
  set: (value: KeyForm) => emit("update:form", value)
});
const editFormModel = computed({
  get: () => props.editForm,
  set: (value: KeyForm) => emit("update:editForm", value)
});
const groupFormModel = computed({
  get: () => props.groupForm,
  set: (value: GroupForm) => emit("update:groupForm", value)
});
const groupEditFormModel = computed({
  get: () => props.groupEditForm,
  set: (value: GroupForm) => emit("update:groupEditForm", value)
});
</script>

<template>
  <div
    v-if="createOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  >
    <form
      class="panel w-full max-w-md space-y-3 p-5"
      :aria-busy="createSaving"
      @submit.prevent="$emit('create')"
    >
      <h2 class="font-semibold">{{ t("sysadmin.createKey") }}</h2>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.provider") }}
        </span>
        <select
          v-model="formModel.providerId"
          class="ui-field h-10 px-3"
          required
          @change="$emit('syncCreateModelWithProvider')"
        >
          <option value="">{{ t("sysadmin.selectProvider") }}</option>
          <option v-for="provider in supportedProviders" :key="provider.id" :value="provider.id">
            {{ provider.name }}
          </option>
        </select>
        <span v-if="formModel.providerId" class="mt-1 block text-xs text-muted-foreground">
          {{ providerMeta(formModel.providerId) }}
        </span>
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.label") }}
        </span>
        <input v-model="formModel.label" class="ui-field h-10 px-3" required />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.keyModel") }}
        </span>
        <input v-model="formModel.model" class="ui-field h-10 px-3" required />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.maxConcurrency") }}
        </span>
        <input
          v-model.number="formModel.maxConcurrency"
          class="ui-field h-10 px-3"
          max="100"
          min="1"
          required
          type="number"
        />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.apiKey") }}
        </span>
        <input v-model="formModel.apiKey" class="ui-field h-10 px-3" required type="password" />
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button
          class="ui-button ui-button-secondary"
          type="button"
          :disabled="createSaving"
          @click="$emit('closeCreate')"
        >
          {{ t("common.cancel") }}
        </button>
        <button class="ui-button ui-button-primary" type="submit" :disabled="createSaving">
          <Loader2 v-if="createSaving" class="h-4 w-4 animate-spin" />
          {{ t("common.create") }}
        </button>
      </div>
    </form>
  </div>

  <div
    v-if="editOpen && editing"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  >
    <form
      class="panel w-full max-w-md space-y-3 p-5"
      :aria-busy="editSaving"
      @submit.prevent="$emit('saveEdit')"
    >
      <h2 class="font-semibold">{{ t("sysadmin.editKey") }}</h2>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.provider") }}
        </span>
        <select
          v-model="editFormModel.providerId"
          class="ui-field h-10 px-3"
          required
          @change="$emit('syncEditModelWithProvider')"
        >
          <option
            v-for="provider in editProviderOptions"
            :key="provider.id"
            :value="provider.id"
            :disabled="
              provider.id !== editFormModel.providerId && (!provider.builtIn || !provider.enabled)
            "
          >
            {{ provider.name }}
          </option>
        </select>
        <span v-if="editFormModel.providerId" class="mt-1 block text-xs text-muted-foreground">
          {{ providerMeta(editFormModel.providerId) }}
        </span>
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.label") }}
        </span>
        <input v-model="editFormModel.label" class="ui-field h-10 px-3" required />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.keyModel") }}
        </span>
        <input v-model="editFormModel.model" class="ui-field h-10 px-3" required />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.maxConcurrency") }}
        </span>
        <input
          v-model.number="editFormModel.maxConcurrency"
          class="ui-field h-10 px-3"
          max="100"
          min="1"
          required
          type="number"
        />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.apiKeyOptional") }}
        </span>
        <input v-model="editFormModel.apiKey" class="ui-field h-10 px-3" type="password" />
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button
          class="ui-button ui-button-secondary"
          type="button"
          :disabled="editSaving"
          @click="$emit('closeEdit')"
        >
          {{ t("common.cancel") }}
        </button>
        <button class="ui-button ui-button-primary" type="submit" :disabled="editSaving">
          <Loader2 v-if="editSaving" class="h-4 w-4 animate-spin" />
          {{ t("common.save") }}
        </button>
      </div>
    </form>
  </div>

  <div
    v-if="groupCreateOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  >
    <form
      class="panel w-full max-w-md space-y-3 p-5"
      :aria-busy="groupSaving"
      @submit.prevent="$emit('createGroup')"
    >
      <h2 class="font-semibold">{{ t("sysadmin.createKeyGroup") }}</h2>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.provider") }}
        </span>
        <select v-model="groupFormModel.providerId" class="ui-field h-10 px-3" required>
          <option v-for="provider in supportedProviders" :key="provider.id" :value="provider.id">
            {{ provider.name }}
          </option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.keyGroupName") }}
        </span>
        <input v-model="groupFormModel.name" class="ui-field h-10 px-3" required />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.keyGroupDescription") }}
        </span>
        <textarea v-model="groupFormModel.description" class="ui-field min-h-20 p-3" />
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="groupFormModel.enabled" type="checkbox" />
        <span>{{ t("common.enabled") }}</span>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button
          class="ui-button ui-button-secondary"
          type="button"
          :disabled="groupSaving"
          @click="$emit('closeGroupCreate')"
        >
          {{ t("common.cancel") }}
        </button>
        <button class="ui-button ui-button-primary" type="submit" :disabled="groupSaving">
          <Loader2 v-if="groupSaving" class="h-4 w-4 animate-spin" />
          {{ t("common.create") }}
        </button>
      </div>
    </form>
  </div>

  <div
    v-if="groupEditOpen && editingGroup"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  >
    <form
      class="panel w-full max-w-md space-y-3 p-5"
      :aria-busy="groupSaving"
      @submit.prevent="$emit('saveGroupEdit')"
    >
      <h2 class="font-semibold">{{ t("sysadmin.editKeyGroup") }}</h2>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.provider") }}
        </span>
        <select v-model="groupEditFormModel.providerId" class="ui-field h-10 px-3" required>
          <option
            v-for="provider in groupEditProviderOptions"
            :key="provider.id"
            :value="provider.id"
          >
            {{ provider.name }}
          </option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.keyGroupName") }}
        </span>
        <input v-model="groupEditFormModel.name" class="ui-field h-10 px-3" required />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.keyGroupDescription") }}
        </span>
        <textarea v-model="groupEditFormModel.description" class="ui-field min-h-20 p-3" />
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="groupEditFormModel.enabled" type="checkbox" />
        <span>{{ t("common.enabled") }}</span>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button
          class="ui-button ui-button-secondary"
          type="button"
          :disabled="groupSaving"
          @click="$emit('closeGroupEdit')"
        >
          {{ t("common.cancel") }}
        </button>
        <button class="ui-button ui-button-primary" type="submit" :disabled="groupSaving">
          <Loader2 v-if="groupSaving" class="h-4 w-4 animate-spin" />
          {{ t("common.save") }}
        </button>
      </div>
    </form>
  </div>
</template>
