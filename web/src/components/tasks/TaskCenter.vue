<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { useNow } from "@vueuse/core";
import { Check, Clock3, ListTodo, LoaderCircle, RefreshCw, X } from "@lucide/vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/auth";
import { useTaskActivityStore } from "@/stores/taskActivity";
import { useTaskLocale } from "./taskLocale";
import type { GenerationTask } from "@/api/tasks";

const auth = useAuthStore();
const tasks = useTaskActivityStore();
const text = useTaskLocale();
const filter = ref("recent");
const now = useNow({ interval: 1000 });
const visibleItems = computed(() => (filter.value === "active" ? tasks.activeItems : tasks.items));
watch(
  () => tasks.open,
  (value) => {
    if (value) void tasks.refresh();
  }
);

function elapsed(task: GenerationTask) {
  const end = task.finishedAt ?? now.value.getTime();
  const seconds = Math.max(0, Math.floor((end - task.queuedAt) / 1000));
  return seconds < 60
    ? `${seconds}${text.value.second}`
    : `${Math.floor(seconds / 60)}${text.value.minute} ${seconds % 60}${text.value.second}`;
}

function taskRoute(task: GenerationTask) {
  return auth.isSysadmin || auth.generationEntry?.showAiImage
    ? { path: "/ai-image", query: { task: task.id } }
    : { path: `/workspace/s/${task.sessionId}` };
}
</script>

<template>
  <Dialog v-if="auth.user" v-model:open="tasks.open">
    <DialogTrigger as-child>
      <Button
        variant="secondary"
        size="icon"
        type="button"
        class="relative shrink-0"
        :title="text.title"
        :aria-label="`${text.title}${tasks.activeCount ? ` (${tasks.activeCount})` : ''}`"
      >
        <ListTodo class="size-4" />
        <span
          v-if="tasks.activeCount"
          class="absolute -right-1 -top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground"
          aria-hidden="true"
        >{{ tasks.activeCount > 99 ? "99+" : tasks.activeCount }}</span>
      </Button>
    </DialogTrigger>
    <DialogContent class="task-center max-h-[calc(100dvh-2rem)] gap-0 p-0 sm:max-w-2xl">
      <div class="border-b p-4 pr-12">
        <DialogTitle class="text-base">{{ text.title }}</DialogTitle>
        <DialogDescription class="sr-only">{{ text.recent }} · {{ text.active }}</DialogDescription>
      </div>
      <div class="flex items-center justify-between gap-2 border-b px-4 py-3">
        <Tabs v-model="filter">
          <TabsList>
            <TabsTrigger value="recent">{{ text.recent }}</TabsTrigger>
            <TabsTrigger value="active">{{ text.active }} ({{ tasks.activeCount }})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="icon"
          :disabled="tasks.loading"
          :title="text.refresh"
          :aria-label="text.refresh"
          @click="tasks.refresh()"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': tasks.loading }" />
        </Button>
      </div>
      <div class="min-h-0 overflow-y-auto overscroll-contain p-4 thin-scrollbar">
        <div
          v-if="tasks.error"
          class="mb-3 flex items-center justify-between gap-3 rounded-md border border-destructive/30 p-3 text-sm"
          role="alert"
        >
          <p>{{ tasks.items.length ? text.connectionError : tasks.error }}</p>
          <Button variant="outline" :disabled="tasks.loading" @click="tasks.refresh()">
            {{ text.retry }}
          </Button>
        </div>
        <div
          v-if="tasks.loading && !tasks.items.length"
          class="flex justify-center py-12"
          role="status"
          :aria-label="text.refresh"
        >
          <LoaderCircle class="size-5 animate-spin" />
        </div>
        <p
          v-else-if="!visibleItems.length && !tasks.error"
          class="py-12 text-center text-sm text-muted-foreground"
        >
          {{ filter === "active" ? text.emptyActive : text.empty }}
        </p>
        <ol class="divide-y divide-border">
          <li
            v-for="task in visibleItems"
            :key="task.id"
            class="flex min-w-0 gap-3 py-4 first:pt-0 last:pb-0"
          >
            <RouterLink
              :to="taskRoute(task)"
              class="size-16 shrink-0 overflow-hidden rounded-md border bg-muted flex items-center justify-center"
              :aria-label="text.open"
              @click="tasks.open = false"
            >
              <img
                v-if="task.images[0]"
                :src="task.images[0].url"
                alt=""
                class="size-full object-contain"
                loading="lazy"
              />
              <LoaderCircle
                v-else-if="task.status === 'running'"
                class="size-5 animate-spin text-muted-foreground"
              />
              <Check v-else-if="task.phase === 'succeeded'" class="size-5 text-emerald-600" />
              <X
                v-else-if="task.phase === 'failed' || task.phase === 'cancelled'"
                class="size-5 text-muted-foreground"
              />
              <Clock3 v-else class="size-5 text-muted-foreground" />
            </RouterLink>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <RouterLink
                  :to="taskRoute(task)"
                  class="min-w-0 flex-1 text-sm font-medium line-clamp-2 break-words hover:underline"
                  @click="tasks.open = false"
                >
                  {{ task.title || task.prompt }}
                </RouterLink>
                <span
                  class="text-xs shrink-0"
                  :class="
                    task.phase === 'failed'
                      ? 'text-destructive'
                      : task.phase === 'succeeded'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                  "
                >{{ text[task.phase] }}</span>
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{{ task.params.size }} · {{ task.params.n }} {{ text.images }}</span>
                <span>{{ task.phase === "queued" ? text.waiting : text.elapsed }}
                  {{ elapsed(task) }}</span>
                <time :datetime="new Date(task.queuedAt).toISOString()" :title="text.created">{{
                  new Date(task.queuedAt).toLocaleString()
                }}</time>
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{{ text.precharged }} {{ task.quota.precharged }}</span>
                <span>{{ text.refunded }} {{ task.quota.refunded }}</span>
                <span v-if="task.status !== 'queued' && task.status !== 'running'">{{ text.consumed }} {{ task.quota.consumed }}</span>
              </div>
              <p
                v-if="task.errorMessage && task.phase === 'failed'"
                class="break-words text-xs text-destructive"
              >
                {{ task.errorMessage }}
              </p>
              <Button
                v-if="task.canCancel"
                class="h-8 text-xs"
                variant="outline"
                :disabled="tasks.cancellingIds.includes(task.id)"
                @click="tasks.cancel(task.id)"
              >
                <X class="size-3.5" />{{
                  tasks.cancellingIds.includes(task.id) ? text.cancelling : text.cancel
                }}
              </Button>
            </div>
          </li>
        </ol>
        <Button
          v-if="filter === 'recent' && tasks.nextCursor"
          class="mt-4 w-full"
          variant="outline"
          :disabled="tasks.loadingMore || tasks.loading"
          @click="tasks.loadMore()"
        >
          {{ text.more }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
:global(.task-center) {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
}
:global(.task-center > div) {
  min-width: 0;
}
:global(.task-center > div:first-child),
:global(.task-center > div:nth-child(2)) {
  flex-shrink: 0;
}
.task-center {
  grid-template-rows: auto auto minmax(0, 1fr);
}
</style>
