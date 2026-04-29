/**
 * 生成入口设置 sysadmin 管理接口。
 */
import { zValidator } from "@hono/zod-validator";
import { audit } from "../../lib/audit";
import {
  generationEntryPatchSchema,
  getGenerationEntrySettings,
  getGenerationPageUsageMetrics,
  getGenerationUsageWindow,
  saveGenerationEntrySettings
} from "../../lib/generationEntry";
import type { SysadminRouter } from "./common";

export function registerSysadminGenerationEntryRoutes(sysadminRoutes: SysadminRouter) {
  sysadminRoutes.get("/generation-entry", async (c) => {
    const settings = await getGenerationEntrySettings(c.env);
    const usageWindow = getGenerationUsageWindow();
    const pageUsage = await getGenerationPageUsageMetrics(c.env, { window: usageWindow });
    return c.json({ settings, usageWindow, pageUsage });
  });

  sysadminRoutes.patch(
    "/generation-entry",
    zValidator("json", generationEntryPatchSchema),
    async (c) => {
      const user = c.get("user");
      const input = c.req.valid("json");
      const settings = await saveGenerationEntrySettings(c.env, user.id, input);
      await audit(c.env, {
        actorId: user.id,
        action: "sys.generation_entry_update",
        targetType: "generation_entry_settings",
        targetId: "default",
        payload: {
          showWorkspace: settings.showWorkspace,
          showAiImage: settings.showAiImage
        }
      });
      return c.json({ settings });
    }
  );
}
