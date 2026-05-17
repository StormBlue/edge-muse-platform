/**
 * 内置服务商目录。
 *
 * 产品上已经取消「服务商」配置页面，但数据库仍保留 providers 表作为密钥和任务的归属。
 * 因此这里负责把新接入的固定服务商补齐到 D1，密钥页只需要从 providers 读取并选择即可。
 */
import { now } from "../lib/id";
import { stringifyJson } from "../lib/json";
import type { AppBindings } from "../types";

export const MICU_PROVIDER_ID = "prv_micu";
export const CUBENCE_PROVIDER_ID = "prv_cubence";
export const MICU_BASE_URL = "https://www.micuapi.ai";

export const BUILT_IN_PROVIDERS = [
  {
    id: MICU_PROVIDER_ID,
    name: "米醋API",
    baseUrl: MICU_BASE_URL,
    defaultModel: "gpt-image-2",
    requestFormat: "micu_images",
    supportedSizes: [
      "1024x1024",
      "1280x720",
      "720x1280",
      "1024x1536",
      "1536x1024",
      "1920x1088",
      "1088x1920",
      "2048x2048",
      "2048x1152",
      "1152x2048",
      "3840x2160",
      "2160x3840"
    ]
  },
  {
    id: CUBENCE_PROVIDER_ID,
    name: "Cubence",
    baseUrl: "https://api-dmit.cubence.com",
    defaultModel: "gpt-image-2",
    requestFormat: "openai_images",
    supportedSizes: [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "2048x2048",
      "2880x2880",
      "3840x2160",
      "2160x3840",
      "auto"
    ]
  }
] as const;

const BUILT_IN_PROVIDER_IDS = new Set<string>(BUILT_IN_PROVIDERS.map((provider) => provider.id));
export const PROVIDER_KEY_ASSIGNABLE_PROVIDER_IDS: string[] = BUILT_IN_PROVIDERS.map(
  (provider) => provider.id
);

/** 后台删除/恢复逻辑用固定 id 判断内置 provider，避免被普通 provider 误伤。 */
export function isBuiltInProviderId(providerId: string): boolean {
  return BUILT_IN_PROVIDER_IDS.has(providerId);
}

/** 密钥创建/改绑的产品策略：服务商页下线后，只允许绑定到内置支持的 provider。 */
export function isProviderKeyAssignable(providerId: string): boolean {
  return isBuiltInProviderId(providerId);
}

/**
 * 补齐并修复内置服务商。
 *
 * - 缺失时插入“米醋API”和 Cubence，密钥页永远有明确可选服务商；
 * - 内置 provider 配置以代码 catalog 为准，避免服务商页下线后数据库残留错误配置。
 */
export async function ensureBuiltInProviders(env: AppBindings): Promise<void> {
  const timestamp = now();
  await env.DB.batch(
    BUILT_IN_PROVIDERS.flatMap((provider) => {
      const supportedSizes = stringifyJson([...provider.supportedSizes]);
      return [
        env.DB.prepare(
          `INSERT OR IGNORE INTO providers (
           id, name, base_url, default_model, request_format, supported_sizes, enabled, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7)`
        ).bind(
          provider.id,
          provider.name,
          provider.baseUrl,
          provider.defaultModel,
          provider.requestFormat,
          supportedSizes,
          timestamp
        ),
        env.DB.prepare(
          `UPDATE providers
         SET
           name = ?2,
           base_url = ?3,
           default_model = ?4,
           request_format = ?5,
           supported_sizes = ?6,
           enabled = 1,
           deleted_at = NULL,
           updated_at = ?7
         WHERE id = ?1
           AND (
             name <> ?2
             OR base_url <> ?3
             OR default_model <> ?4
             OR request_format <> ?5
             OR supported_sizes <> ?6
             OR enabled <> 1
             OR deleted_at IS NOT NULL
           )`
        ).bind(
          provider.id,
          provider.name,
          provider.baseUrl,
          provider.defaultModel,
          provider.requestFormat,
          supportedSizes,
          timestamp
        )
      ];
    })
  );
}
