import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider, parseProviderImages } from "../src/providers/openai-compatible";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW0D8QAAAABJRU5ErkJggg==";

describe("provider response parsing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses responses api image_generation_call", () => {
    const images = parseProviderImages({
      output: [{ type: "image_generation_call", result: png }]
    });
    expect(images).toHaveLength(1);
    expect(images[0]?.kind).toBe("base64");
  });

  it("parses legacy image urls", () => {
    const images = parseProviderImages({ data: [{ url: "https://example.com/image.png" }] });
    expect(images).toEqual([{ kind: "url", url: "https://example.com/image.png" }]);
  });

  it("parses markdown images from chat completions", () => {
    const images = parseProviderImages({
      choices: [{ message: { content: `done ![image](data:image/png;base64,${png})` } }]
    });
    expect(images).toHaveLength(1);
  });

  it("returns pure text from chat completions", async () => {
    const provider = new OpenAICompatibleProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> };
        expect(body.messages.at(-1)?.content).toBe("continue the idea");
        return new Response(
          JSON.stringify({
            id: "chatcmpl_test",
            choices: [{ message: { content: "Use a tighter composition." } }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const response = await provider.generate({
      prompt: "continue the idea",
      mode: "chat",
      model: "gpt-image-2",
      size: "1024x1024",
      apiKey: "key",
      baseUrl: "https://provider.test",
      messages: [{ role: "user", content: "continue the idea" }]
    });

    expect(response.requestId).toBe("chatcmpl_test");
    expect(response.text).toBe("Use a tighter composition.");
    expect(response.images).toEqual([]);
  });
});
