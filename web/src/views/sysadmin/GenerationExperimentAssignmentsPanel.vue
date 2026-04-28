<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ExperimentAssignmentOverride } from "@/api/experiments";
import type { GenerationExperimentAssignmentForm } from "./useGenerationExperimentAdmin";

const props = defineProps<{
  loading: boolean;
  savingAssignment: boolean;
  assignments: ExperimentAssignmentOverride[];
  assignmentForm: GenerationExperimentAssignmentForm;
  formatDateTime: (value: number) => string;
}>();

const emit = defineEmits<{
  saveAssignment: [];
  removeAssignment: [userId: string];
  "update:userId": [value: string];
  "update:variant": [value: GenerationExperimentAssignmentForm["variant"]];
}>();

const { t } = useI18n();
const userIdModel = computed({
  get: () => props.assignmentForm.userId,
  set: (value: string) => emit("update:userId", value)
});
const variantModel = computed({
  get: () => props.assignmentForm.variant,
  set: (value: GenerationExperimentAssignmentForm["variant"]) => emit("update:variant", value)
});
</script>

<template>
  <section class="panel overflow-hidden">
    <div class="border-b border-border p-4">
      <h2 class="font-semibold">{{ t("experiments.manualAssignments") }}</h2>
      <p class="mt-1 text-xs text-muted-foreground">
        {{ t("experiments.manualAssignmentsHint") }}
      </p>
    </div>
    <div class="space-y-4 p-4">
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto]">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("experiments.assignmentUserId") }}
          </span>
          <input
            v-model.trim="userIdModel"
            class="ui-field h-10 px-3 font-mono text-sm"
            :placeholder="t('experiments.assignmentUserIdPlaceholder')"
          />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("experiments.assignmentVariant") }}
          </span>
          <select v-model="variantModel" class="ui-field h-10 px-3">
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <button
          class="ui-button ui-button-secondary self-end"
          type="button"
          :disabled="savingAssignment || loading"
          @click="emit('saveAssignment')"
        >
          {{ t("experiments.setAssignment") }}
        </button>
      </div>

      <div class="thin-scrollbar max-h-72 overflow-auto rounded-lg border border-border">
        <table class="w-full min-w-[42rem] text-sm">
          <thead class="sticky top-0 bg-muted text-left text-muted-foreground">
            <tr>
              <th class="p-3">{{ t("adminUsers.user") }}</th>
              <th class="p-3">{{ t("experiments.variant") }}</th>
              <th class="p-3">{{ t("history.updatedAt") }}</th>
              <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading" class="border-t border-border">
              <td class="p-4 text-center text-muted-foreground" colspan="4">
                {{ t("common.loading") }}
              </td>
            </tr>
            <tr v-else-if="!assignments.length" class="border-t border-border">
              <td class="p-4 text-center text-muted-foreground" colspan="4">
                {{ t("experiments.noAssignments") }}
              </td>
            </tr>
            <tr
              v-for="assignment in assignments"
              v-else
              :key="assignment.userId"
              class="border-t border-border"
            >
              <td class="p-3">
                <p class="font-medium">{{ assignment.nickname }}</p>
                <p class="font-mono text-xs text-muted-foreground">
                  {{ assignment.userId }} · {{ assignment.username }}
                </p>
              </td>
              <td class="p-3 font-mono">{{ assignment.variant }}</td>
              <td class="p-3 text-muted-foreground">
                {{ formatDateTime(assignment.updatedAt) }}
              </td>
              <td class="p-3 text-right">
                <button
                  class="ui-button ui-button-ghost"
                  type="button"
                  :disabled="savingAssignment || loading"
                  @click="emit('removeAssignment', assignment.userId)"
                >
                  {{ t("experiments.removeAssignment") }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
