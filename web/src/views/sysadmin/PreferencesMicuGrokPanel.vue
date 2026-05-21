<script setup lang="ts">
import { Checkbox } from "@/components/ui/checkbox";
import type { GenerationFeatureAdmin } from "./preferencesTypes";

defineProps<{
  loading: boolean;
  micuGrokAdmins: GenerationFeatureAdmin[];
  micuGrokGrantedAdminCount: number;
  saving: boolean;
  t: (key: string, named?: Record<string, unknown>) => string;
}>();

const micuGrokAdminIds = defineModel<string[]>("micuGrokAdminIds", { required: true });

function setMicuGrokAdminGrant(adminId: string, checked: boolean) {
  if (checked) {
    if (!micuGrokAdminIds.value.includes(adminId)) {
      micuGrokAdminIds.value = [...micuGrokAdminIds.value, adminId];
    }
    return;
  }
  micuGrokAdminIds.value = micuGrokAdminIds.value.filter((id) => id !== adminId);
}

function onMicuGrokAdminCheckedChange(adminId: string, checked: boolean | "indeterminate") {
  setMicuGrokAdminGrant(adminId, checked === true);
}
</script>

<template>
  <section class="panel space-y-4 p-5 lg:col-span-2">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="font-semibold">{{ t("sysadmin.micuGrokFeatureTitle") }}</h2>
        <p class="mt-1 text-sm leading-6 text-muted-foreground">
          {{ t("sysadmin.micuGrokFeatureDescription") }}
        </p>
      </div>
      <span class="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        {{ t("sysadmin.micuGrokGrantedAdmins", { count: micuGrokGrantedAdminCount }) }}
      </span>
    </div>
    <div v-if="micuGrokAdmins.length" class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <label
        v-for="admin in micuGrokAdmins"
        :key="admin.id"
        class="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-muted/20 p-3"
      >
        <Checkbox
          :checked="micuGrokAdminIds.includes(admin.id)"
          class="mt-1"
          :disabled="loading || saving || admin.status !== 'active'"
          @update:checked="onMicuGrokAdminCheckedChange(admin.id, $event)"
        />
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium">
            {{ admin.nickname || admin.username }}
          </span>
          <span class="mt-1 block truncate text-xs text-muted-foreground">
            {{ admin.email }}
          </span>
          <span v-if="admin.status !== 'active'" class="mt-1 block text-xs text-muted-foreground">
            {{ t("common.disabled") }}
          </span>
        </span>
      </label>
    </div>
    <p v-else class="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
      {{ t("sysadmin.micuGrokNoAdmins") }}
    </p>
  </section>
</template>
