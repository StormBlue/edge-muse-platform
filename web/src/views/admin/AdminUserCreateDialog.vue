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
import type { AdminCreateUserForm } from "./adminUserHelpers";
import type { ProviderKeyGroupRow } from "./adminUserTypes";

defineProps<{
  groups: ProviderKeyGroupRow[];
  isSysadmin: boolean;
  saving: boolean;
  t: (key: string) => string;
}>();

const open = defineModel<boolean>("open", { required: true });
const form = defineModel<AdminCreateUserForm>("form", { required: true });
const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <FormDialog
    v-model:open="open"
    :cancel-label="t('common.cancel')"
    :saving="saving"
    :submit-label="t('common.create')"
    :title="t('adminUsers.createUser')"
    @submit="emit('submit')"
  >
    <label v-if="isSysadmin" class="block text-sm font-medium">
      <span>{{ t("adminUsers.role") }}</span>
      <Select v-model="form.role">
        <SelectTrigger class="mt-1.5 h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">{{ t("adminUsers.roleUser") }}</SelectItem>
          <SelectItem value="admin">{{ t("adminUsers.roleAdmin") }}</SelectItem>
        </SelectContent>
      </Select>
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("auth.usernameForLogin") }}</span>
      <Input v-model="form.username" class="mt-1.5 h-10" required />
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("auth.nicknameForDisplay") }}</span>
      <Input v-model="form.nickname" class="mt-1.5 h-10" required />
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("auth.password") }}</span>
      <Input v-model="form.password" class="mt-1.5 h-10" minlength="8" required type="password" />
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("auth.emailOptional") }}</span>
      <Input v-model="form.email" class="mt-1.5 h-10" type="email" />
    </label>
    <label v-if="isSysadmin" class="block text-sm font-medium">
      <span>{{ t("sysadmin.providerKeyGroup") }}</span>
      <Select v-model="form.providerKeyGroupId" required>
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
        v-model.number="form.maxConcurrentTasks"
        class="mt-1.5 h-10"
        :max="form.role === 'admin' ? 15 : 10"
        min="1"
        type="number"
      />
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("adminUsers.maxImagesPerGeneration") }}</span>
      <Input
        v-model.number="form.maxImagesPerGeneration"
        class="mt-1.5 h-10"
        max="20"
        min="1"
        type="number"
      />
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("adminUsers.initialQuota") }}</span>
      <Input v-model.number="form.quota" class="mt-1.5 h-10" type="number" />
    </label>
  </FormDialog>
</template>
