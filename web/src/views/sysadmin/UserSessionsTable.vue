<script setup lang="ts">
import { Image as ImageIcon } from "lucide-vue-next";
import type { AuditSession, UserOption } from "./userSessionsTypes";

type Translate = (key: string, named?: Record<string, unknown>) => string;

defineProps<{
  formatDateTime: (value?: number | null) => string;
  modeLabel: (mode?: AuditSession["mode"] | null) => string;
  sessions: AuditSession[];
  tableRowNumber: (index: number) => number;
  t: Translate;
  userLabel: (user?: AuditSession["user"] | UserOption | null) => string;
  userSubLabel: (user?: AuditSession["user"] | UserOption | null) => string;
}>();

const emit = defineEmits<{
  openDetail: [session: AuditSession];
}>();
</script>

<template>
  <div v-if="!sessions.length" class="panel p-8 text-center text-sm text-muted-foreground">
    {{ t("sysadmin.noSessions") }}
  </div>
  <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    <button
      v-for="(session, index) in sessions"
      :key="session.id"
      class="audit-session-card panel overflow-hidden text-left transition"
      type="button"
      @click="emit('openDetail', session)"
    >
      <div class="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          v-if="session.coverImage"
          class="h-full w-full object-cover"
          :src="session.coverImage.url"
          :width="session.coverImage.width ?? undefined"
          :height="session.coverImage.height ?? undefined"
          alt=""
          loading="lazy"
        />
        <div
          v-else
          class="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <ImageIcon class="h-7 w-7" />
          {{ t("history.noCover") }}
        </div>

        <div class="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
          <span
            class="rounded-full border border-border bg-background/90 px-2 py-1 font-mono text-xs shadow-sm backdrop-blur"
          >
            #{{ tableRowNumber(index) }}
          </span>
          <span
            v-if="session.deletedAt"
            class="rounded-full border border-destructive/25 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive shadow-sm backdrop-blur"
          >
            {{ t("sysadmin.deletedSession") }}
          </span>
        </div>

        <span
          class="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-1 text-xs font-medium shadow-sm backdrop-blur"
        >
          {{ t("sysadmin.successImagesCount", { count: session.imageCount ?? 0 }) }}
        </span>
      </div>

      <div class="p-4">
        <h2 class="truncate font-semibold">{{ session.title }}</h2>
        <p class="mt-1 truncate font-mono text-xs text-muted-foreground">{{ session.id }}</p>

        <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div class="min-w-0">
            <dt class="text-xs text-muted-foreground">{{ t("sysadmin.userFilter") }}</dt>
            <dd class="mt-1 min-w-0">
              <p class="truncate font-medium">{{ userLabel(session.user) }}</p>
              <p class="truncate text-xs text-muted-foreground">
                {{ userSubLabel(session.user) }}
              </p>
            </dd>
          </div>

          <div class="min-w-0">
            <dt class="text-xs text-muted-foreground">{{ t("workspace.generationMode") }}</dt>
            <dd class="mt-1 truncate font-medium">{{ modeLabel(session.mode) }}</dd>
          </div>

          <div class="min-w-0">
            <dt class="text-xs text-muted-foreground">{{ t("adminUsers.taskCount") }}</dt>
            <dd class="mt-1 font-mono font-medium">{{ session.taskCount ?? 0 }}</dd>
          </div>

          <div class="min-w-0">
            <dt class="text-xs text-muted-foreground">{{ t("sysadmin.successImageCount") }}</dt>
            <dd class="mt-1 font-mono font-medium">{{ session.imageCount ?? 0 }}</dd>
          </div>

          <div class="min-w-0">
            <dt class="text-xs text-muted-foreground">{{ t("history.createdAt") }}</dt>
            <dd class="mt-1 truncate font-medium">{{ formatDateTime(session.createdAt) }}</dd>
          </div>

          <div class="min-w-0">
            <dt class="text-xs text-muted-foreground">{{ t("history.updatedAt") }}</dt>
            <dd class="mt-1 truncate font-medium">{{ formatDateTime(session.lastMessageAt) }}</dd>
          </div>
        </dl>
      </div>
    </button>
  </div>
</template>

<style scoped>
.audit-session-card {
  transform: translateY(0);
}

.audit-session-card:hover {
  border-color: color-mix(in oklch, var(--primary), transparent 55%);
  background: color-mix(in oklch, var(--primary), transparent 95%);
  transform: translateY(-1px);
}

.audit-session-card img {
  transition: transform 180ms ease;
}

.audit-session-card:hover img {
  transform: scale(1.025);
}
</style>
