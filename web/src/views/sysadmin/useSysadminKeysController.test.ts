import { describe, expect, it } from "vitest";
import { reorderProviderKeyIds, type GroupMember } from "./useSysadminKeysController";

describe("provider key group member ordering", () => {
  it("builds sorted member payloads for drag and button moves", () => {
    const members = groupMembers(["key_1", "key_2", "key_3"]);

    expect(reorderProviderKeyIds(members, 0, 2)).toEqual(["key_2", "key_3", "key_1"]);
    expect(reorderProviderKeyIds(members, 2, 0)).toEqual(["key_3", "key_1", "key_2"]);
  });

  it("clamps target indexes and ignores invalid source indexes", () => {
    const members = groupMembers(["key_1", "key_2", "key_3"]);

    expect(reorderProviderKeyIds(members, 1, 99)).toEqual(["key_1", "key_3", "key_2"]);
    expect(reorderProviderKeyIds(members, 1, -99)).toEqual(["key_2", "key_1", "key_3"]);
    expect(reorderProviderKeyIds(members, 9, 0)).toEqual(["key_1", "key_2", "key_3"]);
  });
});

function groupMembers(ids: string[]): GroupMember[] {
  return ids.map((id, index) => ({
    id,
    providerKeyId: id,
    providerId: "prv_micu",
    label: id,
    model: "gpt-image-2",
    keyHint: "test",
    enabled: true,
    allocatedQuota: null,
    usedQuota: 0,
    maxConcurrency: 1,
    activeSlots: 0,
    sortOrder: index
  }));
}
