/**
 * 生成体验实验 sysadmin 管理接口。
 */
import { zValidator } from "@hono/zod-validator";
import { audit } from "../../lib/audit";
import {
  clearGenerationExperimentAssignmentOverride,
  experimentPatchSchema,
  getGenerationExperiment,
  getGenerationExperimentMetrics,
  getGenerationExperimentMetricsWindow,
  listGenerationExperimentAssignmentOverrides,
  setGenerationExperimentAssignmentOverride,
  saveGenerationExperiment
} from "../../lib/experiments";
import type { SysadminRouter } from "./common";
import { z } from "zod";

const assignmentOverrideSchema = z.object({
  variant: z.enum(["A", "B"])
});

export function registerSysadminGenerationExperimentRoutes(sysadminRoutes: SysadminRouter) {
  sysadminRoutes.get("/experiments/generation", async (c) => {
    const experiment = await getGenerationExperiment(c.env);
    const metricsWindow = getGenerationExperimentMetricsWindow();
    const metrics = await getGenerationExperimentMetrics(c.env, { window: metricsWindow });
    const assignments = await listGenerationExperimentAssignmentOverrides(c.env);
    return c.json({ experiment, metrics, metricsWindow, assignments });
  });

  sysadminRoutes.get("/experiments/generation/assignments", async (c) => {
    const items = await listGenerationExperimentAssignmentOverrides(c.env);
    return c.json({ items });
  });

  sysadminRoutes.put(
    "/experiments/generation/assignments/:userId",
    zValidator("json", assignmentOverrideSchema),
    async (c) => {
      const user = c.get("user");
      const userId = c.req.param("userId");
      const input = c.req.valid("json");
      const assignment = await setGenerationExperimentAssignmentOverride(c.env, user.id, {
        userId,
        variant: input.variant
      });
      await audit(c.env, {
        actorId: user.id,
        action: "sys.generation_experiment_assignment_override",
        targetType: "experiment_assignment",
        targetId: userId,
        payload: { variant: assignment.variant }
      });
      return c.json({ assignment });
    }
  );

  sysadminRoutes.delete("/experiments/generation/assignments/:userId", async (c) => {
    const user = c.get("user");
    const userId = c.req.param("userId");
    await clearGenerationExperimentAssignmentOverride(c.env, userId);
    await audit(c.env, {
      actorId: user.id,
      action: "sys.generation_experiment_assignment_clear",
      targetType: "experiment_assignment",
      targetId: userId,
      payload: {}
    });
    return c.json({ ok: true });
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
