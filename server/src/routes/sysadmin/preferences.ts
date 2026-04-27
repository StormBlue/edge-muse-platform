import { eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import { users } from "../../db/schema";
import { now } from "../../lib/id";
import { getAssignableProviderKey } from "../../lib/providerKeys";
import { optionalPreferredProviderKeySchema, type SysadminRouter } from "./common";

export function registerSysadminPreferenceRoutes(sysadminRoutes: SysadminRouter) {
  // 当前登录 sysadmin 个人偏好；这里只允许设置可分配的 provider key，避免 UI 默认值指向不可用密钥。
  sysadminRoutes.patch(
    "/preferences",
    zValidator("json", z.object({ preferredProviderKeyId: optionalPreferredProviderKeySchema })),
    async (c) => {
      const preferredProviderKeyId = c.req.valid("json").preferredProviderKeyId;
      if (preferredProviderKeyId) {
        await getAssignableProviderKey(c.env, preferredProviderKeyId);
      }
      await getDb(c.env)
        .update(users)
        .set({ preferredProviderKeyId, updatedAt: now() })
        .where(eq(users.id, c.get("user").id));
      return c.json({ ok: true });
    }
  );
}
