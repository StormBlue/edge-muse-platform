<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Archive, Edit3, Megaphone, RefreshCw, Send, Trash2 } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import {
  createSysadminAnnouncement,
  deleteSysadminAnnouncement,
  listSysadminAnnouncements,
  updateSysadminAnnouncement,
  type AnnouncementStatus,
  type AnnouncementTargetAudience,
  type SysadminAnnouncementItem
} from "@/api/announcements";
import AnnouncementMarkdown from "@/components/announcements/AnnouncementMarkdown.vue";
import AppShell from "@/components/layout/AppShell.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUiStore } from "@/stores/ui";

type AnnouncementForm = {
  title: string;
  targetAudience: AnnouncementTargetAudience;
  content: string;
};

const { t } = useI18n();
const ui = useUiStore();
const loading = ref(false);
const saving = ref(false);
const items = ref<SysadminAnnouncementItem[]>([]);
const editing = ref<SysadminAnnouncementItem | null>(null);
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const filters = reactive<{
  q: string;
  status: "" | AnnouncementStatus;
  targetAudience: "" | AnnouncementTargetAudience;
}>({
  q: "",
  status: "",
  targetAudience: ""
});
const form = reactive<AnnouncementForm>({
  title: "",
  targetAudience: "all",
  content: ""
});

const formTitle = computed(() =>
  editing.value ? t("announcementsAdmin.editTitle") : t("announcementsAdmin.createTitle")
);
const previewContent = computed(() => form.content.trim());
const ALL_STATUS_VALUE = "__all_status__";
const ALL_TARGET_VALUE = "__all_target__";
const statusSelectValue = computed({
  get: () => filters.status || ALL_STATUS_VALUE,
  set: (value: string) => {
    filters.status = value === ALL_STATUS_VALUE ? "" : (value as AnnouncementStatus);
  }
});
const targetSelectValue = computed({
  get: () => filters.targetAudience || ALL_TARGET_VALUE,
  set: (value: string) => {
    filters.targetAudience =
      value === ALL_TARGET_VALUE ? "" : (value as AnnouncementTargetAudience);
  }
});

onMounted(() => load());

async function load(nextPage = page.value) {
  loading.value = true;
  try {
    const body = await listSysadminAnnouncements({
      page: nextPage,
      pageSize: 12,
      q: filters.q,
      status: filters.status,
      targetAudience: filters.targetAudience
    });
    items.value = body.items;
    page.value = body.page;
    total.value = body.total;
    totalPages.value = body.totalPages;
  } finally {
    loading.value = false;
  }
}

async function save(status: AnnouncementStatus) {
  if (!form.title.trim() || !form.content.trim()) {
    toast.error(t("announcementsAdmin.required"));
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await updateSysadminAnnouncement(editing.value.id, {
        title: form.title.trim(),
        content: form.content.trim(),
        targetAudience: form.targetAudience,
        status
      });
      toast.success(t("announcementsAdmin.updated"));
    } else {
      await createSysadminAnnouncement({
        title: form.title.trim(),
        content: form.content.trim(),
        targetAudience: form.targetAudience,
        status
      });
      toast.success(
        status === "published" ? t("announcementsAdmin.published") : t("announcementsAdmin.saved")
      );
    }
    resetForm();
    await load(1);
  } finally {
    saving.value = false;
  }
}

