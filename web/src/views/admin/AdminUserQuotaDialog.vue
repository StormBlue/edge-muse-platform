<script setup lang="ts">
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminUser } from "./adminUserTypes";

defineProps<{
  actorRemaining: number | null;
  saving: boolean;
  selectedUser: AdminUser | null;
  t: (key: string, named?: Record<string, unknown>) => string;
}>();

const open = defineModel<boolean>("open", { required: true });
const quotaAmount = defineModel<number>("quotaAmount", { required: true });
const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <FormDialog
    v-if="selectedUser"
    v-model:open="open"
    :cancel-label="t('common.cancel')"
    content-class="sm:max-w-sm"
    :saving="saving"
    :submit-label="t('adminUsers.confirmAddQuota')"
    :title="t('adminUsers.addQuota')"
    @submit="emit('submit')"
  >
    <p class="text-sm text-muted-foreground">
      {{
        t("adminUsers.ownRemaining", {
          value: actorRemaining === null ? t("common.unlimited") : actorRemaining
        })
      }}
    </p>
    <label class="block text-sm font-medium">
      <span>{{ t("adminUsers.addQuotaAmount") }}</span>
      <Input v-model.number="quotaAmount" class="mt-1.5 h-10" min="1" type="number" />
    </label>
  </FormDialog>
</template>
