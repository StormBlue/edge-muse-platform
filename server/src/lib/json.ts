/**
 * 安全解析 D1 中 JSON 文本列；失败或空返回 fallback，避免一行坏数据拖垮整请求。
 */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** 写入 tasks.params / messages.attachments 等；与 parseJson 成对 */
export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}
