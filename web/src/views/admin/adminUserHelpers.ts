import type { ProviderKeyRow, UsageResponse } from "./adminUserTypes";

export type AdminCreateUserForm = {
  role: "admin" | "user";
  username: string;
  nickname: string;
  password: string;
  email: string;
  providerKeyId: string;
  quota: number;
};

export type AdminEditUserForm = {
  nickname: string;
  status: "active" | "disabled";
  providerKeyId: string;
  quota: number | null;
  password: string;
};

export type AdminPasswordForm = {
  password: string;
  confirmPassword: string;
};

/** 用户管理页的表单默认值集中在这里，避免弹窗重置逻辑散落在控制器里。 */
export function createDefaultAdminUserForm(keys: ProviderKeyRow[] = []): AdminCreateUserForm {
  return {
    role: "user",
    username: "",
    nickname: "",
    password: "",
    email: "",
    providerKeyId: keys[0]?.id ?? "",
    quota: 10
  };
}

export function createDefaultAdminEditForm(): AdminEditUserForm {
  return {
    nickname: "",
    status: "active",
    providerKeyId: "",
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

/** Provider Key 只展示脱敏 hint；真实 key 不进入前端页面。 */
export function providerKeyDisplayLabel(
  keys: ProviderKeyRow[],
  unassignedLabel: string,
  id?: string | null
) {
  if (!id) return unassignedLabel;
  const key = keys.find((item) => item.id === id);
  return key ? `${key.label} (${key.keyHint})` : id;
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
