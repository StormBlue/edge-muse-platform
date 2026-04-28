<script setup lang="ts">
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AuditMessage, FailureGroup } from "./userSessionsTypes";

type Translate = (key: string, named?: Record<string, unknown>) => string;

defineProps<{
  failureCountLabel: (count: number) => string;
  failureGroupTitle: (group: FailureGroup) => string;
  failureGroups: (message: AuditMessage) => FailureGroup[];
  failureImageRangeLabel: (group: FailureGroup) => string;
  generationFailures: (message: AuditMessage) => unknown[];
  message: AuditMessage;
  t: Translate;
  taskFailureMessage: (message: AuditMessage) => string;
}>();
</script>

<template>
  <ScrollArea class="h-40 rounded-lg border border-destructive/25 bg-destructive/5">
    <div class="px-3 py-2 text-sm text-destructive">
      <p class="font-semibold">
        {{
          message.task?.errorCode?.startsWith("PROVIDER")
            ? t("workspace.providerGenerationFailed")
            : t("workspace.generationFailed")
        }}
      </p>
      <p v-if="generationFailures(message).length" class="mt-1 text-xs text-destructive/80">
        {{ failureCountLabel(generationFailures(message).length) }}
      </p>

      <div v-if="failureGroups(message).length" class="mt-2 flex flex-col gap-3">
        <div v-for="group in failureGroups(message)" :key="group.key">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-xs font-semibold">
                {{ failureGroupTitle(group) }}
              </p>
              <p class="mt-0.5 font-mono text-[11px] text-destructive/70">
                {{ failureImageRangeLabel(group) }}
              </p>
            </div>
            <span
              v-if="group.count > 1"
              class="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium"
            >
              {{ failureCountLabel(group.count) }}
            </span>
          </div>
          <p v-if="group.phase" class="mt-1 text-[11px] text-destructive/70">
            {{ t("sysadmin.failurePhase") }}: {{ group.phase }}
          </p>
          <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5">
            {{ group.message }}
          </p>
        </div>
      </div>
      <p v-else class="mt-1 whitespace-pre-wrap break-words text-xs leading-5">
        {{ taskFailureMessage(message) }}
      </p>
    </div>
  </ScrollArea>
</template>
