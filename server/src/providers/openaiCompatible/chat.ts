import { bytesToBase64 } from "../../lib/encoding";
import type { GenerateRequest, GenerateResponse } from "../types";
import { extractText, providerFetch } from "../openai-compatibleHelpers";
import { parsedCompatibleResponse } from "./response";

export async function chatCompletion(
  req: GenerateRequest,
  providerAdapter: string,
  model = req.model
): Promise<GenerateResponse> {
  const baseUrl = req.baseUrl.replace(/\/$/, "");
  const messages = [
    {
      role: "user",
      content: chatContentForRequest(req, chatPromptForRequest(req))
    }
  ];
  const json = await providerFetch(
    `${baseUrl}/v1/chat/completions`,
    req.apiKey,
    {
      model,
      messages
    },
    {
      ...req.logContext,
      providerAdapter,
      endpoint: "chat.completions",
      mode: req.mode,
      model,
      size: req.size,
      messageCount: messages.length,
      referenceImageCount: req.referenceImages?.length ?? 0
    }
  );
  const response = parsedCompatibleResponse(json, req.logContext, {
    providerAdapter,
    endpoint: "chat.completions"
  });
  return {
    ...response,
    text: extractText(json)
  };
}

function imageToImageChatPrompt(prompt: string, size: string, referenceImageCount: number): string {
  const sizeMatch = /^(\d+)x(\d+)$/i.exec(size);
  const sizeSuffix = sizeMatch ? ` At exactly ${sizeMatch[1]}x${sizeMatch[2]} pixels.` : "";
  if (referenceImageCount <= 1) {
    return `Edit the attached image as described.${sizeSuffix}\n\nInstruction:\n${prompt}`;
  }
  return `Attached are ${referenceImageCount} reference images. Treat them as visual context/inspiration for the instruction below. Output ONE image per the instruction.${sizeSuffix} Do NOT collage, tile, montage, or arrange the input images side-by-side unless the instruction explicitly asks for that.\n\nInstruction:\n${prompt}`;
}

function chatPromptForRequest(req: GenerateRequest): string {
  if (req.mode !== "image2image") return req.prompt;
  return imageToImageChatPrompt(req.prompt, req.size, req.referenceImages?.length ?? 0);
}

export function chatContentForRequest(req: GenerateRequest, prompt: string) {
  if (req.mode !== "image2image") return prompt;
  return [
    { type: "text", text: prompt },
    ...(req.referenceImages ?? []).map((image) => ({
      type: "image_url",
      image_url: { url: `data:${image.mime};base64,${bytesToBase64(image.bytes)}` }
    }))
  ];
}
