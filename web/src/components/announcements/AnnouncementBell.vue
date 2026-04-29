<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { ChevronLeft, ChevronRight, Megaphone, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import {
  getAnnouncementDetail,
  getRecentAnnouncements,
  listAnnouncements,
  markAnnouncementRead,
  type AnnouncementDetail,
  type AnnouncementListItem
} from "@/api/announcements";
import { ScrollArea } from "@/components/ui/scroll-area";

const { t, locale } = useI18n();
const AnnouncementMarkdown = defineAsyncComponent(() => import("./AnnouncementMarkdown.vue"));
const rootRef = ref<HTMLElement | null>(null);
const popoverOpen = ref(false);
const listDialogOpen = ref(false);
const detailDialogOpen = ref(false);
const loadingRecent = ref(false);
const loadingList = ref(false);
const loadingDetail = ref(false);
const recentItems = ref<AnnouncementListItem[]>([]);
const listItems = ref<AnnouncementListItem[]>([]);
const selectedDetail = ref<AnnouncementDetail | null>(null);
const hasMoreRecent = ref(false);
const unreadCount = ref(0);
const page = ref(1);
const totalPages = ref(1);
const total = ref(0);

const hasUnread = computed(() => unreadCount.value > 0);
const bellTitle = computed(() =>
  hasUnread.value
    ? t("announcements.unreadCount", { count: unreadCount.value })
    : t("announcements.title")
);

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutsidePointer);
  void loadRecent();
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutsidePointer);
});

async function loadRecent() {
  loadingRecent.value = true;
  try {
    const body = await getRecentAnnouncements();
    recentItems.value = body.items;
    hasMoreRecent.value = body.hasMore;
    unreadCount.value = body.unreadCount;
  } finally {
    loadingRecent.value = false;
  }
}

async function loadList(nextPage = page.value) {
  loadingList.value = true;
  try {
    const body = await listAnnouncements({ page: nextPage, pageSize: 10 });
    listItems.value = body.items;
    page.value = body.page;
    total.value = body.total;
    totalPages.value = body.totalPages;
    unreadCount.value = body.unreadCount;
  } finally {
    loadingList.value = false;
  }
}

async function openDetail(item: AnnouncementListItem) {
  loadingDetail.value = true;
  detailDialogOpen.value = true;
  try {
    const body = await getAnnouncementDetail(item.id);
    selectedDetail.value = body.item;
    unreadCount.value = body.unreadCount;
    if (!body.item.isRead) {
      const readBody = await markAnnouncementRead(item.id);
      unreadCount.value = readBody.unreadCount;
      markLocalRead(item.id);
      selectedDetail.value = { ...body.item, isRead: true };
    }
  } finally {
    loadingDetail.value = false;
  }
}

function openListDialog() {
  popoverOpen.value = false;
  listDialogOpen.value = true;
  void loadList(1);
}

function closeDetail() {
  detailDialogOpen.value = false;
  selectedDetail.value = null;
}

function markLocalRead(id: string) {
  recentItems.value = recentItems.value.map((item) =>
    item.id === id ? { ...item, isRead: true } : item
  );
  listItems.value = listItems.value.map((item) =>
    item.id === id ? { ...item, isRead: true } : item
  );
}

function closeOnOutsidePointer(event: PointerEvent) {
  if (!popoverOpen.value) return;
  if (rootRef.value?.contains(event.target as Node)) return;
  popoverOpen.value = false;
}

