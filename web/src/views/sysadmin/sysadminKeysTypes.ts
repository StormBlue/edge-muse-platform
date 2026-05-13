export type ProviderRow = {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  requestFormat: string;
  supportedSizes: string[];
  enabled: boolean;
  builtIn: boolean;
};

export type KeyRow = {
  id: string;
  providerId: string;
  label: string;
  model?: string | null;
  keyHint: string;
  enabled: boolean;
  allocatedQuota: number | null;
  usedQuota: number;
  maxConcurrency: number;
  activeSlots: number;
};

export type GroupMember = {
  id: string;
  providerKeyId: string;
  providerId: string;
  label: string;
  model?: string | null;
  keyHint: string;
  enabled: boolean;
  allocatedQuota: number | null;
  usedQuota: number;
  maxConcurrency: number;
  sortOrder: number;
};

export type KeyGroupRow = {
  id: string;
  providerId: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  members: GroupMember[];
  createdAt?: number;
  updatedAt?: number;
};

export type KeyForm = {
  providerId: string;
  label: string;
  model: string;
  apiKey: string;
  allocatedQuota: number | null;
  maxConcurrency: number;
  enabled: boolean;
};

export type GroupForm = {
  providerId: string;
  name: string;
  description: string;
  enabled: boolean;
};
