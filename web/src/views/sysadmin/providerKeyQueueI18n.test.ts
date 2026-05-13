import { describe, expect, it } from "vitest";
import enUS from "@/locales/en-US.json";
import zhCN from "@/locales/zh-CN.json";

const requiredPaths = [
  "adminUsers.maxConcurrentTasks",
  "sysadmin.providerKeyGroup",
  "sysadmin.keyGroups",
  "sysadmin.maxConcurrency",
  "sysadmin.keyUpdateFailed",
  "sysadmin.keyDeleteFailed",
  "sysadmin.keyToggleFailed",
  "sysadmin.keyDeleteBlockedByGroup",
  "sysadmin.keyDisableBlockedLastGroupKey",
  "sysadmin.addGroupMember",
  "sysadmin.availableGroupKeys",
  "sysadmin.availableGroupKeyCount",
  "sysadmin.addKeyToGroup",
  "sysadmin.selectGroupKeyDialogTitle",
  "sysadmin.selectGroupKeyDialogDescription",
  "sysadmin.confirmAddGroupMember",
  "sysadmin.noAvailableGroupKeys",
  "sysadmin.keyGroupMembersUpdated",
  "sysadmin.dragSort"
];

describe("provider key queue i18n", () => {
  it("keeps provider key group strings in both locales", () => {
    for (const path of requiredPaths) {
      expect(readPath(zhCN, path), `zh-CN ${path}`).toBeDefined();
      expect(readPath(enUS, path), `en-US ${path}`).toBeDefined();
    }
  });
});

function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}
