import type { ImageAttachment } from "@/stores/session";
import type { PromptCase } from "@/types/promptCases";

export function promptCasePreviewImage(item: PromptCase): ImageAttachment | null {
  if (!item.thumbnailUrl) return null;
  return {
    id: `case:${item.id}`,
    url: item.thumbnailUrl,
    mime: mimeFromUrl(item.thumbnailUrl),
    width: null,
    height: null,
    byteSize: 0,
    taskId: null,
    sessionId: null,
    messageId: null,
    displayName: item.title,
    prompt: item.promptTemplate || item.promptSummary || item.title
  };
}

function mimeFromUrl(url: string) {
  const cleanUrl = url.split("?")[0]?.toLowerCase() ?? "";
  if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) return "image/jpeg";
  if (cleanUrl.endsWith(".webp")) return "image/webp";
  if (cleanUrl.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}
