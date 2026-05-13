<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useDraggable } from "@vueuse/core";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-vue-next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { KeyGroupRow, KeyRow } from "./useSysadminKeysController";

const props = defineProps<{
  groups: KeyGroupRow[];
  memberSaving: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  providerLabel: (providerId: string) => string;
  availableKeysForGroup: (groupId: string) => KeyRow[];
}>();

const emit = defineEmits<{
  openEditGroup: [group: KeyGroupRow];
  deleteGroup: [group: KeyGroupRow];
  addMember: [groupId: string, keyId: string];
  removeMember: [groupId: string, providerKeyId: string];
  moveMember: [groupId: string, fromIndex: number, toIndex: number];
}>();

const draggingMemberId = ref<string | null>(null);
const draggingGroupId = ref<string | null>(null);
const dragStartIndex = ref<number | null>(null);
const dragStartY = ref(0);
const addDialogOpen = ref(false);
const addingGroupId = ref<string | null>(null);
const selectedKeyId = ref("");
const memberDragTarget = useTemplateRef<HTMLElement>("memberDragTarget");

const addingGroup = computed(
  () => props.groups.find((group) => group.id === addingGroupId.value) ?? null
);
const addingAvailableKeys = computed(() =>
  addingGroupId.value ? props.availableKeysForGroup(addingGroupId.value) : []
);

useDraggable(memberDragTarget, {
  axis: "y",
  capture: false,
  preventDefault: true,
  onStart(position, event) {
    if (props.memberSaving) return false;
    const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-member-id][data-group-id]"
    );
    const groupId = handle?.dataset.groupId ?? null;
    const memberId = handle?.dataset.memberId ?? null;
    const group = groupId ? props.groups.find((item) => item.id === groupId) : null;
    if (!group || !memberId) return false;
    const fromIndex = group.members.findIndex((member) => member.id === memberId);
    if (fromIndex === -1) return false;
    draggingGroupId.value = group.id;
    draggingMemberId.value = memberId;
    dragStartIndex.value = fromIndex;
    dragStartY.value = position.y;
  },
  onEnd(position) {
    const group = draggingGroupId.value
      ? props.groups.find((item) => item.id === draggingGroupId.value)
      : null;
    const from = dragStartIndex.value;
    const rowHeight =
      memberDragTarget.value?.querySelector<HTMLElement>("[data-member-row]")?.offsetHeight || 56;
    const deltaRows = Math.round((position.y - dragStartY.value) / rowHeight);
    const targetIndex =
      group && from !== null && from >= 0
        ? Math.max(0, Math.min(group.members.length - 1, from + deltaRows))
        : -1;
    draggingGroupId.value = null;
    draggingMemberId.value = null;
    dragStartIndex.value = null;
    dragStartY.value = 0;
    if (!group || from === null || from < 0 || targetIndex < 0 || targetIndex === from) return;
    emit("moveMember", group.id, from, targetIndex);
  }
});

watch(addDialogOpen, (open) => {
  if (open) return;
  addingGroupId.value = null;
  selectedKeyId.value = "";
});

function openAddMemberDialog(group: KeyGroupRow) {
  const availableKeys = props.availableKeysForGroup(group.id);
  addingGroupId.value = group.id;
  selectedKeyId.value = availableKeys[0]?.id ?? "";
  addDialogOpen.value = true;
}

function closeAddMemberDialog() {
  addDialogOpen.value = false;
}

function confirmAddMember() {
  if (!addingGroupId.value || !selectedKeyId.value || props.memberSaving) return;
  emit("addMember", addingGroupId.value, selectedKeyId.value);
  closeAddMemberDialog();
}
</script>

