import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import {
  getGenerationEntryAdmin,
  saveGenerationEntrySettings,
  type GenerationPageUsageMetric,
  type GenerationRoute,
  type GenerationUsageWindow
} from "@/api/generation";

export type GenerationPageSwitchKey = "workspace" | "aiImage";

export type GenerationPageUsageRow = {
  key: GenerationPageSwitchKey;
  route: GenerationRoute;
  label: string;
  submitted: number;
  succeeded: number;
  failed: number;
  successRate: string;
  sharePercent: string;
  barWidth: string;
};

export function useGenerationEntryAdmin() {
  const { t } = useI18n();
  const loading = ref(false);
  const saving = ref(false);
  const switches = reactive<Record<GenerationPageSwitchKey, boolean>>({
    workspace: true,
    aiImage: true
  });
  const metricsWindow = ref<GenerationUsageWindow | null>(null);
  const pageUsage = ref<GenerationPageUsageMetric[]>([]);

  const switchOptions = computed(() => [
    {
      key: "workspace" as const,
      title: t("generationEntry.workspacePage"),
      description: t("generationEntry.workspacePageHint"),
      enabled: switches.workspace
    },
    {
      key: "aiImage" as const,
      title: t("generationEntry.aiImagePage"),
      description: t("generationEntry.aiImagePageHint"),
      enabled: switches.aiImage
    }
  ]);
  const metricsWindowText = computed(() =>
    metricsWindow.value
      ? t("generationEntry.metricsWindow", { days: metricsWindow.value.days })
      : ""
  );
  const pageUsageRows = computed<GenerationPageUsageRow[]>(() => {
    const rows = [
      buildUsageRow("workspace", "/workspace", t("generationEntry.workspacePage")),
      buildUsageRow("aiImage", "/ai-image", t("generationEntry.aiImagePage"))
    ];
    const maxSubmitted = Math.max(1, ...rows.map((row) => row.submitted));
    const total = rows.reduce((sum, row) => sum + row.submitted, 0);
    return rows.map((row) => ({
      ...row,
      sharePercent: total ? `${Math.round((row.submitted / total) * 100)}%` : "0%",
      barWidth: `${Math.max(4, Math.round((row.submitted / maxSubmitted) * 100))}%`
    }));
  });
  const totalSubmitted = computed(() =>
    pageUsageRows.value.reduce((sum, row) => sum + row.submitted, 0)
  );
  const saveDisabled = computed(() => saving.value || loading.value || !hasEnabledPage());

  async function load() {
    loading.value = true;
    try {
      const body = await getGenerationEntryAdmin();
      switches.workspace = body.settings.showWorkspace;
      switches.aiImage = body.settings.showAiImage;
      metricsWindow.value = body.usageWindow;
      pageUsage.value = body.pageUsage ?? [];
    } finally {
      loading.value = false;
    }
  }

  async function save() {
    if (!hasEnabledPage()) {
      toast.error(t("generationEntry.atLeastOnePage"));
      return;
    }
    saving.value = true;
    try {
      await saveGenerationEntrySettings({
        showWorkspace: switches.workspace,
        showAiImage: switches.aiImage
      });
      toast.success(t("generationEntry.saved"));
      await load();
    } finally {
      saving.value = false;
    }
  }

  function setPageEnabled(key: GenerationPageSwitchKey, enabled: boolean) {
    if (!enabled && enabledPageCount() <= 1 && switches[key]) {
      toast.error(t("generationEntry.atLeastOnePage"));
      return;
    }
    switches[key] = enabled;
  }

  function hasEnabledPage() {
    return switches.workspace || switches.aiImage;
  }

  function enabledPageCount() {
    return Number(switches.workspace) + Number(switches.aiImage);
  }

  function buildUsageRow(
    key: GenerationPageSwitchKey,
    route: GenerationRoute,
    label: string
  ): GenerationPageUsageRow {
    const row = pageUsage.value.find((item) => item.route === route);
    const submitted = row?.submitted ?? 0;
    const succeeded = row?.succeeded ?? 0;
    const failed = row?.failed ?? 0;
    return {
      key,
      route,
      label,
      submitted,
      succeeded,
      failed,
      successRate: submitted ? `${((succeeded / submitted) * 100).toFixed(1)}%` : "-",
      sharePercent: "0%",
      barWidth: "4%"
    };
  }

  return {
    loading,
    metricsWindowText,
    pageUsageRows,
    save,
    saveDisabled,
    saving,
    setPageEnabled,
    switchOptions,
    switches,
    totalSubmitted,
    load
  };
}
