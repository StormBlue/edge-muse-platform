import { describe, expect, it } from "vitest";
import {
  assistantLogPayload,
  isPromptAssistantEnabled,
  promptAssistantTurnSchema,
  runPromptAssistantTurn
} from "../src/lib/promptAssistant";
import type { AppBindings } from "../src/types";

describe("prompt assistant", () => {
  it("supports an explicit environment kill switch", () => {
    expect(isPromptAssistantEnabled({})).toBe(true);
    expect(isPromptAssistantEnabled({ PROMPT_ASSISTANT_ENABLED: "true" })).toBe(true);
    expect(isPromptAssistantEnabled({ PROMPT_ASSISTANT_ENABLED: "false" })).toBe(false);
    expect(isPromptAssistantEnabled({ PROMPT_ASSISTANT_ENABLED: "off" })).toBe(false);
  });

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

  it("uses enriched prompt case context when falling back", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 5,
      caseId: "case-product-poster",
      caseTitle: "新品商品海报",
      caseCategory: "商品广告",
      caseTags: ["电商", "清爽", "摄影"],
      caseRecommendedSize: "3:4",
      casePromptSummary: "清爽夏日棚拍风格，突出新品卖点和留白文案区",
      casePromptTemplate: "生成一张适合电商投放的商品海报，主体清晰，背景干净。",
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

    expect(result.brief.useCase).toContain("新品商品海报");
    expect(result.brief.useCase).toContain("商品广告");
    expect(result.brief.style).toContain("清爽夏日棚拍风格");
    expect(result.brief.style).toContain("电商");
    expect(result.brief.composition).toContain("3:4");
    expect(result.finalPrompt).toContain("新品商品海报");
    expect(result.finalPrompt).toContain("清爽夏日棚拍风格");
  });
});
