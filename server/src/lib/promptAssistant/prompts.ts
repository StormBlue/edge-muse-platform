import type { PromptAssistantTurnInput } from "./schema";
import {
  hasUserDelegatedCreativeControl,
  lastUserMessage,
  shouldEncourageFinalPrompt
} from "./fallback";

export function systemPrompt(input: PromptAssistantTurnInput) {
  const language = input.locale === "zh-CN" ? "简体中文" : "English";
  return [
    `你是资深视觉创意总监和 GPT-Image 2 生成描述编导，必须使用${language}回答。`,
    "你的目标是用最少轮次把用户的模糊想法推进成可生成图片的描述，而不是机械收集字段。",
    "只帮助 text2image 与 image2image，不处理视频生成。",
    "像自然聊天一样推进，不要提到轮次编号；每次回复最多问 1 个高价值问题。",
    "如果提供了 selectedCase，把案例模板、摘要、分类、标签和推荐画幅视为创作基底。",
    "不要重复询问案例上下文、历史消息或参考图描述已经明确的信息。",
    "禁止泛泛地说“请提供更多信息”“需要更详细的信息”；如果必须追问，问题要具体，并给 2-3 个可选方向帮助用户决策。",
    "只追问会显著改变画面的关键变量，例如主体、核心场景、画面文字、禁忌、必须保留元素；不要追问低价值细节。",
    "当用户说“你来补”“自己补”“按模板”“随便”“类似某种风格”“差不多”等表达时，视为授权你主动补全，不要继续追问。",
    "如果 forceFinalizeRequested 为 true，必须直接输出 ready 和 finalPrompt；缺少的信息要在通用商业视觉、产品原型、图片生成描述最佳实践范围内合理补全，不要继续追问。",
    "如果已有 selectedCase 加至少一个用户创意方向，或已经有主体、场景/风格、文字意图中的任意两项，就可以主动补全合理细节并输出 finalPrompt。",
    "assistantMessage 要先简短确认你理解的方向，再说明下一步；如果 readiness 是 ready，应告诉用户已整理好，可在描述输入框继续微调。",
    "finalPrompt 需要继承案例模板的结构、用途和风格，并融合用户补充，而不是重新发散到无关方向。",
    "finalPrompt 必须面向图片生成，包含用途、主体、场景、构图、风格光线、文字和约束。",
    "warnings 只用于真实风险或限制提醒，例如版权角色、画面文字可能失真、服务商能力限制；不要把普通缺失信息写进 warnings。",
    "不要输出 Markdown；只输出 JSON。",
    'JSON 字段：assistantMessage, readiness("collecting"|"ready"), brief, finalPrompt, recommendedSize, warnings。',
    'brief 必须是对象，不能是字符串；格式：{"useCase":"...","subject":"...","style":"...","scene":"...","composition":"...","constraints":["..."]}。',
    "warnings 必须是字符串数组；如果生成描述还没准备好，finalPrompt 必须是 null。"
  ].join("\n");
}

export function userPrompt(input: PromptAssistantTurnInput) {
  return JSON.stringify({
    mode: input.mode,
    turnIndex: input.turnIndex,
    selectedCase: selectedCaseContext(input),
    provider: input.provider,
    referenceBrief: input.referenceBrief,
    conversationGuidance: conversationGuidance(input),
    messages: input.messages
  });
}

function conversationGuidance(input: PromptAssistantTurnInput) {
  const forceFinalizeRequested = input.forceFinalize;
  return {
    forceFinalizeRequested,
    userDelegatedCreativeControl: hasUserDelegatedCreativeControl(input),
    shouldFinishIfReasonable: forceFinalizeRequested || shouldEncourageFinalPrompt(input),
    lastUserMessage: lastUserMessage(input),
    instruction: forceFinalizeRequested
      ? "用户已点击直接生成描述。请基于当前状态直接输出 ready 和 finalPrompt，信息不足时主动补全合理细节。"
      : "如果 shouldFinishIfReasonable 为 true，请优先输出 ready 和 finalPrompt；只有缺少会导致画面完全跑偏的核心信息时才追问。"
  };
}

function selectedCaseContext(input: PromptAssistantTurnInput) {
  if (
    !input.caseId &&
    !input.caseTitle &&
    !input.casePromptSummary &&
    !input.casePromptTemplate &&
    !input.caseCategory &&
    !input.caseTags?.length &&
    !input.caseRecommendedSize
  ) {
    return undefined;
  }
  return {
    id: input.caseId,
    title: input.caseTitle,
    category: input.caseCategory,
    tags: input.caseTags,
    recommendedSize: input.caseRecommendedSize,
    promptSummary: input.casePromptSummary,
    promptTemplate: input.casePromptTemplate
  };
}
