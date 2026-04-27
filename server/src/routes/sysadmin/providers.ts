import { desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import { providerKeys, providers } from "../../db/schema";
import { audit } from "../../lib/audit";
import { appError } from "../../lib/errors";
import { newId, now } from "../../lib/id";
import { parseJson, stringifyJson } from "../../lib/json";
import { ensureBuiltInProviders, isBuiltInProviderId } from "../../providers/catalog";
import type { SysadminRouter } from "./common";

/** 创建/全量更新 provider 时的校验体；`requestFormat` 与 registry 里实现名对应。 */
const providerSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  defaultModel: z.string().min(1).default("gpt-image-2"),
  requestFormat: z.string().default("openai_compatible"),
  supportedSizes: z.array(z.string()).default(["1024x1024", "1024x1536", "1536x1024", "auto"]),
  enabled: z.boolean().default(true)
});

export function registerSysadminProviderRoutes(sysadminRoutes: SysadminRouter) {
  // 上游 Provider 定义（baseUrl、adapter、默认模型、软删）。
  sysadminRoutes.get("/providers", async (c) => {
    await ensureBuiltInProviders(c.env);
    const rows = await getDb(c.env)
      .select()
      .from(providers)
      .where(isNull(providers.deletedAt))
      .orderBy(desc(providers.createdAt));
    return c.json({
      items: rows.map((row) => ({
        ...row,
        builtIn: isBuiltInProviderId(row.id),
        supportedSizes: parseJson(row.supportedSizes, [])
      }))
    });
  });

  sysadminRoutes.post("/providers", zValidator("json", providerSchema), async (c) => {
    const body = c.req.valid("json");
    const id = newId("prv");
    const timestamp = now();
    await getDb(c.env)
      .insert(providers)
      .values({
        id,
        name: body.name,
        baseUrl: body.baseUrl,
        defaultModel: body.defaultModel,
        requestFormat: body.requestFormat,
        supportedSizes: stringifyJson(body.supportedSizes),
        enabled: body.enabled,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "sys.provider_create",
      targetType: "provider",
      targetId: id
    });
    return c.json({ id }, 201);
  });

  // 部分更新；supportedSizes 为数组时在 PATCH 体里需整体替换，由 zod partial 控制。
  sysadminRoutes.patch(
    "/providers/:id",
    zValidator("json", providerSchema.partial()),
    async (c) => {
      const body = c.req.valid("json");
      await getDb(c.env)
        .update(providers)
        .set({
          ...body,
          supportedSizes: body.supportedSizes ? stringifyJson(body.supportedSizes) : undefined,
          updatedAt: now()
        })
        .where(eq(providers.id, c.req.param("id")));
      await audit(c.env, {
        actorId: c.get("user").id,
        action: "sys.provider_update",
        targetType: "provider",
        targetId: c.req.param("id"),
        payload: body
      });
      return c.json({ ok: true });
    }
  );

  sysadminRoutes.delete("/providers/:id", async (c) => {
    const providerId = c.req.param("id");
    // 内置 provider 是密钥页的固定可选项，只允许改绑/停用 key，不允许删除元数据本身。
    if (isBuiltInProviderId(providerId)) {
      throw appError("VALIDATION_ERROR", "Built-in provider cannot be deleted");
    }
    const timestamp = now();
    // 软删 provider 时一并禁用下属密钥，避免任务继续指向已弃用上游。
    await getDb(c.env)
      .update(providerKeys)
      .set({ enabled: false, updatedAt: timestamp, deletedAt: timestamp })
      .where(eq(providerKeys.providerId, providerId));
    await getDb(c.env)
      .update(providers)
      .set({ enabled: false, updatedAt: timestamp, deletedAt: timestamp })
      .where(eq(providers.id, providerId));
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "sys.provider_delete",
      targetType: "provider",
      targetId: providerId
    });
    return c.json({ ok: true });
  });

  /** 连通性烟测：当前实现仅 `baseUrl === "mock:"` 视为可本地假跑。 */
  sysadminRoutes.post("/providers/:id/test", async (c) => {
    const provider = await getDb(c.env).query.providers.findFirst({
      where: eq(providers.id, c.req.param("id"))
    });
    if (!provider) throw appError("NOT_FOUND", "Provider not found");
    return c.json({ ok: provider.baseUrl === "mock:" });
  });
}
