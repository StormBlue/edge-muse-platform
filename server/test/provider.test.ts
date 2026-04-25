import { describe, expect, it } from "vitest";
import { parseProviderImages } from "../src/providers/openai-compatible";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW0D8QAAAABJRU5ErkJggg==";

describe("provider response parsing", () => {
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
});
