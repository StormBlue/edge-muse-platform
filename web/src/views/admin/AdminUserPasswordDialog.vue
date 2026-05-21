<script setup lang="ts">
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminPasswordForm } from "./adminUserHelpers";
import type { AdminUser } from "./adminUserTypes";

defineProps<{
  passwordUser: AdminUser | null;
  saving: boolean;
  t: (key: string) => string;
}>();

const open = defineModel<boolean>("open", { required: true });
const passwordForm = defineModel<AdminPasswordForm>("passwordForm", { required: true });
const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <FormDialog
    v-if="passwordUser"
    v-model:open="open"
    :cancel-label="t('common.cancel')"
    content-class="sm:max-w-sm"
    :saving="saving"
    :submit-label="t('common.save')"
    :title="t('adminUsers.resetPassword')"
    @submit="emit('submit')"
  >
    <p class="text-sm text-muted-foreground">
      {{ passwordUser.nickname }} · {{ passwordUser.username }}
    </p>
    <label class="block text-sm font-medium">
      <span>{{ t("settings.newPassword") }}</span>
      <Input
        v-model="passwordForm.password"
        class="mt-1.5 h-10"
        minlength="8"
        required
        type="password"
      />
    </label>
    <label class="block text-sm font-medium">
      <span>{{ t("adminUsers.confirmNewPassword") }}</span>
      <Input
        v-model="passwordForm.confirmPassword"
        class="mt-1.5 h-10"
        minlength="8"
        required
        type="password"
      />
    </label>
  </FormDialog>
</template>
