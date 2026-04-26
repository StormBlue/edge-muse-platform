import { describe, expect, it } from "vitest";
import { hashPassword, isLegacyPasswordHash, verifyPassword } from "../src/lib/password";

describe("password helpers", () => {
  it("verifies the original password only", async () => {
    const hash = await hashPassword("password123");
    expect(hash.startsWith("pbkdf2-sha256$v=1$")).toBe(true);
    await expect(verifyPassword("password123", hash)).resolves.toBe(true);
    await expect(verifyPassword("password456", hash)).resolves.toBe(false);
  });

  it("does not run legacy argon2 hashes in the Worker", async () => {
    const hash = "argon2id$v=1$t=3,m=16384,p=1$c2FsdA==$aGFzaA==";
    expect(isLegacyPasswordHash(hash)).toBe(true);
    await expect(verifyPassword("password123", hash)).resolves.toBe(false);
  });

  it("treats malformed password hashes as invalid", async () => {
    await expect(
      verifyPassword("password123", "pbkdf2-sha256$v=1$i=120000,l=32$not-base64$also-bad")
    ).resolves.toBe(false);
  });
});
