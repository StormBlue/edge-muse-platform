export type StringQuery = Record<string, string>;

/** Vue Router 的 query 可能是数组或 null；列表页统一只接受第一个字符串值。 */
export function queryString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : "";
  }
  return "";
}

/** 从 URL 读取正整数页码；非法值回落到 fallback，避免刷新后进入无效分页状态。 */
export function queryPositiveInt(value: unknown, fallback = 1) {
  const numeric = Number(queryString(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(Math.floor(numeric), 1);
}

/** 比较即将写入的 query 与当前 URL；空值按“不存在”处理，减少重复 replace。 */
export function isSameStringQuery(next: StringQuery, current: Record<string, unknown>) {
  const normalize = (query: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(query)
        .map(([key, value]) => [key, queryString(value)] as const)
        .filter(([, value]) => value !== "")
        .sort(([left], [right]) => left.localeCompare(right))
    );
  return JSON.stringify(normalize(next)) === JSON.stringify(normalize(current));
}
