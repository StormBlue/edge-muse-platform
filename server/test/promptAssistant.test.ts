import { describe, expect, it } from "vitest";
import {
  assistantLogPayload,
  promptAssistantTurnSchema,
  runPromptAssistantTurn
} from "../src/lib/promptAssistant";
import type { AppBindings } from "../src/types";

describe("prompt assistant", () => {
  it("rejects unsupported chat mode at the schema boundary", () => {
    expect(() =>
      promptAssistantTurnSchema.parse({
        mode: "chat",
        locale: "zh-CN",
        turnIndex: 0,
        messages: [{ role: "user", content: "帮我写一个头像 prompt" }]
      })
    ).toThrow();
  });

  it("allows up to 8 natural assistant exchanges", () => {
    const messages = Array.from({ length: 15 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message ${index}`
    }));

    expect(() =>
      promptAssistantTurnSchema.parse({
        mode: "text2image",
        locale: "zh-CN",
        turnIndex: 7,
        messages
      })
    ).not.toThrow();
    expect(() =>
      promptAssistantTurnSchema.parse({
        mode: "text2image",
        locale: "zh-CN",
        turnIndex: 8,
        messages
      })
    ).toThrow();
  });

  it("falls back to a ready prompt when Workers AI is unavailable after enough turns", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 5,
      caseTitle: "商品广告",
      provider: { supportedSizes: ["1024x1536"] },
      messages: [
        { role: "user", content: "做一张咖啡新品海报" },
        { role: "assistant", content: "发布渠道是什么？" },
        { role: "user", content: "小红书封面，年轻女性用户" },
        { role: "assistant", content: "主体和风格是什么？" },
        { role: "user", content: "冰拿铁，清爽夏日摄影风" },
        { role: "assistant", content: "需要文字吗？" }
      ]
    });

    const result = await runPromptAssistantTurn({} as AppBindings, input);

    expect(result.degraded).toBe(true);
    expect(result.readiness).toBe("ready");
    expect(result.recommendedSize).toBe("1024x1536");
    expect(result.finalPrompt).toContain("用途");

    const logPayload = assistantLogPayload(input, result);
    expect(logPayload).toMatchObject({
      mode: "text2image",
      turnIndex: 5,
      degraded: true
    });
    expect(logPayload).not.toHaveProperty("messages");
  });
});
