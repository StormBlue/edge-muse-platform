import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider, parseProviderImages } from "../src/providers/openai-compatible";
import { OpenAIImagesProvider } from "../src/providers/openai-images";

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

  it("parses OpenAI Images base64 payloads", () => {
    const images = parseProviderImages({ data: [{ b64_json: png }] });
    expect(images).toEqual([{ kind: "base64", data: png, mime: "image/png" }]);
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

  it("calls OpenAI Images generations endpoint for text-to-image", async () => {
    const provider = new OpenAIImagesProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api-dmit.cubence.com/v1/images/generations");
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("Authorization")).toBe("Bearer key");
        expect(headers.get("Content-Type")).toBe("application/json");
        const body = JSON.parse(String(init.body)) as {
          model: string;
          prompt: string;
          n: number;
          size: string;
        };
        expect(body).toEqual({
          model: "gpt-image-2",
          prompt: "a cat",
          n: 1,
          size: "2048x2048"
        });
        return new Response(JSON.stringify({ created: 1735200000, data: [{ b64_json: png }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    const response = await provider.generate({
      prompt: "a cat",
      mode: "text2image",
      model: "gpt-image-2",
      size: "2048x2048",
      apiKey: "key",
      baseUrl: "https://api-dmit.cubence.com"
    });

    expect(response.images).toEqual([{ kind: "base64", data: png, mime: "image/png" }]);
  });

  it("does not run extra Cubence health probes when models endpoint is absent", async () => {
    const provider = new OpenAIImagesProvider();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("404 page not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      provider.health({
        apiKey: "key",
        baseUrl: "https://api-dmit.cubence.com",
        model: "gpt-image-2"
      })
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls OpenAI Images edits endpoint with multipart reference image", async () => {
    const provider = new OpenAIImagesProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api-dmit.cubence.com/v1/images/edits");
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("Authorization")).toBe("Bearer key");
        expect(headers.get("Content-Type")).toBeNull();
        expect(init.body).toBeInstanceOf(FormData);
        const form = init.body as FormData;
        expect(form.get("model")).toBe("gpt-image-2");
        expect(form.get("prompt")).toBe("replace background");
        expect(form.get("n")).toBe("1");
        expect(form.get("size")).toBe("1024x1024");
        const image = form.get("image") as File;
        expect(image).toBeInstanceOf(File);
        expect(image.name).toBe("reference.png");
        expect(image.type).toBe("image/png");
        expect(image.size).toBeGreaterThan(0);
        return new Response(JSON.stringify({ created: 1735200000, data: [{ b64_json: png }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    const response = await provider.generate({
      prompt: "replace background",
      mode: "image2image",
      model: "gpt-image-2",
      size: "1024x1024",
      apiKey: "key",
      baseUrl: "https://api-dmit.cubence.com",
      referenceImages: [{ bytes: new Uint8Array([1, 2, 3, 4]), mime: "image/png" }]
    });

    expect(response.images).toHaveLength(1);
    expect(response.images[0]?.kind).toBe("base64");
  });

  it("rejects chat mode for OpenAI Images providers", async () => {
    const provider = new OpenAIImagesProvider();
    await expect(
      provider.generate({
        prompt: "continue",
        mode: "chat",
        model: "gpt-image-2",
        size: "1024x1024",
        apiKey: "key",
        baseUrl: "https://api-dmit.cubence.com"
      })
    ).rejects.toMatchObject({ code: "PROVIDER_UNSUPPORTED_MODE" });
  });
});
