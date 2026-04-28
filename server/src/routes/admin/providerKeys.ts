import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import { providerKeys, userProviderKeys } from "../../db/schema";
import { PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS } from "../../providers/catalog";
import type { AdminRouter } from "./common";

export function registerAdminProviderKeyRoutes(adminRoutes: AdminRouter) {
  adminRoutes.get("/provider-keys", async (c) => {
    const actor = c.get("user");
    const db = getDb(c.env);
    const baseSelect = {
      id: providerKeys.id,
      label: providerKeys.label,
      keyHint: providerKeys.keyHint,
      enabled: providerKeys.enabled
    };

    if (actor.role === "sysadmin") {
      const rows = await db
        .select(baseSelect)
        .from(providerKeys)
        .where(
          and(
            eq(providerKeys.enabled, true),
            isNull(providerKeys.deletedAt),
            inArray(providerKeys.providerId, PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS)
          )
        )
        .orderBy(desc(providerKeys.createdAt));
      return c.json({ items: rows });
    }

    const rows = await db
      .select(baseSelect)
      .from(providerKeys)
      .innerJoin(userProviderKeys, eq(userProviderKeys.providerKeyId, providerKeys.id))
      .where(
        and(
          eq(userProviderKeys.userId, actor.id),
          eq(providerKeys.enabled, true),
          isNull(providerKeys.deletedAt),
          inArray(providerKeys.providerId, PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS)
        )
      )
      .orderBy(desc(providerKeys.createdAt));
    return c.json({ items: rows });
  });
}
