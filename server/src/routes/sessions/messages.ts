import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages, tasks } from "../../db/schema";
import { assertSessionAccess } from "../../lib/access";
import { audit } from "../../lib/audit";
import { now } from "../../lib/id";
import { parseJson } from "../../lib/json";
import type { SessionRouter } from "./common";
import {
  loadReferenceImagesById,
  referenceImagesForIds,
  uniqueSessionMessageReferenceImageIds
} from "./referenceImages";

export function registerSessionMessageRoutes(sessionRoutes: SessionRouter) {
  // 工作台消息分页：按 createdAt 倒序取一页，再 reverse 成时间正序展示。
  sessionRoutes.get("/:id/messages", async (c) => {
    const session = await assertSessionAccess(c.env, c.req.param("id"), c.get("user"));
    const limit = Math.min(Number(c.req.query("limit") ?? "20"), 50);
    const cursor = Number(c.req.query("cursor") ?? "0");
    const rows = await getDb(c.env)
      .select({
        id: messages.id,
        sessionId: messages.sessionId,
        role: messages.role,
        prompt: messages.prompt,
        referenceImageIds: messages.referenceImageIds,
        attachments: messages.attachments,
        taskId: messages.taskId,
        status: messages.status,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
        taskErrorCode: tasks.errorCode,
        taskErrorMsg: tasks.errorMsg
      })
      .from(messages)
      .leftJoin(tasks, eq(tasks.messageId, messages.id))
      .where(
        and(
          eq(messages.sessionId, session.id),
          isNull(messages.deletedAt),
          cursor ? lt(messages.createdAt, cursor) : undefined
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit).reverse();
    const referenceImagesById = await loadReferenceImagesById(
      c.env,
      uniqueSessionMessageReferenceImageIds(pageRows),
      session.userId
    );
    return c.json({
      items: pageRows.map((row) => {
        const referenceImageIds = parseJson<string[]>(row.referenceImageIds, []);
        return {
          ...row,
          referenceImageIds,
          referenceImages: referenceImagesForIds(referenceImagesById, referenceImageIds, {
            taskId: row.taskId,
            sessionId: row.sessionId,
            messageId: row.id,
            prompt: row.prompt
          }),
          attachments: parseJson(row.attachments, []),
          error: row.taskErrorMsg
            ? {
                code: row.taskErrorCode ?? "PROVIDER_ERROR",
                message: row.taskErrorMsg
              }
            : null
        };
      }),
      // `nextCursor` = 多取的第 limit+1 条（更早）的 createdAt，供前端继续拉旧消息。
      nextCursor: rows.length > limit ? rows[limit].createdAt : null
    });
  });

  // 单条消息软删，并软删其附件里本人拥有的 image_objects，防止删除消息后引用泄露。
  sessionRoutes.delete("/:sessionId/messages/:messageId", async (c) => {
    const session = await assertSessionAccess(c.env, c.req.param("sessionId"), c.get("user"));
    const db = getDb(c.env);
    const message = await db.query.messages.findFirst({
      where: and(eq(messages.id, c.req.param("messageId")), eq(messages.sessionId, session.id))
    });
    await db
      .update(messages)
      .set({ deletedAt: now() })
      .where(and(eq(messages.id, c.req.param("messageId")), eq(messages.sessionId, session.id)));
    const attachments = parseJson<Array<{ id?: string }>>(message?.attachments, []);
    const imageIds = attachments.map((image) => image.id).filter((id): id is string => Boolean(id));
    if (imageIds.length > 0) {
      await c.env.DB.prepare(
        `UPDATE image_objects
         SET deleted_at = ?1
         WHERE id IN (${imageIds.map((_, index) => `?${index + 2}`).join(",")})
           AND owner_user_id = ?${imageIds.length + 2}`
      )
        .bind(now(), ...imageIds, session.userId)
        .run();
    }
    await audit(c.env, {
      actorId: c.get("user").id,
      action: "message.delete",
      targetType: "message",
      targetId: c.req.param("messageId")
    });
    return c.json({ ok: true });
  });
}
