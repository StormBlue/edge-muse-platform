/**
 * AI 图像生成页结果图作用域。
 *
 * 页面只展示本次页面提交对应的任务结果，避免从全局 session store 里拿到历史会话图片。
 */
import type { ImageAttachment, Message } from "@/stores/session";

export type AiImageActiveResultScope = {
  taskId: string | null;
  sessionId: string | null;
};

export function imagesForAiImageActiveResult(
  messages: Message[],
  scope: AiImageActiveResultScope
): ImageAttachment[] {
  if (!scope.taskId && !scope.sessionId) return [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message?.attachments.length) continue;
    if (scope.taskId && message.taskId === scope.taskId) return message.attachments;
    if (scope.sessionId && message.sessionId === scope.sessionId && message.role === "assistant") {
      return message.attachments;
    }
  }
  return [];
}
