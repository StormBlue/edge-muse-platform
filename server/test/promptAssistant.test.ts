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
    expect(result.recommendedSize).toBe("3:4");
    expect(result.finalPrompt).toContain("新品商品海报");
    expect(result.finalPrompt).toContain("清爽夏日棚拍风格");
  });

  it("keeps collecting in early static fallback after only one assistant question", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 1,
      caseId: "case-product-poster",
      caseTitle: "新品商品海报",
      caseCategory: "商品广告",
      caseRecommendedSize: "3:4",
      casePromptSummary: "清爽夏日棚拍风格，突出新品卖点和留白文案区",
      casePromptTemplate: "生成一张适合电商投放的商品海报，主体清晰，背景干净。",
      messages: [
        { role: "user", content: "我要做一张咖啡新品海报" },
        { role: "assistant", content: "我会按「新品商品海报」来做。画面最核心的主体是什么？" },
        { role: "user", content: "主体是冰拿铁" }
      ]
    });

    const result = await runPromptAssistantTurn({} as AppBindings, input);

    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toBe("ai_binding_missing");
    expect(result.model).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
    expect(result.readiness).toBe("collecting");
    expect(result.finalPrompt).toBeNull();
    expect(result.assistantMessage).toContain("文字");
  });

  it("accepts a valid AI follow-up instead of degrading just because enough context exists", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 1,
      caseId: "case-product-poster",
      caseTitle: "新品商品海报",
      caseCategory: "商品广告",
      caseRecommendedSize: "3:4",
      casePromptSummary: "清爽夏日棚拍风格，突出新品卖点和留白文案区",
      casePromptTemplate: "生成一张适合电商投放的商品海报，主体清晰，背景干净。",
      messages: [
        { role: "user", content: "我要做一张咖啡新品海报" },
        { role: "assistant", content: "我会按「新品商品海报」来做。画面最核心的主体是什么？" },
        { role: "user", content: "主体是冰拿铁" }
      ]
    });
    const env = {
      AI: {
        run: async () => ({
          response: JSON.stringify({
            assistantMessage: "主体我记下了。画面里需要出现文字吗？如果需要，请逐字写出。",
            readiness: "collecting",
            brief: { subject: "冰拿铁", useCase: "新品商品海报" },
            finalPrompt: null,
            recommendedSize: "3:4",
            warnings: []
          })
        })
      }
    } as unknown as AppBindings;

    const result = await runPromptAssistantTurn(env, input);

    expect(result.degraded).toBe(false);
    expect(result.degradedReason).toBeNull();
    expect(result.readiness).toBe("collecting");
    expect(result.finalPrompt).toBeNull();
    expect(result.assistantMessage).toContain("文字");
  });

  it("does not pass through repeated AI questions once case details are enough", async () => {
    const repeatedQuestion = "我可以基于案例补全构图、光线和氛围。有没有绝对不能出现的元素？";
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 5,
      caseId: "pcase_gpt2_ui_gacha_screen",
      caseTitle: "手游抽卡界面截图",
      caseCategory: "UI 与社媒截图",
      caseTags: ["手游 UI", "抽卡", "界面", "截图"],
      caseRecommendedSize: "1024x1536",
      casePromptSummary: "用于游戏 UI 概念、运营活动视觉和产品原型展示。",
      casePromptTemplate:
        "生成一张竖版手游抽卡界面截图。界面：顶部资源栏，中间角色或卡池主视觉，底部抽取按钮和概率说明区域。",
      provider: {
        model: "gpt-image-2",
        supportedSizes: ["1024x1024", "1024x1536", "1536x1024", "auto"],
        maxReferenceImages: 5
      },
      messages: [
        { role: "user", content: "使用模板生成 EVA 的抽卡界面截图" },
        { role: "assistant", content: "我会按「手游抽卡界面截图」来做。画面最核心的主体是什么？" },
        { role: "user", content: "主体是 初号机 大战 量产机" },
        {
          role: "assistant",
          content:
            "主体我记下了。画面里需要出现文字吗？如果需要，请逐字写出；不需要我会默认不加文字。"
        },
        { role: "user", content: "文字为：EVANGELION" },
        { role: "assistant", content: repeatedQuestion },
        { role: "user", content: "没有，你根据搜索学习到的 EVA 元素创建即可" },
        { role: "assistant", content: repeatedQuestion },
        { role: "user", content: "没有" },
        { role: "assistant", content: repeatedQuestion },
        { role: "user", content: "没有" }
      ]
    });
    const env = {
      AI: {
        run: async () => ({
          response: JSON.stringify({
            assistantMessage: repeatedQuestion,
            readiness: "collecting",
            brief: { subject: "初号机大战量产机", useCase: "手游抽卡界面截图" },
            finalPrompt: null,
            warnings: []
          })
        })
      }
    } as unknown as AppBindings;

    const result = await runPromptAssistantTurn(env, input);

    expect(result.degraded).toBe(true);
    expect(result.readiness).toBe("ready");
    expect(result.assistantMessage).not.toBe(repeatedQuestion);
    expect(result.recommendedSize).toBe("1024x1536");
    expect(result.finalPrompt).toContain("初号机");
    expect(result.finalPrompt).toContain("EVANGELION");
  });

  it("force-finalizes from case context even when Workers AI returns unparseable text", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 0,
      forceFinalize: true,
      caseTitle: "手游抽卡界面截图",
      caseRecommendedSize: "1024x1536",
      casePromptSummary: "用于游戏 UI 概念、运营活动视觉和产品原型展示。",
      casePromptTemplate:
        "生成一张竖版手游抽卡界面截图。界面：顶部资源栏，中间角色或卡池主视觉，底部抽取按钮和概率说明区域。",
      messages: []
    });
    const env = {
      AI: {
        run: async () => ({
          response: "我已经理解你的需求，会直接整理，但这里不是合法 JSON。"
        })
      }
    } as unknown as AppBindings;

    const result = await runPromptAssistantTurn(env, input);

    expect(result.degraded).toBe(true);
    expect(result.readiness).toBe("ready");
    expect(result.recommendedSize).toBe("1024x1536");
    expect(result.finalPrompt).toContain("手游抽卡界面截图");
    expect(result.finalPrompt).toContain("由 AI 基于");
  });

  it("finishes instead of asking again when the user delegates creative details", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 2,
      caseTitle: "科幻电影关键海报",
      casePromptTemplate:
        "生成一张科幻电影感竖版关键海报，主体位于画面核心，背景有宏大空间与强纵深。",
      messages: [
        { role: "user", content: "主题是机器人，背景设置在埃菲尔铁塔" },
        { role: "assistant", content: "需要画面文字吗？" },
        { role: "user", content: "片名 Heros，剩下的你自己补吧" }
      ]
    });

    const result = await runPromptAssistantTurn({} as AppBindings, input);

    expect(result.degraded).toBe(true);
    expect(result.readiness).toBe("ready");
    expect(result.finalPrompt).toContain("科幻电影感竖版关键海报");
    expect(result.finalPrompt).toContain("Heros");
  });

  it("accepts a Workers AI brief string without falling back", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 0,
      messages: [{ role: "user", content: "做一张透明智能音箱发布会海报" }]
    });
    const env = {
      AI: {
        run: async () => ({
          response: JSON.stringify({
            assistantMessage: "我还需要确认发布渠道和是否需要画面文字。",
            readiness: "collecting",
            brief: "透明外壳智能音箱的科技产品发布会海报",
            finalPrompt: null,
            recommendedSize: "1024x1024",
            warnings: []
          })
        })
      }
    } as unknown as AppBindings;

    const result = await runPromptAssistantTurn(env, input);

    expect(result.degraded).toBe(false);
    expect(result.model).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
    expect(result.brief.subject).toContain("透明外壳智能音箱");
    expect(result.assistantMessage).toContain("发布渠道");
  });

  it("accepts loose Workers AI key-value output", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 0,
      messages: [{ role: "user", content: "做一张透明智能音箱发布会海报" }]
    });
    const env = {
      AI: {
        run: async () => ({
          response: [
            'assistantMessage: "还需要确认品牌名称和画面文案。"',
            'readiness: "collecting"',
            'brief: {"useCase":"科技产品发布海报","subject":"智能音箱","constraints":["透明外壳"]}',
            "warnings: []",
            "finalPrompt: null"
          ].join("\n")
        })
      }
    } as unknown as AppBindings;

    const result = await runPromptAssistantTurn(env, input);

    expect(result.degraded).toBe(false);
    expect(result.readiness).toBe("collecting");
    expect(result.brief.subject).toBe("智能音箱");
    expect(result.assistantMessage).toContain("品牌名称");
  });

  it("accepts JSON output with harmless trailing characters", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 0,
      messages: [{ role: "user", content: "做一张咖啡新品海报" }]
    });
    const env = {
      AI: {
        run: async () => ({
          response: `${JSON.stringify({
            assistantMessage: "这张图准备用在哪个渠道？",
            readiness: "collecting",
            brief: { subject: "咖啡新品海报" },
            finalPrompt: null,
            recommendedSize: "1024x1024",
            warnings: []
          })}"`
        })
      }
    } as unknown as AppBindings;

    const result = await runPromptAssistantTurn(env, input);

    expect(result.degraded).toBe(false);
    expect(result.brief.subject).toBe("咖啡新品海报");
  });

  it("retries transient Workers AI network errors", async () => {
    const input = promptAssistantTurnSchema.parse({
      mode: "text2image",
      locale: "zh-CN",
      turnIndex: 0,
      messages: [{ role: "user", content: "做一张咖啡新品海报" }]
    });
    let calls = 0;
    const env = {
      AI: {
        run: async () => {
          calls += 1;
          if (calls === 1) {
            throw new Error("Network connection lost.");
          }
          return {
            response: JSON.stringify({
              assistantMessage: "这张图准备用在哪个渠道？",
              readiness: "collecting",
              brief: { subject: "咖啡新品海报" },
              finalPrompt: null,
              recommendedSize: "1024x1024",
              warnings: []
            })
          };
        }
      }
    } as unknown as AppBindings;

    const result = await runPromptAssistantTurn(env, input);

    expect(calls).toBe(2);
    expect(result.degraded).toBe(false);
    expect(result.brief.subject).toBe("咖啡新品海报");
  });
});
