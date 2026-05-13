import { describe, expect, it } from "vitest";
import { buildAdminUserEditPayload, createAdminEditFormForUser } from "./adminUserPayloads";
import { createDefaultAdminUserForm, providerKeyGroupDisplayLabel } from "./adminUserHelpers";
import type { AdminUser, ProviderKeyGroupRow } from "./adminUserTypes";

describe("admin user group payload helpers", () => {
  it("defaults sysadmin create forms to the first provider key group", () => {
    expect(createDefaultAdminUserForm(groups(), true).providerKeyGroupId).toBe("grp_1");
    expect(createDefaultAdminUserForm(groups(), false).providerKeyGroupId).toBe("");
  });

  it("creates edit form defaults from the user's key group and role limit", () => {
    const admin = user({ role: "admin", providerKeyGroupId: "grp_2", maxConcurrentTasks: null });
    const normalUser = user({ role: "user", providerKeyGroupId: null, maxConcurrentTasks: null });

    expect(createAdminEditFormForUser(admin)).toMatchObject({
      providerKeyGroupId: "grp_2",
      maxConcurrentTasks: 10
    });
    expect(createAdminEditFormForUser(normalUser)).toMatchObject({
      providerKeyGroupId: "",
      maxConcurrentTasks: 5
    });
  });

  it("builds edit payloads only for changed group and concurrency fields", () => {
    const original = user({
      providerKeyGroupId: "grp_1",
      maxConcurrentTasks: 5,
      allocatedQuota: 10
    });

    expect(
      buildAdminUserEditPayload(original, {
        nickname: original.nickname,
        status: original.status,
        providerKeyGroupId: "grp_1",
        maxConcurrentTasks: 5,
        quota: 10,
        password: ""
      })
    ).toEqual({});

    expect(
      buildAdminUserEditPayload(original, {
        nickname: "New Name",
        status: "disabled",
        providerKeyGroupId: "grp_2",
        maxConcurrentTasks: 8,
        quota: null,
        password: "password456"
      })
    ).toEqual({
      nickname: "New Name",
      status: "disabled",
      providerKeyGroupId: "grp_2",
      maxConcurrentTasks: 8,
      quota: null,
      password: "password456"
    });
  });

  it("resolves provider key group display labels with API name fallback", () => {
    expect(providerKeyGroupDisplayLabel(groups(), "-", "grp_1", null)).toBe("Primary Group");
    expect(providerKeyGroupDisplayLabel(groups(), "-", "grp_missing", null)).toBe("grp_missing");
    expect(providerKeyGroupDisplayLabel(groups(), "-", null, null)).toBe("-");
    expect(providerKeyGroupDisplayLabel(groups(), "-", "grp_1", "API Name")).toBe("API Name");
  });
});

function groups(): ProviderKeyGroupRow[] {
  return [
    {
      id: "grp_1",
      providerId: "prv_micu",
      name: "Primary Group",
      enabled: true
    },
    {
      id: "grp_2",
      providerId: "prv_micu",
      name: "Backup Group",
      enabled: true
    }
  ];
}

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "usr_1",
    email: "usr_1@example.com",
    username: "usr_1",
    nickname: "User One",
    role: "user",
    status: "active",
    preferredProviderKeyId: null,
    providerKeyGroupId: "grp_1",
    providerKeyGroupName: "Primary Group",
    providerKeyGroupProviderId: "prv_micu",
    maxConcurrentTasks: 5,
    allocatedQuota: 10,
    usedQuota: 0,
    generationCount: 0,
    lastGenerationAt: null,
    createdAt: 1,
    updatedAt: 1,
    lastLoginAt: null,
    ...overrides
  };
}