function formatDateTime(value?: number | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale.value, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      class="ui-button ui-button-secondary ui-icon-button relative"
      type="button"
      :title="bellTitle"
      :aria-label="bellTitle"
      :aria-expanded="popoverOpen"
      aria-haspopup="dialog"
      @click="
        popoverOpen = !popoverOpen;
        if (popoverOpen) loadRecent();
      "
      @keydown.esc="popoverOpen = false"
    >
      <Megaphone class="h-4 w-4" />
      <span v-if="hasUnread" class="announcement-dot" aria-hidden="true"></span>
    </button>

    <div
      v-if="popoverOpen"
      class="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      role="dialog"
    >
      <div class="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold">{{ t("announcements.title") }}</p>
          <p class="text-xs text-muted-foreground">
            {{
              hasUnread
                ? t("announcements.unreadCount", { count: unreadCount })
                : t("announcements.allRead")
            }}
          </p>
        </div>
        <button
          class="ui-button ui-button-secondary h-8 w-8 p-0"
          type="button"
          :aria-label="t('common.close')"
          @click="popoverOpen = false"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div v-if="loadingRecent" class="p-5 text-center text-sm text-muted-foreground">
        {{ t("common.loading") }}
      </div>
      <div v-else-if="!recentItems.length" class="p-5 text-center text-sm text-muted-foreground">
        {{ t("announcements.empty") }}
      </div>
      <div v-else class="max-h-96 overflow-y-auto p-2">
        <button
          v-for="item in recentItems"
          :key="item.id"
          class="flex w-full min-w-0 gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-muted"
          type="button"
          @click="openDetail(item)"
        >
          <span
            class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            :class="item.isRead ? 'bg-transparent' : 'bg-destructive'"
          ></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold">{{ item.title }}</span>
            <span class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {{ item.contentPreview || t("announcements.noPreview") }}
            </span>
            <span class="mt-1 block text-xs text-muted-foreground">
              {{ formatDateTime(item.publishedAt) }}
            </span>
          </span>
        </button>
      </div>

      <div v-if="hasMoreRecent" class="border-t border-border p-2">
        <button
          class="ui-button ui-button-secondary w-full text-sm"
          type="button"
          @click="openListDialog"
        >
          {{ t("announcements.viewMore") }}
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="listDialogOpen"
        class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-3"
        role="dialog"
        aria-modal="true"
        @click.self="listDialogOpen = false"
      >
        <section
          class="flex h-[min(42rem,calc(100dvh-2rem))] w-[min(48rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        >
          <header class="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 class="font-semibold">{{ t("announcements.moreTitle") }}</h2>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t("announcements.totalCount", { count: total }) }}
              </p>
            </div>
            <button
              class="ui-button ui-button-secondary ui-icon-button"
              type="button"
              :aria-label="t('common.close')"
              @click="listDialogOpen = false"
            >
              <X class="h-4 w-4" />
            </button>
          </header>
          <ScrollArea class="min-h-0 flex-1">
            <div v-if="loadingList" class="p-8 text-center text-sm text-muted-foreground">
              {{ t("common.loading") }}
            </div>
            <div
              v-else-if="!listItems.length"
              class="p-8 text-center text-sm text-muted-foreground"
            >
              {{ t("announcements.empty") }}
            </div>
            <div v-else class="divide-y divide-border">
              <button
                v-for="item in listItems"
                :key="item.id"
                class="flex w-full gap-3 p-4 text-left transition hover:bg-muted/50"
                type="button"
                @click="openDetail(item)"
              >
                <span
                  class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full"
                  :class="item.isRead ? 'bg-muted' : 'bg-destructive'"
                ></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{{ item.title }}</span>
                  <span class="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {{ item.contentPreview || t("announcements.noPreview") }}
                  </span>
                  <span class="mt-2 block text-xs text-muted-foreground">
                    {{ formatDateTime(item.publishedAt) }}
                  </span>
                </span>
              </button>
            </div>
          </ScrollArea>
          <footer
            class="flex items-center justify-between gap-3 border-t border-border p-3 text-sm"
          >
            <button
              class="ui-button ui-button-secondary h-9"
              type="button"
              :disabled="page <= 1 || loadingList"
              @click="loadList(page - 1)"
            >
              <ChevronLeft class="h-4 w-4" />
              {{ t("common.previous") }}
            </button>
            <span class="text-muted-foreground">{{ page }} / {{ totalPages }}</span>
            <button
              class="ui-button ui-button-secondary h-9"
              type="button"
              :disabled="page >= totalPages || loadingList"
              @click="loadList(page + 1)"
            >
              {{ t("common.next") }}
              <ChevronRight class="h-4 w-4" />
            </button>
          </footer>
        </section>
      </div>

      <div
        v-if="detailDialogOpen"
        class="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-3"
        role="dialog"
        aria-modal="true"
        @click.self="closeDetail"
      >
        <section
          class="flex h-[min(44rem,calc(100dvh-2rem))] w-[min(48rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        >
          <header class="flex items-start justify-between gap-3 border-b border-border p-4">
            <div class="min-w-0">
              <h2 class="truncate font-semibold">
                {{ selectedDetail?.title ?? t("announcements.detailTitle") }}
              </h2>
              <p v-if="selectedDetail" class="mt-1 text-xs text-muted-foreground">
                {{ formatDateTime(selectedDetail.publishedAt) }}
              </p>
            </div>
            <button
              class="ui-button ui-button-secondary ui-icon-button shrink-0"
              type="button"
              :aria-label="t('common.close')"
              @click="closeDetail"
            >
              <X class="h-4 w-4" />
            </button>
          </header>
          <ScrollArea class="min-h-0 flex-1">
            <div v-if="loadingDetail" class="p-8 text-center text-sm text-muted-foreground">
              {{ t("common.loading") }}
            </div>
            <div v-else-if="selectedDetail" class="p-4">
              <AnnouncementMarkdown :content="selectedDetail.content" />
            </div>
          </ScrollArea>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.announcement-dot {
  position: absolute;
  right: 0.35rem;
  top: 0.35rem;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--destructive);
  box-shadow: 0 0 0 0 color-mix(in oklch, var(--destructive), transparent 20%);
  animation: announcement-pulse 1.6s ease-out infinite;
}

@keyframes announcement-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in oklch, var(--destructive), transparent 20%);
    transform: scale(1);
  }
  70% {
    box-shadow: 0 0 0 0.5rem color-mix(in oklch, var(--destructive), transparent 100%);
    transform: scale(1.08);
  }
  100% {
    box-shadow: 0 0 0 0 color-mix(in oklch, var(--destructive), transparent 100%);
    transform: scale(1);
  }
}
</style>
