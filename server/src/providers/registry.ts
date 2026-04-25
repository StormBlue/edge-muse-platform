import { OpenAICompatibleProvider } from "./openai-compatible";
import type { ImageProvider } from "./types";

const providers: Record<string, ImageProvider> = {
  openai_compatible: new OpenAICompatibleProvider()
};

export function getProvider(requestFormat: string): ImageProvider {
  return providers[requestFormat] ?? providers.openai_compatible;
}
