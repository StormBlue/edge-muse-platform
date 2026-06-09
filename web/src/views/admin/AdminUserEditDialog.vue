<script setup lang="ts">
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { AdminEditUserForm } from "./adminUserHelpers";
import type { AdminUser, ProviderKeyGroupRow } from "./adminUserTypes";

defineProps<{
  editingUser: AdminUser | null;
  groups: ProviderKeyGroupRow[];
  isSysadmin: boolean;
  roleLabel: (role: AdminUser["role"]) => string;
  saving: boolean;
  t: (key: string) => string;
}>();

const open = defineModel<boolean>("open", { required: true });
const editForm = defineModel<AdminEditUserForm>("editForm", { required: true });
const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <FormDialog
    v-if="editingUser"
    v-model:open="open"
    :cancel-label="t('common.cancel')"
    :saving="saving"
    :submit-label="t('common.save')"
    :title="t('adminUsers.editUser')"
    @submit="emit('submit')"
  >
    <p class="text-sm text-muted-foreground">
      {{ editingUser.username }} · {{ roleLabel(editingUser.role) }}
    </p>
    <label class="block text-sm font-medium">
      <span>{{ t("auth.nicknameForDisplay") }}</span>
      <Input v-model="editForm.nickname" class="mt-1.5 h-10" required />
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("adminUsers.status") }}</span>
      <Select v-model="editForm.status">
        <SelectTrigger class="mt-1.5 h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">{{ t("common.enabled") }}</SelectItem>
          <SelectItem value="disabled">{{ t("common.disabled") }}</SelectItem>
        </SelectContent>
      </Select>
    </label>
    <label v-if="isSysadmin" class="block text-sm font-medium">
      <span>{{ t("sysadmin.providerKeyGroup") }}</span>
      <Select v-model="editForm.providerKeyGroupId">
        <SelectTrigger class="mt-1.5 h-10">
          <SelectValue :placeholder="t('sysadmin.selectKeyGroup')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("adminUsers.maxConcurrentTasks") }}</span>
      <Input
        v-model.number="editForm.maxConcurrentTasks"
        class="mt-1.5 h-10"
        :max="editingUser.role === 'admin' ? 15 : 10"
        min="1"
        required
        type="number"
      />
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("adminUsers.maxImagesPerGeneration") }}</span>
      <Input
        v-model.number="editForm.maxImagesPerGeneration"
        class="mt-1.5 h-10"
        max="20"
        min="1"
        required
        type="number"
      />
    </label>
    <label v-if="isSysadmin" class="block text-sm font-medium">
      <span>{{ t("sysadmin.totalQuota") }}</span>
      <Input v-model.number="editForm.quota" class="mt-1.5 h-10" min="0" type="number" />
    </label>
    <label v-if="isSysadmin" class="block text-sm font-medium">
      <span>{{ t("sysadmin.passwordOptional") }}</span>
      <Input v-model="editForm.password" class="mt-1.5 h-10" minlength="8" type="password" />
    </label>
  </FormDialog>
</template>
