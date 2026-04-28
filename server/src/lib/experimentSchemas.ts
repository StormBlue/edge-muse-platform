import { z } from "zod";
import {
  clientGenerationExperimentEventSchema,
  generationExperimentEventSchema
} from "./generationExperimentEvents";

export const experimentPatchSchema = z.object({
  status: z.enum(["draft", "running", "paused", "archived"]),
  strategy: z.enum(["parallel", "force_legacy", "force_ai", "ab_test"]),
  trafficPercent: z.number().int().min(0).max(100),
  scope: z.record(z.string(), z.unknown()).default({})
});

export const experimentEventSchema = z.object({
  eventName: generationExperimentEventSchema,
  route: z.string().trim().max(120).optional(),
  caseId: z.string().trim().max(120).optional(),
  taskId: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const clientExperimentEventSchema = z
  .object({
    eventName: clientGenerationExperimentEventSchema,
    route: z.string().trim().max(120).optional(),
    caseId: z.string().trim().max(120).optional(),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
  .strict();

export type ExperimentPatchInput = z.infer<typeof experimentPatchSchema>;
export type ExperimentEventInput = z.infer<typeof experimentEventSchema>;
