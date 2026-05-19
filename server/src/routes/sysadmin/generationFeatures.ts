import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { audit } from "../../lib/audit";
import { listMicuGrokAdminGrants, saveMicuGrokAdminGrants } from "../../lib/generationTargets";
import type { SysadminRouter } from "./common";

const generationFeaturesPatchSchema = z.object({
  micuGrokAdminIds: z.array(z.string().trim().min(1)).default([])
});

export function registerSysadminGenerationFeatureRoutes(sysadminRoutes: SysadminRouter) {
  sysadminRoutes.get("/generation-features", async (c) => {
    return c.json({
      micuGrok: {
        admins: await listMicuGrokAdminGrants(c.env)
      }
    });
  });

  sysadminRoutes.patch(
    "/generation-features",
    zValidator("json", generationFeaturesPatchSchema),
    async (c) => {
      const body = c.req.valid("json");
      const admins = await saveMicuGrokAdminGrants(c.env, {
        actorId: c.get("user").id,
        adminIds: body.micuGrokAdminIds
      });
      await audit(c.env, {
        actorId: c.get("user").id,
        action: "sys.generation_feature_update",
        targetType: "generation_feature",
        targetId: "micu_grok_image",
        payload: { adminIds: body.micuGrokAdminIds }
      });
      return c.json({
        ok: true,
        micuGrok: { admins }
      });
    }
  );
}