<template>
  <section class="panel flex min-h-0 flex-col overflow-hidden">
    <div class="border-b border-border px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold">{{ t("sysadmin.keyGroups") }}</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ t("sysadmin.keyGroupCount", { count: groups.length }) }}
          </p>
        </div>
      </div>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div ref="memberDragTarget" class="space-y-3 p-3">
        <div
          v-if="!groups.length"
          class="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        >
          {{ t("sysadmin.noKeyGroups") }}
        </div>

        <article
          v-for="group in groups"
          :key="group.id"
          class="rounded border border-border bg-background p-3"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate text-sm font-semibold">{{ group.name }}</h3>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="
                    group.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ group.enabled ? t("common.enabled") : t("common.disabled") }}
                </span>
              </div>
              <p class="mt-1 truncate text-xs text-muted-foreground">
                {{ providerLabel(group.providerId) }} · {{ group.id }}
              </p>
              <p v-if="group.description" class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ group.description }}
              </p>
            </div>

            <div class="flex shrink-0 gap-2">
              <button
                class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
                type="button"
                @click="$emit('openEditGroup', group)"
              >
                <Pencil class="h-3.5 w-3.5" />
                {{ t("sysadmin.edit") }}
              </button>
              <button
                class="ui-button ui-button-secondary h-8 px-2.5 text-xs text-destructive"
                type="button"
                @click="$emit('deleteGroup', group)"
              >
                <Trash2 class="h-3.5 w-3.5" />
                {{ t("common.delete") }}
              </button>
            </div>
          </div>

          <div
            class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
          >
            <div class="min-w-0">
              <p class="text-xs font-medium text-muted-foreground">
                {{ t("sysadmin.addGroupMember") }}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{
                  availableKeysForGroup(group.id).length
                    ? t("sysadmin.availableGroupKeyCount", {
                      count: availableKeysForGroup(group.id).length
                    })
                    : t("sysadmin.noAvailableGroupKeys")
                }}
              </p>
            </div>
            <button
              class="ui-button ui-button-secondary h-8 shrink-0 px-2.5 text-xs"
              type="button"
              :disabled="memberSaving || !availableKeysForGroup(group.id).length"
              @click="openAddMemberDialog(group)"
            >
              <Plus class="h-3.5 w-3.5" />
              {{ t("sysadmin.addGroupMember") }}
            </button>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-if="!group.members.length"
              class="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground"
            >
              {{ t("sysadmin.noGroupMembers") }}
            </div>
            <div
              v-for="(member, index) in group.members"
              :key="member.providerKeyId"
              data-member-row
              class="flex items-center gap-3 rounded border border-border bg-card/60 p-3"
              :class="draggingMemberId === member.id ? 'opacity-70' : ''"
            >
              <button
                :data-group-id="group.id"
                :data-member-id="member.id"
                class="key-group-member-button ui-button ui-button-secondary ui-icon-button"
                type="button"
                :aria-label="t('sysadmin.dragSort')"
                :title="t('sysadmin.dragSort')"
              >
                <GripVertical class="h-5 w-5" :stroke-width="2.25" />
              </button>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ member.label }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ member.model || "-" }} · {{ member.keyHint }} ·
                  {{ t("sysadmin.maxConcurrency") }}
                  {{ member.maxConcurrency }}
                </p>
              </div>
              <div class="flex shrink-0 gap-2">
                <button
                  class="key-group-member-button ui-button ui-button-secondary ui-icon-button"
                  type="button"
                  :disabled="index === 0 || memberSaving"
                  :aria-label="t('common.previous')"
                  :title="t('common.previous')"
                  @click="$emit('moveMember', group.id, index, index - 1)"
                >
                  <ArrowUp class="h-5 w-5" :stroke-width="2.25" />
                </button>
                <button
                  class="key-group-member-button ui-button ui-button-secondary ui-icon-button"
                  type="button"
                  :disabled="index === group.members.length - 1 || memberSaving"
                  :aria-label="t('common.next')"
                  :title="t('common.next')"
                  @click="$emit('moveMember', group.id, index, index + 1)"
                >
                  <ArrowDown class="h-5 w-5" :stroke-width="2.25" />
                </button>
                <button
                  class="key-group-member-button key-group-member-button--danger ui-button ui-button-secondary ui-icon-button"
                  type="button"
                  :disabled="memberSaving"
                  :aria-label="t('common.delete')"
                  :title="t('common.delete')"
                  @click="$emit('removeMember', group.id, member.providerKeyId)"
                >
                  <Trash2 class="h-5 w-5" :stroke-width="2.25" />
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </ScrollArea>

    <Dialog v-model:open="addDialogOpen">
      <DialogContent
        class="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        :prevent-outside-close="memberSaving"
      >
        <DialogHeader class="shrink-0 border-b border-border p-4 pr-10">
          <DialogTitle>{{ t("sysadmin.selectGroupKeyDialogTitle") }}</DialogTitle>
          <DialogDescription v-if="addingGroup">
            {{ t("sysadmin.selectGroupKeyDialogDescription", { name: addingGroup.name }) }}
          </DialogDescription>
        </DialogHeader>

        <div class="min-h-0 flex-1 p-4">
          <ScrollArea class="max-h-[50vh] min-h-0 rounded border border-border">
            <div class="space-y-2 p-2">
              <label
                v-for="key in addingAvailableKeys"
                :key="key.id"
                class="flex cursor-pointer items-start gap-3 rounded border p-3 transition"
                :class="
                  selectedKeyId === key.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card/60 hover:bg-muted/40'
                "
              >
                <input
                  v-model="selectedKeyId"
                  class="mt-1"
                  name="provider-key-for-group"
                  type="radio"
                  :value="key.id"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ key.label }}</span>
                  <span class="mt-1 block truncate text-xs text-muted-foreground">
                    {{ key.model || "-" }} · {{ key.keyHint }} · {{ t("sysadmin.maxConcurrency") }}
                    {{ key.maxConcurrency }}
                  </span>
                </span>
              </label>
              <div
                v-if="!addingAvailableKeys.length"
                class="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground"
              >
                {{ t("sysadmin.noAvailableGroupKeys") }}
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter class="shrink-0 border-t border-border p-4">
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="memberSaving"
            @click="closeAddMemberDialog"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            class="ui-button ui-button-primary"
            type="button"
            :disabled="memberSaving || !selectedKeyId"
            @click="confirmAddMember"
          >
            {{ t("sysadmin.confirmAddGroupMember") }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<style scoped>
.key-group-member-button {
  color: var(--foreground);
  border-color: color-mix(in oklch, var(--border), var(--foreground) 12%);
  background: color-mix(in oklch, var(--card), transparent 4%);
}

.key-group-member-button:hover:not(:disabled) {
  color: var(--foreground);
  border-color: color-mix(in oklch, var(--primary), var(--border) 55%);
  background: color-mix(in oklch, var(--muted), var(--card) 35%);
}

.key-group-member-button:disabled {
  color: color-mix(in oklch, var(--muted-foreground), transparent 20%);
}

.key-group-member-button--danger {
  color: var(--destructive);
}

.key-group-member-button--danger:hover:not(:disabled) {
  color: var(--destructive);
  border-color: color-mix(in oklch, var(--destructive), var(--border) 55%);
}
</style>
