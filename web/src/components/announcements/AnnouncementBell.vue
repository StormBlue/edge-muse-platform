<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, Megaphone, X } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import {
  getAnnouncementDetail,
  getRecentAnnouncements,
  listAnnouncements,
  markAnnouncementRead,
  type AnnouncementDetail,
  type AnnouncementListItem
} from "@/api/announcements";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const { t, locale } = useI18n();
const AnnouncementMarkdown = defineAsyncComponent(() => import("./AnnouncementMarkdown.vue"));
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
  void loadRecent();
});

watch(popoverOpen, (open) => {
  if (open) void loadRecent();
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
  <Popover v-model:open="popoverOpen">
    <PopoverTrigger as-child>
      <Button
        class="announcement-trigger relative"
        variant="secondary"
        size="icon"
        type="button"
        :title="bellTitle"
        :aria-label="bellTitle"
      >
        <Megaphone class="h-4 w-4" />
        <span v-if="hasUnread" class="announcement-dot" aria-hidden="true"></span>
      </Button>
    </PopoverTrigger>

    <PopoverContent
      align="end"
      side="bottom"
      :side-offset="8"
      :collision-padding="12"
      class="!w-[min(22rem,calc(100vw-2rem))] overflow-hidden !rounded-lg !p-0 shadow-xl"
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
        <Button
          class="announcement-close-button"
          variant="secondary"
          size="icon"
          type="button"
          :aria-label="t('common.close')"
          @click="popoverOpen = false"
        >
          <X class="h-4 w-4" />
        </Button>
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
        <Button class="w-full text-sm" variant="secondary" type="button" @click="openListDialog">
          {{ t("announcements.viewMore") }}
        </Button>
      </div>
    </PopoverContent>

    <Dialog v-model:open="listDialogOpen">
      <DialogContent
        class="flex h-[min(42rem,calc(100dvh-2rem))] max-w-[min(48rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader class="border-b border-border p-4 pr-12">
          <DialogTitle>{{ t("announcements.moreTitle") }}</DialogTitle>
          <p class="text-xs text-muted-foreground">
            {{ t("announcements.totalCount", { count: total }) }}
          </p>
        </DialogHeader>
        <ScrollArea class="min-h-0 flex-1">
          <div v-if="loadingList" class="p-8 text-center text-sm text-muted-foreground">
            {{ t("common.loading") }}
          </div>
          <div v-else-if="!listItems.length" class="p-8 text-center text-sm text-muted-foreground">
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
        <DialogFooter
          class="flex-row items-center justify-between border-t border-border p-3 text-sm"
        >
          <Button
            class="h-9"
            variant="secondary"
            type="button"
            :disabled="page <= 1 || loadingList"
            @click="loadList(page - 1)"
          >
            <ChevronLeft class="h-4 w-4" />
            {{ t("common.previous") }}
          </Button>
          <span class="text-muted-foreground">{{ page }} / {{ totalPages }}</span>
          <Button
            class="h-9"
            variant="secondary"
            type="button"
            :disabled="page >= totalPages || loadingList"
            @click="loadList(page + 1)"
          >
            {{ t("common.next") }}
            <ChevronRight class="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="detailDialogOpen" @update:open="(open) => !open && closeDetail()">
      <DialogContent
        class="flex h-[min(44rem,calc(100dvh-2rem))] max-w-[min(48rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader class="border-b border-border p-4 pr-12">
          <DialogTitle class="truncate">
            {{ selectedDetail?.title ?? t("announcements.detailTitle") }}
          </DialogTitle>
          <p v-if="selectedDetail" class="text-xs text-muted-foreground">
            {{ formatDateTime(selectedDetail.publishedAt) }}
          </p>
        </DialogHeader>
        <ScrollArea class="min-h-0 flex-1">
          <div v-if="loadingDetail" class="p-8 text-center text-sm text-muted-foreground">
            {{ t("common.loading") }}
          </div>
          <div v-else-if="selectedDetail" class="p-4">
            <AnnouncementMarkdown :content="selectedDetail.content" />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  </Popover>
</template>

<style scoped>
.announcement-trigger,
.announcement-close-button {
  width: 2.25rem;
  min-width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  padding: 0;
}

.announcement-trigger :deep(svg),
.announcement-close-button :deep(svg) {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

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
