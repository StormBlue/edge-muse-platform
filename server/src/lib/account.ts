/**
 * 手工建号时邮箱占位与归一化：内部生成 `userId@edge-muse.local` 保证 users.email 唯一。
 */
const INTERNAL_EMAIL_DOMAIN = "edge-muse.local";

export function normalizeOptionalEmail(email?: string | null) {
  const value = email?.trim();
  return value ? value.toLowerCase() : undefined;
}

export function generatedEmailForUserId(userId: string) {
  return `${userId}@${INTERNAL_EMAIL_DOMAIN}`;
}
