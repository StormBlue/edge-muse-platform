import { describe, expect, it } from "vitest";
import { mergePersistedGeneratedImages } from "../src/routes/sessions/historyImages";
import { mergeAuditGeneratedImages } from "../src/routes/sysadmin/auditSessionImages";

describe("history image visibility", () => {
  it("keeps audit-only persisted images out of user history", () => {
    const attachments = [{ id: "img_accepted", url: "/api/i/img_accepted" }];
    const persistedImages = [persistedImage("img_accepted"), persistedImage("img_audit_only")];

    const merged = mergePersistedGeneratedImages(attachments, persistedImages, context());

    expect(merged.map((image) => image.id)).toEqual(["img_accepted"]);
    expect(merged[0]?.byteSize).toBe(123);
  });

  it("keeps audit-only persisted images visible to sysadmins", () => {
    const attachments = [{ id: "img_accepted", url: "/api/i/img_accepted" }];
    const persistedImages = [persistedImage("img_accepted"), persistedImage("img_audit_only")];

    const merged = mergeAuditGeneratedImages(attachments, persistedImages, context());

    expect(merged.map((image) => image.id)).toEqual(["img_accepted", "img_audit_only"]);
  });
});

function persistedImage(id: string) {
  return {
    id,
    url: `/api/i/${id}`,
    mime: "image/png",
    width: null,
    height: null,
    byteSize: 123,
    taskId: "tsk_1",
    sessionId: "ses_1",
    messageId: "msg_1",
    prompt: "prompt",
    createdAt: 1,
    generationDurationMs: 1,
    generationIndex: null
  };
}

function context() {
  return {
    taskId: "tsk_1",
    sessionId: "ses_1",
    messageId: "msg_1",
    prompt: "prompt"
  };
}
