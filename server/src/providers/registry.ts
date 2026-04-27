/**
 * 按 `providers.request_format` 解析具体适配器；未知格式回退到 openai_compatible（gpt-image-2 类）。
 */
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { ImageProvider } from "./types";

const providers: Record<string, ImageProvider> = {
  openai_compatible: new OpenAICompatibleProvider()
};

export function getProvider(requestFormat: string): ImageProvider {
  return providers[requestFormat] ?? providers.openai_compatible;
}
