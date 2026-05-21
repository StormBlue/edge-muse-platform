<script setup lang="ts">
import { computed } from "vue";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  <FormDialog
    :open="createOpen"
    :cancel-label="t('common.cancel')"
    :saving="createSaving"
    :submit-label="t('common.create')"
    :title="t('sysadmin.createKey')"
    @submit="$emit('create')"
    @update:open="(open) => !open && $emit('closeCreate')"
  >
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.provider") }}
      </span>
      <Select
        v-model="formModel.providerId"
        required
        @update:model-value="$emit('syncCreateModelWithProvider')"
      >
        <SelectTrigger class="h-10">
          <SelectValue :placeholder="t('sysadmin.selectProvider')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="provider in supportedProviders"
            :key="provider.id"
            :value="provider.id"
          >
            {{ provider.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <span v-if="formModel.providerId" class="mt-1 block text-xs text-muted-foreground">
        {{ providerMeta(formModel.providerId) }}
      </span>
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.label") }}
      </span>
      <Input v-model="formModel.label" class="h-10" required />
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.keyModel") }}
      </span>
      <Input v-model="formModel.model" class="h-10" required />
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.maxConcurrency") }}
      </span>
      <Input
        v-model.number="formModel.maxConcurrency"
        class="h-10"
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
      <Input v-model="formModel.apiKey" class="h-10" required type="password" />
    </label>
  </FormDialog>

  <FormDialog
    v-if="editOpen && editing"
    :open="editOpen"
    :cancel-label="t('common.cancel')"
    :saving="editSaving"
    :submit-label="t('common.save')"
    :title="t('sysadmin.editKey')"
    @submit="$emit('saveEdit')"
    @update:open="(open) => !open && $emit('closeEdit')"
  >
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.provider") }}
      </span>
      <Select
        v-model="editFormModel.providerId"
        required
        @update:model-value="$emit('syncEditModelWithProvider')"
      >
        <SelectTrigger class="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="provider in editProviderOptions"
            :key="provider.id"
            :value="provider.id"
            :disabled="
              provider.id !== editFormModel.providerId && (!provider.builtIn || !provider.enabled)
            "
          >
            {{ provider.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <span v-if="editFormModel.providerId" class="mt-1 block text-xs text-muted-foreground">
        {{ providerMeta(editFormModel.providerId) }}
      </span>
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.label") }}
      </span>
      <Input v-model="editFormModel.label" class="h-10" required />
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.keyModel") }}
      </span>
      <Input v-model="editFormModel.model" class="h-10" required />
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.maxConcurrency") }}
      </span>
      <Input
        v-model.number="editFormModel.maxConcurrency"
        class="h-10"
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
      <Input v-model="editFormModel.apiKey" class="h-10" type="password" />
    </label>
  </FormDialog>

  <FormDialog
    :open="groupCreateOpen"
    :cancel-label="t('common.cancel')"
    :saving="groupSaving"
    :submit-label="t('common.create')"
    :title="t('sysadmin.createKeyGroup')"
    @submit="$emit('createGroup')"
    @update:open="(open) => !open && $emit('closeGroupCreate')"
  >
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.provider") }}
      </span>
      <Select v-model="groupFormModel.providerId" required>
        <SelectTrigger class="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="provider in supportedProviders"
            :key="provider.id"
            :value="provider.id"
          >
            {{ provider.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.keyGroupName") }}
      </span>
      <Input v-model="groupFormModel.name" class="h-10" required />
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.keyGroupDescription") }}
      </span>
      <Textarea v-model="groupFormModel.description" />
    </label>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model:checked="groupFormModel.enabled" />
      <span>{{ t("common.enabled") }}</span>
    </label>
  </FormDialog>

  <FormDialog
    v-if="groupEditOpen && editingGroup"
    :open="groupEditOpen"
    :cancel-label="t('common.cancel')"
    :saving="groupSaving"
    :submit-label="t('common.save')"
    :title="t('sysadmin.editKeyGroup')"
    @submit="$emit('saveGroupEdit')"
    @update:open="(open) => !open && $emit('closeGroupEdit')"
  >
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.provider") }}
      </span>
      <Select v-model="groupEditFormModel.providerId" required>
        <SelectTrigger class="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="provider in groupEditProviderOptions"
            :key="provider.id"
            :value="provider.id"
          >
            {{ provider.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.keyGroupName") }}
      </span>
      <Input v-model="groupEditFormModel.name" class="h-10" required />
    </label>
    <label class="block">
      <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
        {{ t("sysadmin.keyGroupDescription") }}
      </span>
      <Textarea v-model="groupEditFormModel.description" />
    </label>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model:checked="groupEditFormModel.enabled" />
      <span>{{ t("common.enabled") }}</span>
    </label>
  </FormDialog>
</template>
