/**
 * 按 `providers.request_format` 解析具体适配器；未知格式回退到 openai_compatible（gpt-image-2 类）。
 */
import { MicuImagesProvider, OpenAICompatibleProvider } from "./openai-compatible";
import { MicuGrokImagesProvider } from "./micu-grok-images";
import { OpenAIImagesProvider } from "./openai-images";
import type { ImageProvider } from "./types";

const providers: Record<string, ImageProvider> = {
  openai_compatible: new OpenAICompatibleProvider(),
  micu_images: new MicuImagesProvider(),
  micu_grok_images: new MicuGrokImagesProvider(),
  openai_images: new OpenAIImagesProvider()
};

export function getProvider(requestFormat: string): ImageProvider {
  return providers[requestFormat] ?? providers.openai_compatible;
}
