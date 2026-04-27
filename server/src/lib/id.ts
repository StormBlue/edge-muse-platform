/** 生成主键；`prefix` 如 `msg`/`tsk` 便于日志与排错（非安全随机用途） */
export function newId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/** 统一毫秒时间戳，与 schema integer 字段一致 */
export function now(): number {
  return Date.now();
}
