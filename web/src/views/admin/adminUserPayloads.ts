import type { AdminEditUserForm } from "./adminUserHelpers";
import type { AdminUser } from "./adminUserTypes";

export type AdminUserEditPayload = {
  nickname?: string;
  status?: "active" | "disabled";
  providerKeyGroupId?: string;
  maxConcurrentTasks?: number;
  quota?: number | null;
  password?: string;
};

export function createAdminEditFormForUser(user: AdminUser): AdminEditUserForm {
  return {
    nickname: user.nickname,
    status: user.status,
    providerKeyGroupId: user.providerKeyGroupId ?? "",
    maxConcurrentTasks: user.maxConcurrentTasks ?? (user.role === "admin" ? 10 : 5),
    quota: user.allocatedQuota,
    password: ""
  };
}

export function buildAdminUserEditPayload(
  user: AdminUser,
  editForm: AdminEditUserForm
): AdminUserEditPayload {
  const payload: AdminUserEditPayload = {};
  if (editForm.nickname !== user.nickname) payload.nickname = editForm.nickname;
  if (editForm.status !== user.status) payload.status = editForm.status;
  const currentProviderKeyGroupId = user.providerKeyGroupId ?? "";
  if (editForm.providerKeyGroupId && editForm.providerKeyGroupId !== currentProviderKeyGroupId) {
    payload.providerKeyGroupId = editForm.providerKeyGroupId;
  }
  if (
    editForm.maxConcurrentTasks !== (user.maxConcurrentTasks ?? (user.role === "admin" ? 10 : 5))
  ) {
    payload.maxConcurrentTasks = editForm.maxConcurrentTasks;
  }
  if (editForm.quota !== user.allocatedQuota) payload.quota = editForm.quota;
  if (editForm.password) payload.password = editForm.password;
  return payload;
}
