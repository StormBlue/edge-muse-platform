import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password";

describe("password helpers", () => {
  it("verifies the original password only", async () => {
    const hash = await hashPassword("password123");
    await expect(verifyPassword("password123", hash)).resolves.toBe(true);
    await expect(verifyPassword("password456", hash)).resolves.toBe(false);
  });
});