async function changeStatus(item: SysadminAnnouncementItem, status: AnnouncementStatus) {
  saving.value = true;
  try {
    await updateSysadminAnnouncement(item.id, { status });
    toast.success(t("announcementsAdmin.updated"));
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(item: SysadminAnnouncementItem) {
  if (!window.confirm(t("announcementsAdmin.deleteConfirm", { title: item.title }))) return;
  saving.value = true;
  try {
    await deleteSysadminAnnouncement(item.id);
    toast.success(t("announcementsAdmin.deleted"));
    if (editing.value?.id === item.id) resetForm();
    await load();
  } finally {
    saving.value = false;
  }
}

function edit(item: SysadminAnnouncementItem) {
  editing.value = item;
  form.title = item.title;
  form.targetAudience = item.targetAudience;
  form.content = item.content;
}

function resetForm() {
  editing.value = null;
  form.title = "";
  form.targetAudience = "all";
  form.content = "";
}

function statusLabel(status: AnnouncementStatus) {
  return t(`announcementsAdmin.status.${status}`);
}

function targetLabel(target: AnnouncementTargetAudience) {
  return target === "admins"
    ? t("announcementsAdmin.targetAdmins")
    : t("announcementsAdmin.targetAll");
}

function formatDateTime(value?: number | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(ui.locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}
</script>

<template>
  <AppShell>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">{{ t("announcementsAdmin.title") }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ t("announcementsAdmin.subtitle") }}</p>
      </div>
      <Button variant="secondary" type="button" @click="load()">
        <RefreshCw class="h-4 w-4" />
        {{ t("sysadmin.refreshList") }}
      </Button>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(26rem,0.88fr)_minmax(0,1.12fr)]">
      <section class="panel overflow-hidden">
        <div class="border-b border-border p-4">
          <h2 class="font-semibold">{{ formTitle }}</h2>
          <p v-if="editing" class="mt-1 text-xs text-muted-foreground">
            {{ t("announcementsAdmin.editingHint") }}
          </p>
        </div>
        <form class="space-y-4 p-4" @submit.prevent="save('published')">
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("announcementsAdmin.fieldTitle") }}
            </span>
            <Input
              v-model="form.title"
              class="h-10 px-3"
              :placeholder="t('announcementsAdmin.titlePlaceholder')"
              maxlength="120"
            />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("announcementsAdmin.target") }}
            </span>
            <Select v-model="form.targetAudience">
              <SelectTrigger class="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{{ t("announcementsAdmin.targetAll") }}</SelectItem>
                <SelectItem value="admins">{{ t("announcementsAdmin.targetAdmins") }}</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("announcementsAdmin.content") }}
            </span>
            <Textarea
              v-model="form.content"
              class="min-h-72 resize-y p-3 font-mono text-sm leading-6"
              :placeholder="t('announcementsAdmin.contentPlaceholder')"
              maxlength="20000"
            />
          </label>

          <div class="flex flex-wrap justify-between gap-2">
            <Button
              v-if="editing"
              variant="secondary"
              type="button"
              :disabled="saving"
              @click="resetForm"
            >
              {{ t("common.cancel") }}
            </Button>
            <span v-else></span>
            <div class="flex flex-wrap gap-2">
              <Button variant="secondary" type="button" :disabled="saving" @click="save('draft')">
                {{ t("announcementsAdmin.saveDraft") }}
              </Button>
              <Button type="submit" :disabled="saving">
                <Send class="h-4 w-4" />
                {{ t("announcementsAdmin.publish") }}
              </Button>
            </div>
          </div>
        </form>
      </section>

      <section class="panel flex min-h-[36rem] flex-col overflow-hidden">
        <div class="border-b border-border p-4">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="font-semibold">{{ t("announcementsAdmin.preview") }}</h2>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t("announcementsAdmin.previewHint") }}
              </p>
            </div>
            <span class="rounded-full border border-border px-2.5 py-1 text-xs">
              {{ targetLabel(form.targetAudience) }}
            </span>
          </div>
        </div>
        <ScrollArea class="min-h-0 flex-1">
          <div class="p-4">
            <div v-if="previewContent" class="rounded-lg border border-border p-4">
              <h3 class="mb-3 text-lg font-semibold">{{ form.title }}</h3>
              <AnnouncementMarkdown :content="previewContent" />
            </div>
            <div
              v-else
              class="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
            >
              <Megaphone class="h-8 w-8" />
              {{ t("announcementsAdmin.previewEmpty") }}
            </div>
          </div>
        </ScrollArea>
      </section>
    </div>

    <section class="panel mt-4 overflow-hidden">
      <form
        class="grid gap-3 border-b border-border p-4 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]"
        @submit.prevent="load(1)"
      >
        <Input
          v-model="filters.q"
          class="h-10 px-3"
          :placeholder="t('announcementsAdmin.searchPlaceholder')"
        />
        <Select v-model="statusSelectValue" @update:model-value="load(1)">
          <SelectTrigger class="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_STATUS_VALUE">
              {{ t("announcementsAdmin.allStatuses") }}
            </SelectItem>
            <SelectItem value="draft">{{ t("announcementsAdmin.status.draft") }}</SelectItem>
            <SelectItem value="published">
              {{ t("announcementsAdmin.status.published") }}
            </SelectItem>
            <SelectItem value="archived">{{ t("announcementsAdmin.status.archived") }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="targetSelectValue" @update:model-value="load(1)">
          <SelectTrigger class="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_TARGET_VALUE">
              {{ t("announcementsAdmin.allTargets") }}
            </SelectItem>
            <SelectItem value="all">{{ t("announcementsAdmin.targetAll") }}</SelectItem>
            <SelectItem value="admins">{{ t("announcementsAdmin.targetAdmins") }}</SelectItem>
          </SelectContent>
        </Select>
        <Button class="h-10" type="submit">
          {{ t("common.search") }}
        </Button>
      </form>

      <div v-if="loading" class="p-8 text-center text-sm text-muted-foreground">
        {{ t("common.loading") }}
      </div>
      <div v-else-if="!items.length" class="p-8 text-center text-sm text-muted-foreground">
        {{ t("announcementsAdmin.empty") }}
      </div>
      <div v-else class="divide-y divide-border">
        <article
          v-for="item in items"
          :key="item.id"
          class="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="truncate font-semibold">{{ item.title }}</h3>
              <span class="rounded-full border border-border px-2 py-0.5 text-xs">
                {{ statusLabel(item.status) }}
              </span>
              <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {{ targetLabel(item.targetAudience) }}
              </span>
            </div>
            <p class="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {{ item.contentPreview || t("announcements.noPreview") }}
            </p>
            <p class="mt-2 text-xs text-muted-foreground">
              {{ t("announcementsAdmin.updatedAt") }} {{ formatDateTime(item.updatedAt) }}
              <span v-if="item.publishedAt">
                / {{ t("announcementsAdmin.publishedAt") }} {{ formatDateTime(item.publishedAt) }}
              </span>
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button class="h-9" variant="secondary" type="button" @click="edit(item)">
              <Edit3 class="h-4 w-4" />
              {{ t("sysadmin.edit") }}
            </Button>
            <Button
              v-if="item.status !== 'published'"
              class="h-9"
              variant="secondary"
              type="button"
              :disabled="saving"
              @click="changeStatus(item, 'published')"
            >
              <Send class="h-4 w-4" />
              {{ t("announcementsAdmin.publish") }}
            </Button>
            <Button
              v-else
              class="h-9"
              variant="secondary"
              type="button"
              :disabled="saving"
              @click="changeStatus(item, 'draft')"
            >
              {{ t("announcementsAdmin.withdraw") }}
            </Button>
            <Button
              class="h-9"
              variant="secondary"
              type="button"
              :disabled="saving"
              @click="changeStatus(item, 'archived')"
            >
              <Archive class="h-4 w-4" />
              {{ t("announcementsAdmin.archive") }}
            </Button>
            <Button
              class="h-9 text-destructive"
              variant="secondary"
              type="button"
              :disabled="saving"
              @click="remove(item)"
            >
              <Trash2 class="h-4 w-4" />
              {{ t("common.delete") }}
            </Button>
          </div>
        </article>
      </div>

      <footer class="flex items-center justify-between gap-3 border-t border-border p-3 text-sm">
        <Button
          class="h-9"
          variant="secondary"
          type="button"
          :disabled="page <= 1 || loading"
          @click="load(page - 1)"
        >
          {{ t("common.previous") }}
        </Button>
        <span class="text-muted-foreground"> {{ page }} / {{ totalPages }} · {{ total }} </span>
        <Button
          class="h-9"
          variant="secondary"
          type="button"
          :disabled="page >= totalPages || loading"
          @click="load(page + 1)"
        >
          {{ t("common.next") }}
        </Button>
      </footer>
    </section>
  </AppShell>
</template>
