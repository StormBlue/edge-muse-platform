<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { useDraggable } from "@vueuse/core";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-vue-next";
import type { GroupMember, KeyGroupRow, KeyRow } from "./useSysadminKeysController";

const props = defineProps<{
  groups: KeyGroupRow[];
  selectedGroupId: string;
  selectedGroup: KeyGroupRow | null;
  groupMembers: GroupMember[];
  availableKeysForGroup: KeyRow[];
  memberSaving: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  providerLabel: (providerId: string) => string;
}>();

const emit = defineEmits<{
  "update:selectedGroupId": [value: string];
  openEditGroup: [group: KeyGroupRow];
  deleteGroup: [group: KeyGroupRow];
  addMember: [keyId: string];
  removeMember: [member: GroupMember];
  moveMember: [fromIndex: number, toIndex: number];
}>();

const draggingMemberId = ref<string | null>(null);
const dragStartIndex = ref<number | null>(null);
const dragStartY = ref(0);
const memberDragTarget = useTemplateRef<HTMLElement>("memberDragTarget");

useDraggable(memberDragTarget, {
  axis: "y",
  capture: false,
  preventDefault: true,
  onStart(position, event) {
    if (props.memberSaving) return false;
    const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-member-id]");
    const id = handle?.dataset.memberId ?? null;
    if (!id) return false;
    const fromIndex = props.groupMembers.findIndex((member) => member.id === id);
    if (fromIndex === -1) return false;
    draggingMemberId.value = id;
    dragStartIndex.value = fromIndex;
    dragStartY.value = position.y;
  },
  onEnd(position) {
    const from = dragStartIndex.value;
    const rowHeight =
      memberDragTarget.value?.querySelector<HTMLElement>("[data-member-row]")?.offsetHeight || 56;
    const deltaRows = Math.round((position.y - dragStartY.value) / rowHeight);
    const targetIndex =
      from === null || from < 0
        ? -1
        : Math.max(0, Math.min(props.groupMembers.length - 1, from + deltaRows));
    draggingMemberId.value = null;
    dragStartIndex.value = null;
    dragStartY.value = 0;
    if (from === null || from < 0 || targetIndex < 0 || targetIndex === from) return;
    emit("moveMember", from, targetIndex);
  }
});

function handleAddMember(event: Event) {
  const select = event.target as HTMLSelectElement | null;
  const keyId = select?.value ?? "";
  emit("addMember", keyId);
  if (select) select.value = "";
}

function handleSelectGroup(event: Event) {
  emit("update:selectedGroupId", (event.target as HTMLSelectElement | null)?.value ?? "");
}
</script>

<template>
  <section class="panel overflow-hidden">
    <div class="border-b border-border p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold">{{ t("sysadmin.keyGroups") }}</h2>
          <p class="text-xs text-muted-foreground">
            {{ t("sysadmin.keyGroupCount", { count: groups.length }) }}
          </p>
        </div>
        <select
          :value="selectedGroupId"
          class="ui-field h-10 w-full max-w-xs px-3"
          @change="handleSelectGroup"
        >
          <option value="">{{ t("sysadmin.selectKeyGroup") }}</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }} · {{ providerLabel(group.providerId) }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="!selectedGroup" class="p-6 text-sm text-muted-foreground">
      {{ t("sysadmin.noKeyGroups") }}
    </div>
    <div v-else class="space-y-4 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold">{{ selectedGroup.name }}</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ providerLabel(selectedGroup.providerId) }} · {{ selectedGroup.id }}
          </p>
          <p v-if="selectedGroup.description" class="mt-1 text-xs text-muted-foreground">
            {{ selectedGroup.description }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="ui-button ui-button-secondary h-8 text-xs"
            type="button"
            @click="$emit('openEditGroup', selectedGroup)"
          >
            {{ t("sysadmin.edit") }}
          </button>
          <button
            class="ui-button ui-button-secondary h-8 text-xs text-destructive"
            type="button"
            @click="$emit('deleteGroup', selectedGroup)"
          >
            {{ t("common.delete") }}
          </button>
        </div>
      </div>

      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
          {{ t("sysadmin.addGroupMember") }}
        </span>
        <select
          class="ui-field h-10 px-3"
          :disabled="memberSaving || !availableKeysForGroup.length"
          @change="handleAddMember"
        >
          <option value="">{{ t("sysadmin.selectKey") }}</option>
          <option v-for="key in availableKeysForGroup" :key="key.id" :value="key.id">
            {{ key.label }} ({{ key.keyHint }}) · {{ t("sysadmin.maxConcurrency") }}
            {{ key.maxConcurrency }}
          </option>
        </select>
      </label>

      <div ref="memberDragTarget" class="space-y-2">
        <div
          v-if="!groupMembers.length"
          class="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground"
        >
          {{ t("sysadmin.noGroupMembers") }}
        </div>
        <div
          v-for="(member, index) in groupMembers"
          :key="member.providerKeyId"
          data-member-row
          class="flex items-center gap-3 rounded border border-border bg-background p-3"
          :class="draggingMemberId === member.id ? 'opacity-70' : ''"
        >
          <button
            :data-member-id="member.id"
            class="ui-button ui-button-secondary h-9 w-9 p-0"
            type="button"
            :aria-label="t('sysadmin.dragSort')"
            :title="t('sysadmin.dragSort')"
          >
            <GripVertical class="h-4 w-4" />
          </button>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ member.label }}</p>
            <p class="truncate text-xs text-muted-foreground">
              {{ member.model || "-" }} · {{ member.keyHint }} · {{ t("sysadmin.maxConcurrency") }}
              {{ member.maxConcurrency }}
            </p>
          </div>
          <div class="flex gap-1">
            <button
              class="ui-button ui-button-secondary h-8 w-8 p-0"
              type="button"
              :disabled="index === 0 || memberSaving"
              :aria-label="t('common.previous')"
              :title="t('common.previous')"
              @click="$emit('moveMember', index, index - 1)"
            >
              <ArrowUp class="h-4 w-4" />
            </button>
            <button
              class="ui-button ui-button-secondary h-8 w-8 p-0"
              type="button"
              :disabled="index === groupMembers.length - 1 || memberSaving"
              :aria-label="t('common.next')"
              :title="t('common.next')"
              @click="$emit('moveMember', index, index + 1)"
            >
              <ArrowDown class="h-4 w-4" />
            </button>
            <button
              class="ui-button ui-button-secondary h-8 w-8 p-0 text-destructive"
              type="button"
              :disabled="memberSaving"
              :aria-label="t('common.delete')"
              :title="t('common.delete')"
              @click="$emit('removeMember', member)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
