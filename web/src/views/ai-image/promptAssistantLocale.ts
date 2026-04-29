/**
 * Prompt 助手语言映射。
 *
 * 后端当前只支持中英文；这里把前端 UI locale 收敛成助手接口允许的枚举。
 */
export type PromptAssistantLocale = "zh-CN" | "en-US";

export function promptAssistantLocaleFromUiLocale(locale: string): PromptAssistantLocale {
  return locale === "en-US" ? "en-US" : "zh-CN";
}
