/**
 * Web 端轻量烟测：保证 Vitest 管线可用；与业务 store 的单元测试可逐步在此目录旁扩展。
 */
import { describe, expect, it } from "vitest";

describe("web smoke", () => {
  it("keeps the test runner wired", () => {
    expect(true).toBe(true);
  });
});
