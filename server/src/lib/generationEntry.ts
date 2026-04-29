import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { generationEntrySettings, generationEvents } from "../db/schema";
import { appError } from "./errors";
import { newId, now } from "./id";
import { parseJson, stringifyJson } from "./json";
import { sanitizeGenerationEventMetadata } from "./generationEventMetadata";
import type { AppBindings, AuthUser } from "../types";

const SETTINGS_KEY = "default";
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_WINDOW_DAYS = 30;

export const generationRouteSchema = z.enum(["/workspace", "/ai-image"]);
export const generationClientEventNameSchema = z.enum([
  "entry_exposed",
  "page_opened",
  "prompt_case_selected",
  "assistant_started",
  "assistant_prompt_filled",
  "history_returned"
]);
export const generationEventNameSchema = z.enum([
  "entry_exposed",
  "page_opened",
  "prompt_case_selected",
  "assistant_started",
  "assistant_prompt_filled",
  "assistant_turn_requested",
  "assistant_turn_degraded",
  "generate_submitted",
  "generate_succeeded",
  "generate_failed",
  "history_returned"
]);

export const generationEntryPatchSchema = z
  .object({
    showWorkspace: z.boolean(),
    showAiImage: z.boolean()
  })
  .refine((value) => value.showWorkspace || value.showAiImage, {
    message: "At least one generation page must be enabled"
  });

