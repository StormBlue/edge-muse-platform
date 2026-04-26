import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password";

describe("password helpers", () => {
  it("verifies the original password only", async () => {
    const hash = await hashPassword("password123");
    expect(hash.startsWith("pbkdf2-sha256$v=1$")).toBe(true);
    expect(hash).toContain("$i=100000,l=32$");
    await expect(verifyPassword("password123", hash)).resolves.toBe(true);
    await expect(verifyPassword("password456", hash)).resolves.toBe(false);
  });

  it("treats malformed password hashes as invalid", async () => {
    await expect(
      verifyPassword("password123", "pbkdf2-sha256$v=1$i=100000,l=32$not-base64$also-bad")
    ).resolves.toBe(false);
  });
});
