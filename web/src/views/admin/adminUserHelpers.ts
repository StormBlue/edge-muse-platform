import type { ProviderKeyGroupRow, UsageResponse } from "./adminUserTypes";

export type AdminCreateUserForm = {
  role: "admin" | "user";
  username: string;
  nickname: string;
  password: string;
  email: string;
  providerKeyGroupId: string;
  maxConcurrentTasks: number;
  quota: number;
};

export type AdminEditUserForm = {
  nickname: string;
  status: "active" | "disabled";
  providerKeyGroupId: string;
  maxConcurrentTasks: number;
  quota: number | null;
  password: string;
};

export type AdminPasswordForm = {
  password: string;
  confirmPassword: string;
};

/** 用户管理页的表单默认值集中在这里，避免弹窗重置逻辑散落在控制器里。 */
export function createDefaultAdminUserForm(
  groups: ProviderKeyGroupRow[] = [],
  isSysadmin = false
): AdminCreateUserForm {
  return {
    role: "user",
    username: "",
    nickname: "",
    password: "",
    email: "",
    providerKeyGroupId: isSysadmin ? (groups[0]?.id ?? "") : "",
    maxConcurrentTasks: 5,
    quota: 10
  };
}

export function createDefaultAdminEditForm(): AdminEditUserForm {
  return {
    nickname: "",
    status: "active",
    providerKeyGroupId: "",
    maxConcurrentTasks: 5,
    quota: 0,
    password: ""
  };
}

export function createDefaultAdminPasswordForm(): AdminPasswordForm {
  return { password: "", confirmPassword: "" };
}

export function formatAdminUserDateTime(locale: string, value?: number | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

export function providerKeyGroupDisplayLabel(
  groups: ProviderKeyGroupRow[],
  fallbackLabel: string,
  id?: string | null,
  name?: string | null
) {
  if (name) return name;
  if (!id) return fallbackLabel;
  return groups.find((item) => item.id === id)?.name ?? id;
}

/** 把后端按状态/模式返回的统计行聚合成图表组件统一消费的 `{ label, value }`。 */
export function aggregateAdminUsage(
  usage: UsageResponse | null,
  key: "status" | "mode",
  resolveLabel: (value: string) => string
) {
  const map = new Map<string, number>();
  for (const row of usage?.stats ?? []) {
    const label = resolveLabel(row[key]);
    map.set(label, (map.get(label) ?? 0) + row.count);
  }
  return Array.from(map, ([label, value]) => ({ label, value }));
}
