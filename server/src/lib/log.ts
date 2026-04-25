export type LogFields = Record<string, unknown>;
export type LogLevel = "info" | "warn" | "error";

const MAX_STRING_LENGTH = 2048;
const MAX_ARRAY_ITEMS = 25;
const MAX_DEPTH = 6;
const SENSITIVE_FIELD =
  /^(authorization|cookie|set-cookie|token|secret|password|apiKey|api_key|encryptedKey|encrypted_key)$/i;

export function logInfo(event: string, fields: LogFields = {}): void {
  writeLog("info", event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  writeLog("warn", event, fields);
}

export function logError(event: string, error: unknown, fields: LogFields = {}): void {
  writeLog("error", event, { ...fields, error: errorSummary(error) });
}

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

function truncateString(value: string): string | LogFields {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return {
    truncated: true,
    length: value.length,
    preview: value.slice(0, MAX_STRING_LENGTH)
  };
}
