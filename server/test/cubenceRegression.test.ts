import { describe, expect, it, vi } from "vitest";
import { assertReusableGenerateSession } from "../src/lib/tasks";
import { assertAssignableProviderKey, selectResolvedProviderKey } from "../src/lib/providerKeys";
import type { ProviderKey } from "../src/db/schema";
import { normalizeOptionalSessionId } from "../src/routes/generate";
import {
  BUILT_IN_PROVIDERS,
  CUBENCE_PROVIDER_ID,
  ensureBuiltInProviders,
  isBuiltInProviderId,
  isProviderKeyAssignable,
  MICU_PROVIDER_ID
} from "../src/providers/catalog";

function providerKey(id: string): ProviderKey {
  return {
    id,
    providerId: "prv_test",
    label: id,
    model: "gpt-image-2",
    encryptedKey: "encrypted",
    keyHint: "test",
    allocatedQuota: null,
    usedQuota: 0,
    ownerAdminId: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null
  };
}

describe("Cubence integration regressions", () => {
  it("does not resolve an unbound user to a global fallback provider key", () => {
    expect(() => selectResolvedProviderKey(null, null)).toThrow("No provider key configured");
  });

  it("keeps explicit provider key precedence deterministic", () => {
    const preferred = providerKey("key_preferred");
    const assigned = providerKey("key_assigned");

    expect(selectResolvedProviderKey(preferred, assigned).id).toBe("key_preferred");
    expect(selectResolvedProviderKey(null, assigned).id).toBe("key_assigned");
  });

  it("rejects cross-user generation session reuse", () => {
    expect(() =>
      assertReusableGenerateSession(
        { userId: "usr_owner" },
        {
          sessionId: "ses_other",
          userId: "usr_attacker"
        }
      )
    ).toThrow("No access");
  });

  it("rejects missing generation session reuse instead of creating a forged id", () => {
    expect(() =>
      assertReusableGenerateSession(null, {
        sessionId: "ses_missing",
        userId: "usr_1"
      })
    ).toThrow("Session not found");
  });

  it("allows creating a new generation session when no sessionId is supplied", () => {
    expect(() => assertReusableGenerateSession(null, { userId: "usr_1" })).not.toThrow();
  });

  it("keeps both supported providers in the built-in catalog", () => {
    expect(BUILT_IN_PROVIDERS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: MICU_PROVIDER_ID,
          name: "米醋API",
          requestFormat: "openai_compatible"
        }),
        expect.objectContaining({
          id: CUBENCE_PROVIDER_ID,
          name: "Cubence",
          requestFormat: "openai_images"
        })
      ])
    );
    expect(isBuiltInProviderId(MICU_PROVIDER_ID)).toBe(true);
    expect(isBuiltInProviderId(CUBENCE_PROVIDER_ID)).toBe(true);
    expect(isBuiltInProviderId("prv_custom")).toBe(false);
  });

  it("only allows provider keys to be assigned to built-in providers", () => {
    expect(isProviderKeyAssignable(MICU_PROVIDER_ID)).toBe(true);
    expect(isProviderKeyAssignable(CUBENCE_PROVIDER_ID)).toBe(true);
    expect(isProviderKeyAssignable("prv_legacy")).toBe(false);
  });

  it("rejects legacy provider keys even when the key row itself is enabled", () => {
    const legacyKey = { ...providerKey("key_legacy"), providerId: "prv_legacy" };

    expect(() => assertAssignableProviderKey(legacyKey)).toThrow("Unsupported provider key");
  });

  it("accepts enabled built-in provider keys for assignment", () => {
    const micuKey = { ...providerKey("key_micu"), providerId: MICU_PROVIDER_ID };
    const cubenceKey = { ...providerKey("key_cubence"), providerId: CUBENCE_PROVIDER_ID };

    expect(() => assertAssignableProviderKey(micuKey)).not.toThrow();
    expect(() => assertAssignableProviderKey(cubenceKey)).not.toThrow();
  });

  it("rejects disabled or deleted provider keys before assignment", () => {
    expect(() =>
      assertAssignableProviderKey({
        ...providerKey("key_disabled"),
        providerId: MICU_PROVIDER_ID,
        enabled: false
      })
    ).toThrow("Provider key not found");
    expect(() =>
      assertAssignableProviderKey({
        ...providerKey("key_deleted"),
        providerId: MICU_PROVIDER_ID,
        deletedAt: 1
      })
    ).toThrow("Provider key not found");
  });

  it("normalizes blank generation session ids to a new-session request", () => {
    expect(normalizeOptionalSessionId("")).toBeUndefined();
    expect(normalizeOptionalSessionId("   ")).toBeUndefined();
    expect(normalizeOptionalSessionId(" ses_1 ")).toBe("ses_1");
    expect(normalizeOptionalSessionId(undefined)).toBeUndefined();
  });

  it("restores built-in providers instead of relying on insert-or-ignore only", async () => {
    type CapturedStatement = { sql: string; bindings: unknown[] };
    const batch = vi.fn(async (statements: CapturedStatement[]) => statements);
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: (...bindings: unknown[]) => ({ sql, bindings })
        }),
        batch
      }
    } as unknown as Parameters<typeof ensureBuiltInProviders>[0];

    await ensureBuiltInProviders(env);

    const statements = batch.mock.calls[0]?.[0] as CapturedStatement[];
    const updateStatements = statements.filter((statement) =>
      statement.sql.includes("UPDATE providers")
    );

    expect(updateStatements).toHaveLength(BUILT_IN_PROVIDERS.length);
    for (const provider of BUILT_IN_PROVIDERS) {
      const update = updateStatements.find((statement) => statement.bindings[0] === provider.id);
      expect(update?.sql).toContain("enabled = 1");
      expect(update?.sql).toContain("deleted_at = NULL");
      expect(update?.sql).toContain("base_url = ?3");
      expect(update?.sql).toContain("base_url <> ?3");
      expect(update?.bindings).toHaveLength(7);
      expect(update?.bindings).toEqual(
        expect.arrayContaining([provider.id, provider.name, provider.requestFormat])
      );
    }
  });
});
