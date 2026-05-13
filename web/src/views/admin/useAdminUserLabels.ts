import { computed, type Ref } from "vue";
import {
  aggregateAdminUsage,
  formatAdminUserDateTime,
  providerKeyGroupDisplayLabel
} from "./adminUserHelpers";
import type { ProviderKeyGroupRow, UsageResponse } from "./adminUserTypes";

type Translate = (key: string, named?: Record<string, unknown>) => string;

export function useAdminUserLabels(input: {
  groups: Ref<ProviderKeyGroupRow[]>;
  locale: Ref<string>;
  t: Translate;
  usage: Ref<UsageResponse | null>;
  userListOffset: Ref<number>;
}) {
  const { groups, locale, t, usage, userListOffset } = input;
  const statusItems = computed(() => aggregateAdminUsage(usage.value, "status", statusLabel));
  const modeItems = computed(() => aggregateAdminUsage(usage.value, "mode", modeLabel));
  const trendPoints = computed(
    () =>
      usage.value?.trend.map((point) => ({
        label: String(point.day),
        value: point.count
      })) ?? []
  );

  function statusLabel(value: string) {
    if (value === "active") return t("common.enabled");
    if (value === "disabled") return t("common.disabled");
    if (value === "succeeded") return t("common.succeeded");
    if (value === "failed") return t("common.failed");
    if (value === "running") return t("common.running");
    if (value === "queued") return t("common.queued");
    return value;
  }

  function roleLabel(value: string) {
    if (value === "admin") return t("adminUsers.roleAdmin");
    if (value === "user") return t("adminUsers.roleUser");
    return value;
  }

  function formatDateTime(value?: number | null) {
    return formatAdminUserDateTime(locale.value, value);
  }

  function groupLabel(id?: string | null, name?: string | null) {
    return providerKeyGroupDisplayLabel(groups.value, t("sysadmin.unassigned"), id, name);
  }

  function modeLabel(mode: string) {
    if (mode === "text2image") return t("workspace.text2image");
    if (mode === "image2image") return t("workspace.image2image");
    return mode;
  }

  function tableRowNumber(index: number) {
    return userListOffset.value + index + 1;
  }

  return {
    statusItems,
    modeItems,
    trendPoints,
    statusLabel,
    roleLabel,
    formatDateTime,
    groupLabel,
    tableRowNumber
  };
}