export const clientGenerationEventSchema = z
  .object({
    eventName: generationClientEventNameSchema,
    route: generationRouteSchema,
    caseId: z.string().trim().max(120).optional(),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
  .strict();

export const generationEventSchema = z.object({
  eventName: generationEventNameSchema,
  route: generationRouteSchema,
  caseId: z.string().trim().max(120).optional(),
  taskId: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type GenerationRoute = z.infer<typeof generationRouteSchema>;
export type GenerationEventName = z.infer<typeof generationEventNameSchema>;
export type ClientGenerationEventInput = z.infer<typeof clientGenerationEventSchema>;
export type GenerationEventInput = z.infer<typeof generationEventSchema>;
export type GenerationEntryPatchInput = z.infer<typeof generationEntryPatchSchema>;

export type GenerationEntry = {
  navTarget: GenerationRoute;
  showWorkspace: boolean;
  showAiImage: boolean;
};

export type GenerationEntrySettingsDto = GenerationEntryPatchInput & {
  updatedAt: number;
  updatedBy: string | null;
};

export type GenerationUsageWindow = {
  since: number;
  until: number;
  days: number;
};

export type GenerationPageUsageMetric = {
  route: GenerationRoute;
  submitted: number;
  succeeded: number;
  failed: number;
};

export async function getGenerationEntrySettings(
  env: AppBindings
): Promise<GenerationEntrySettingsDto> {
  const row = await getDb(env).query.generationEntrySettings.findFirst({
    where: eq(generationEntrySettings.key, SETTINGS_KEY)
  });
  if (!row) {
    return {
      showWorkspace: true,
      showAiImage: true,
      updatedAt: 0,
      updatedBy: null
    };
  }
  return {
    showWorkspace: row.showWorkspace,
    showAiImage: row.showAiImage,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy ?? null
  };
}

export async function saveGenerationEntrySettings(
  env: AppBindings,
  actorId: string,
  input: GenerationEntryPatchInput
) {
  const timestamp = now();
  const existing = await getDb(env).query.generationEntrySettings.findFirst({
    where: eq(generationEntrySettings.key, SETTINGS_KEY)
  });
  if (existing) {
    await getDb(env)
      .update(generationEntrySettings)
      .set({
        showWorkspace: input.showWorkspace,
        showAiImage: input.showAiImage,
        updatedBy: actorId,
        updatedAt: timestamp
      })
      .where(eq(generationEntrySettings.key, SETTINGS_KEY));
  } else {
    await getDb(env).insert(generationEntrySettings).values({
      key: SETTINGS_KEY,
      showWorkspace: input.showWorkspace,
      showAiImage: input.showAiImage,
      updatedBy: actorId,
      updatedAt: timestamp
    });
  }
  return {
    ...input,
    updatedBy: actorId,
    updatedAt: timestamp
  };
}

export async function getGenerationEntryForUser(
  env: AppBindings,
  user: Pick<AuthUser, "role">
): Promise<GenerationEntry> {
  if (user.role === "sysadmin") {
    return { showWorkspace: true, showAiImage: true, navTarget: "/workspace" };
  }
  const settings = await getGenerationEntrySettings(env);
  const showWorkspace = settings.showWorkspace;
  const showAiImage = settings.showAiImage;
  return {
    showWorkspace,
    showAiImage,
    navTarget: showWorkspace ? "/workspace" : "/ai-image"
  };
}

/**
 * 后端也需要强制生成入口开关，避免用户通过旧前端或手动请求绕过导航隐藏。
 * 缺省 route 按旧专业工作台入口处理，保证关闭「图像生成」时 legacy /generate 也会被拦住。
 */
export async function assertGenerationRouteEnabledForUser(
  env: AppBindings,
  user: Pick<AuthUser, "role">,
  route?: GenerationRoute
): Promise<GenerationRoute> {
  const targetRoute = route ?? "/workspace";
  if (user.role === "sysadmin") return targetRoute;

  const entry = await getGenerationEntryForUser(env, user);
  const enabled = targetRoute === "/workspace" ? entry.showWorkspace : entry.showAiImage;
  if (!enabled) {
    throw appError("FORBIDDEN", "Generation page is disabled", {
      route: targetRoute,
      navTarget: entry.navTarget
    });
  }
  return targetRoute;
}

export async function assertRetryGenerationRouteEnabledForUser(
  env: AppBindings,
  user: Pick<AuthUser, "id" | "role">,
  input: { sourceTaskId: string; route?: GenerationRoute }
): Promise<GenerationRoute> {
  const source = await findSubmittedEvent(env, user.id, input.sourceTaskId);
  return assertGenerationRouteEnabledForUser(env, user, source?.route ?? input.route);
}

export async function recordGenerationEvent(
  env: AppBindings,
  user: AuthUser,
  input: GenerationEventInput
) {
  await getDb(env)
    .insert(generationEvents)
    .values({
      id: newId("genevt"),
      userId: user.id,
      route: input.route,
      eventName: input.eventName,
      caseId: input.caseId ?? null,
      taskId: input.taskId ?? null,
      metadata: stringifyJson(sanitizeGenerationEventMetadata(input.metadata)),
      isSysadminPreview: user.role === "sysadmin",
      createdAt: now()
    });
}

export async function recordTaskResultGenerationEvent(
  env: AppBindings,
  input: {
    userId: string;
    taskId: string;
    eventName: "generate_succeeded" | "generate_failed";
    metadata?: Record<string, unknown>;
  }
) {
  const submitted = await findSubmittedEvent(env, input.userId, input.taskId);
  if (!submitted) return;
  await getDb(env)
    .insert(generationEvents)
    .values({
      id: newId("genevt"),
      userId: input.userId,
      route: submitted.route,
      eventName: input.eventName,
      caseId: submitted.caseId,
      taskId: input.taskId,
      metadata: stringifyJson(
        sanitizeGenerationEventMetadata({
          ...submitted.metadata,
          ...input.metadata,
          attributionSource: "generate_submitted"
        })
      ),
      isSysadminPreview: submitted.isSysadminPreview,
      createdAt: now()
    });
}

export async function recordRetrySubmittedGenerationEvent(
  env: AppBindings,
  input: {
    user: AuthUser;
    sourceTaskId: string;
    taskId: string;
    route?: GenerationRoute;
    caseId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const source = await findSubmittedEvent(env, input.user.id, input.sourceTaskId);
  const route = source?.route ?? input.route;
  if (!route) return;
  await recordGenerationEvent(env, input.user, {
    eventName: "generate_submitted",
    route,
    caseId: source?.caseId ?? input.caseId,
    taskId: input.taskId,
    metadata: {
      ...source?.metadata,
      ...input.metadata,
      isRetry: true,
      retryOf: input.sourceTaskId
    }
  });
}

export function getGenerationUsageWindow(referenceTime = now()): GenerationUsageWindow {
  return {
    since: referenceTime - USAGE_WINDOW_DAYS * DAY_MS,
    until: referenceTime,
    days: USAGE_WINDOW_DAYS
  };
}

export async function getGenerationPageUsageMetrics(
  env: AppBindings,
  options: { window?: GenerationUsageWindow } = {}
): Promise<GenerationPageUsageMetric[]> {
  const window = options.window ?? getGenerationUsageWindow();
  const rows = await getDb(env)
    .select({
      route: generationEvents.route,
      eventName: generationEvents.eventName
    })
    .from(generationEvents)
    .where(
      and(
        eq(generationEvents.isSysadminPreview, false),
        gte(generationEvents.createdAt, window.since),
        lte(generationEvents.createdAt, window.until)
      )
    );
  const usage = new Map<GenerationRoute, GenerationPageUsageMetric>([
    ["/workspace", { route: "/workspace", submitted: 0, succeeded: 0, failed: 0 }],
    ["/ai-image", { route: "/ai-image", submitted: 0, succeeded: 0, failed: 0 }]
  ]);
  for (const row of rows) {
    const target = usage.get(row.route);
    if (!target) continue;
    if (row.eventName === "generate_submitted") target.submitted += 1;
    if (row.eventName === "generate_succeeded") target.succeeded += 1;
    if (row.eventName === "generate_failed") target.failed += 1;
  }
  return [...usage.values()];
}

async function findSubmittedEvent(env: AppBindings, userId: string, taskId: string) {
  const rows = await getDb(env)
    .select({
      route: generationEvents.route,
      caseId: generationEvents.caseId,
      metadata: generationEvents.metadata,
      isSysadminPreview: generationEvents.isSysadminPreview
    })
    .from(generationEvents)
    .where(
      and(
        eq(generationEvents.userId, userId),
        eq(generationEvents.taskId, taskId),
        eq(generationEvents.eventName, "generate_submitted")
      )
    )
    .orderBy(desc(generationEvents.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    route: row.route,
    caseId: row.caseId ?? undefined,
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    isSysadminPreview: row.isSysadminPreview
  };
}
