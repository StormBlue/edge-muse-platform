const INTERNAL_EMAIL_DOMAIN = "edge-muse.local";

export function normalizeOptionalEmail(email?: string | null) {
  const value = email?.trim();
  return value ? value.toLowerCase() : undefined;
}

export function generatedEmailForUserId(userId: string) {
  return `${userId}@${INTERNAL_EMAIL_DOMAIN}`;
}
