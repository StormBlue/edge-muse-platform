export type AdminUser = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  preferredProviderKeyId?: string | null;
  providerKeyGroupId?: string | null;
  providerKeyGroupName?: string | null;
  providerKeyGroupProviderId?: string | null;
  maxConcurrentTasks?: number | null;
  allocatedQuota: number | null;
  usedQuota: number | null;
  createdAt?: number;
  updatedAt?: number;
  lastLoginAt?: number | null;
  lastGenerationAt?: number | null;
  generationCount?: number;
};

export type QuotaSnapshot = {
  allocatedQuota: number | null;
  usedQuota: number;
  remainingQuota: number | null;
};

export type QuotaTransaction = {
  id: string;
  delta: number;
  reason: string;
  taskId?: string | null;
  createdAt: number;
};

export type UsageResponse = {
  total: number;
  stats: Array<{ status: string; mode: string; count: number }>;
  trend: Array<{ day: number; count: number }>;
};

export type ProviderKeyGroupRow = {
  id: string;
  providerId: string;
  name: string;
  description?: string | null;
  enabled: boolean;
};
