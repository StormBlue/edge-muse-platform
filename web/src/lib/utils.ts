/**
 * 与 shadcn-vue 惯例一致：条件 class 拼接（无依赖，替代 clsx 子集）。
 * 支持嵌套数组、键值对 `{ 'text-red-500': isError }`、以及过滤假值。
 */
type ClassValue = string | number | false | null | undefined | ClassDictionary | ClassArray;
type ClassDictionary = Record<string, boolean | null | undefined>;
type ClassArray = ClassValue[];

/** 合并为单个空格分隔的 class 字符串，供组件 `:class` 使用 */
export function cn(...values: ClassValue[]): string {
  const classes: string[] = [];

  for (const value of values) {
    if (!value) continue;

    if (typeof value === "string" || typeof value === "number") {
      classes.push(String(value));
      continue;
    }

    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) classes.push(nested);
      continue;
    }

    for (const [className, enabled] of Object.entries(value)) {
      if (enabled) classes.push(className);
    }
  }

  return classes.join(" ");
}
