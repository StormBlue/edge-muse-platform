export function sanitizeGenerationEventMetadata(value: Record<string, unknown>) {
  const blocked = new Set(["prompt", "finalPrompt", "apiKey", "referenceImage", "referenceImages"]);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    if (typeof item === "string") output[key] = item.slice(0, 160);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) {
      output[key] = item;
    }
  }
  return output;
}
