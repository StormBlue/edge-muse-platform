import type { AdminEditUserForm } from "./adminUserHelpers";
import type { AdminUser } from "./adminUserTypes";

export type AdminUserEditPayload = {
  nickname?: string;
  status?: "active" | "disabled";
  providerKeyId?: string;
  quota?: number | null;
  password?: string;
};

export function createAdminEditFormForUser(user: AdminUser): AdminEditUserForm {
  return {
    nickname: user.nickname,
    status: user.status,
    providerKeyId: user.providerKeyId ?? user.preferredProviderKeyId ?? "",
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
  const currentProviderKeyId = user.providerKeyId ?? user.preferredProviderKeyId ?? "";
  if (editForm.providerKeyId && editForm.providerKeyId !== currentProviderKeyId) {
    payload.providerKeyId = editForm.providerKeyId;
  }
  if (editForm.quota !== user.allocatedQuota) payload.quota = editForm.quota;
  if (editForm.password) payload.password = editForm.password;
  return payload;
}
