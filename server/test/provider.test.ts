import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptImagesForGenerationSlot } from "../src/lib/tasks/runGenerations";
import {
  MicuGrokImagesProvider,
  grokAspectRatio,
  grokResolution
} from "../src/providers/micu-grok-images";
import { MicuImagesProvider, parseProviderImages } from "../src/providers/openai-compatible";
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

  it("parses Micu side-channel image fields", () => {
    expect(parseProviderImages({ choices: [{ message: { image: png } }] })).toEqual([
      { kind: "base64", data: png, mime: "image/png" }
    ]);
    expect(
      parseProviderImages({
        choices: [{ message: { images: [{ url: "https://example.com/render?id=1" }] } }]
      })
    ).toEqual([{ kind: "url", url: "https://example.com/render?id=1" }]);
    expect(
      parseProviderImages({
        output: [
          {
            type: "message",
            content: [{ type: "output_image", image: `data:image/png;base64,${png}` }]
          }
        ]
      })
    ).toEqual([{ kind: "base64", data: png, mime: "image/png" }]);
  });

  it("keeps one provider image per requested generation slot", () => {
    const images = parseProviderImages({
      data: [{ url: "https://example.com/first.png" }, { url: "https://example.com/second.png" }]
    });

    expect(acceptImagesForGenerationSlot(images)).toEqual([
      { kind: "url", url: "https://example.com/first.png" }
    ]);
  });

  it("parses markdown images from chat completions", () => {
    const images = parseProviderImages({
      choices: [{ message: { content: `done ![image](data:image/png;base64,${png})` } }]
    });
    expect(images).toHaveLength(1);
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

  it("calls Micu images generations directly with b64_json response format", async () => {
    const provider = new MicuImagesProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://www.micuapi.ai/v1/images/generations");
        expect(init.method).toBe("POST");
        const body = JSON.parse(String(init.body)) as {
          model: string;
          prompt: string;
          n: number;
          size: string;
          response_format: string;
        };
        expect(body).toEqual({
          model: "gpt-image-2",
          prompt: "a cat",
          n: 1,
          size: "1280x720",
          response_format: "b64_json"
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
      size: "1280x720",
      apiKey: "key",
      baseUrl: "https://www.micuapi.ai"
    });

    expect(response.images).toEqual([{ kind: "base64", data: png, mime: "image/png" }]);
  });

  it("maps Grok sizes to resolution and aspect ratio", () => {
    expect(grokResolution("1024x1024")).toBe("1k");
    expect(grokResolution("2048x1152")).toBe("2k");
    expect(grokAspectRatio("2048x1152")).toBe("16:9");
    expect(grokAspectRatio("1024x1536")).toBe("2:3");
  });

  it("calls Micu Grok generations with resolution and aspect ratio", async () => {
    const provider = new MicuGrokImagesProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://www.micuapi.ai/v1/images/generations");
        expect(init.method).toBe("POST");
        const body = JSON.parse(String(init.body)) as {
          model: string;
          prompt: string;
          n: number;
          resolution: string;
          aspect_ratio: string;
          response_format: string;
        };
        expect(body).toEqual({
          model: "grok-imagine-image-pro",
          prompt: "a cat",
          n: 1,
          resolution: "2k",
          aspect_ratio: "16:9",
          response_format: "b64_json"
        });
        return new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    const response = await provider.generate({
      prompt: "a cat",
      mode: "text2image",
      model: "grok-imagine-image-pro",
      size: "2048x1152",
      apiKey: "key",
      baseUrl: "https://www.micuapi.ai"
    });

    expect(response.images).toEqual([{ kind: "base64", data: png, mime: "image/png" }]);
  });

  it("sends Micu Grok reference image as data URL", async () => {
    const provider = new MicuGrokImagesProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { reference_image?: string };
        expect(body.reference_image).toMatch(/^data:image\/png;base64,/);
        return new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    const response = await provider.generate({
      prompt: "replace background",
      mode: "image2image",
      model: "grok-imagine-image-pro",
      size: "1024x1024",
      apiKey: "key",
      baseUrl: "https://www.micuapi.ai",
      referenceImages: [{ bytes: new Uint8Array([1, 2, 3, 4]), mime: "image/png" }]
    });

    expect(response.images).toHaveLength(1);
  });

  it("upgrades Micu high-resolution requests to the pro model", async () => {
    const provider = new MicuImagesProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as {
          model: string;
          size: string;
          response_format: string;
        };
        expect(body.model).toBe("gpt-image-2-pro");
        expect(body.size).toBe("2048x2048");
        expect(body.response_format).toBe("b64_json");
        return new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
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
      baseUrl: "https://www.micuapi.ai"
    });

    expect(response.images).toHaveLength(1);
  });

  it("calls Micu edits endpoint with response format and multipart reference image", async () => {
    const provider = new MicuImagesProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://www.micuapi.ai/v1/images/edits");
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("Content-Type")).toBeNull();
        expect(init.body).toBeInstanceOf(FormData);
        const form = init.body as FormData;
        expect(form.get("response_format")).toBe("b64_json");
        expect(form.get("size")).toBe("1024x1024");
        expect(form.get("image")).toBeInstanceOf(File);
        return new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
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
      baseUrl: "https://www.micuapi.ai",
      referenceImages: [{ bytes: new Uint8Array([1, 2, 3, 4]), mime: "image/png" }]
    });

    expect(response.images[0]?.kind).toBe("base64");
  });

  it("falls back to Micu chat completions when edits endpoint is unavailable", async () => {
    const provider = new MicuImagesProvider();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "temporarily unavailable" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockImplementationOnce(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://www.micuapi.ai/v1/chat/completions");
        const body = JSON.parse(String(init.body)) as {
          model: string;
          messages: Array<{ content: unknown }>;
        };
        expect(body.model).toBe("gpt-image-2");
        expect(Array.isArray(body.messages[0]?.content)).toBe(true);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: `done ![image](data:image/png;base64,${png})` } }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const response = await provider.generate({
      prompt: "replace background",
      mode: "image2image",
      model: "gpt-image-2",
      size: "1024x1024",
      apiKey: "key",
      baseUrl: "https://www.micuapi.ai",
      referenceImages: [{ bytes: new Uint8Array([1, 2, 3, 4]), mime: "image/png" }]
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.images[0]?.kind).toBe("base64");
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

  it("exposes only one-shot modes for OpenAI Images providers", () => {
    const provider = new OpenAIImagesProvider();
    expect(provider.supportedModes).toEqual(["image2image", "text2image"]);
  });
});
