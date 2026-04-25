import { describe, expect, it } from "vitest";
import { decryptString, encryptString, sha256Hex } from "../src/lib/crypto";

describe("crypto helpers", () => {
  it("encrypts and decrypts strings", async () => {
    const secret = "local-test-key-material";
    const encrypted = await encryptString("provider-secret", secret);
    expect(encrypted).not.toContain("provider-secret");
    await expect(decryptString(encrypted, secret)).resolves.toBe("provider-secret");
  });

  it("computes sha256 hex", async () => {
    await expect(sha256Hex(new TextEncoder().encode("edge"))).resolves.toHaveLength(64);
  });
});
