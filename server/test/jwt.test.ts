import { describe, expect, it } from "vitest";
import { signJwt, verifyJwt } from "../src/lib/jwt";

describe("jwt helpers", () => {
  it("signs and verifies access tokens", async () => {
    const token = await signJwt(
      "test-secret",
      { sub: "usr_1", email: "a@example.com", role: "user", type: "access" },
      60
    );
    const payload = await verifyJwt("test-secret", token, "access");
    expect(payload.sub).toBe("usr_1");
    expect(payload.type).toBe("access");
  });
});
