import type { ImageAttachment, Message } from "@/stores/session";

export function latestResultImages(messages: Message[]): ImageAttachment[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.attachments.length) return message.attachments;
  }
  return [];
}

export function latestAssistantResultMessage(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && (message.taskId || message.attachments.length)) {
      return message;
    }
  }
  return null;
}

export function latestUserPromptMessage(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && message.prompt) return message;
  }
  return null;
}
