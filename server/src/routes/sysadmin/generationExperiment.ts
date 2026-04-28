/**
 * 生成体验实验 sysadmin 管理接口。
 */
import { zValidator } from "@hono/zod-validator";
import { audit } from "../../lib/audit";
import {
  experimentPatchSchema,
  getGenerationExperiment,
  getGenerationExperimentMetrics,
  getGenerationExperimentMetricsWindow,
  saveGenerationExperiment
} from "../../lib/experiments";
import type { SysadminRouter } from "./common";

export function registerSysadminGenerationExperimentRoutes(sysadminRoutes: SysadminRouter) {
  sysadminRoutes.get("/experiments/generation", async (c) => {
    const experiment = await getGenerationExperiment(c.env);
    const metricsWindow = getGenerationExperimentMetricsWindow();
    const metrics = await getGenerationExperimentMetrics(c.env, { window: metricsWindow });
    return c.json({ experiment, metrics, metricsWindow });
  });

  sysadminRoutes.patch(
    "/experiments/generation",
    zValidator("json", experimentPatchSchema),
    async (c) => {
      const user = c.get("user");
      const input = c.req.valid("json");
      const experiment = await saveGenerationExperiment(c.env, user.id, input);
      await audit(c.env, {
        actorId: user.id,
        action: "sys.generation_experiment_update",
        targetType: "experiment",
        targetId: experiment.key,
        payload: {
          status: experiment.status,
          strategy: experiment.strategy,
          trafficPercent: experiment.trafficPercent
        }
      });
      return c.json({ experiment });
    }
  );
}
