/**
 * 结构化日志：Workers 控制台 / Logpush 友好；自动截断深度、脱敏敏感字段名。
 */
export type LogFields = Record<string, unknown>;
export type LogLevel = "info" | "warn" | "error";

const MAX_STRING_LENGTH = 2048;
const MAX_ARRAY_ITEMS = 25;
const MAX_DEPTH = 6;
const SENSITIVE_FIELD =
  /^(authorization|cookie|set-cookie|token|secret|password|apiKey|api_key|encryptedKey|encrypted_key)$/i;

/** 业务 info：`event` 建议用「域.动作.阶段」点分命名 */
export function logInfo(event: string, fields: LogFields = {}): void {
  writeLog("info", event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  writeLog("warn", event, fields);
}

/** 统一附带 `errorSummary`，栈截断为前 8 行 */
export function logError(event: string, error: unknown, fields: LogFields = {}): void {
  writeLog("error", event, { ...fields, error: errorSummary(error) });
}

/** 可嵌入其它日志字段的 Error 扁平化 */
export function errorSummary(error: unknown): LogFields {
  if (error instanceof Error) {
    const summary: LogFields = {
      name: error.name,
      message: error.message
    };
    const errorRecord = error as Error & {
      code?: unknown;
      status?: unknown;
      body?: unknown;
      details?: unknown;
    };
    if (errorRecord.code) summary.code = errorRecord.code;
    if (errorRecord.status) summary.status = errorRecord.status;
    if (errorRecord.details) summary.details = errorRecord.details;
    if (errorRecord.body) summary.body = errorRecord.body;
    if (error.stack) summary.stack = error.stack.split("\n").slice(0, 8).join("\n");
    return summary;
  }
  return { message: String(error) };
}

export function promptSummary(prompt: string): LogFields {
  const trimmed = prompt.trim();
  return {
    promptLength: prompt.length,
    promptPreview: trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed
  };
}

/** 日志中只记录 URL 的 scheme/host/path，避免泄露 query 里的密钥 */
export function urlSummary(value: string): LogFields {
  try {
    const url = new URL(value);
    return {
      scheme: url.protocol.replace(/:$/, ""),
      host: url.host || null,
      pathname: url.pathname || null
    };
  } catch {
    return { value: truncateString(value) };
  }
}

/** 输出单行 JSON 到 console（Workers 可接 Logpush）；error 走 console.error */
function writeLog(level: LogLevel, event: string, fields: LogFields): void {
  const entry = sanitizeLogValue({
    event,
    level,
    ts: new Date().toISOString(),
    ...fields
  }) as LogFields;
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

/**
 * 递归脱敏与截断：匹配 `SENSITIVE_FIELD` 的键只输出 [redacted]；数组/对象限制深度与元素个数。
 */
function sanitizeLogValue(value: unknown, key?: string, depth = 0): unknown {
  if (key && SENSITIVE_FIELD.test(key)) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return sanitizeLogValue(errorSummary(value), key, depth + 1);
  if (value instanceof Uint8Array) return { type: "Uint8Array", byteLength: value.byteLength };
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeLogValue(item, undefined, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push({ truncated: true, omittedItems: value.length - MAX_ARRAY_ITEMS });
    }
    return items;
  }
  if (typeof value !== "object") return String(value);
  if (depth >= MAX_DEPTH) return "[max-depth]";

  const output: LogFields = {};
  for (const [entryKey, entryValue] of Object.entries(value as LogFields)) {
    output[entryKey] = sanitizeLogValue(entryValue, entryKey, depth + 1);
  }
  return output;
}

/** 过长字符串改为 preview + length，防日志爆量 */
function truncateString(value: string): string | LogFields {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return {
    truncated: true,
    length: value.length,
    preview: value.slice(0, MAX_STRING_LENGTH)
  };
}
