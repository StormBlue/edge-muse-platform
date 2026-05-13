import type { GroupForm, KeyForm, KeyGroupRow, KeyRow, ProviderRow } from "./sysadminKeysTypes";

export function defaultKeyForm(provider?: ProviderRow): KeyForm {
  return {
    providerId: provider?.id ?? "",
    label: "",
    model: provider?.defaultModel ?? "gpt-image-2",
    apiKey: "",
    allocatedQuota: null,
    maxConcurrency: 1,
    enabled: true
  };
}

export function editKeyForm(key: KeyRow): KeyForm {
  return {
    providerId: key.providerId,
    label: key.label,
    model: key.model ?? "",
    apiKey: "",
    allocatedQuota: key.allocatedQuota,
    maxConcurrency: key.maxConcurrency ?? 1,
    enabled: key.enabled
  };
}

export function defaultGroupForm(provider?: ProviderRow): GroupForm {
  return {
    providerId: provider?.id ?? "",
    name: "",
    description: "",
    enabled: true
  };
}

export function editGroupForm(group: KeyGroupRow): GroupForm {
  return {
    providerId: group.providerId,
    name: group.name,
    description: group.description ?? "",
    enabled: group.enabled
  };
}

export function reorderProviderKeyIds<T extends { providerKeyId: string }>(
  members: T[],
  fromIndex: number,
  toIndex: number
): string[] {
  const ids = members.map((member) => member.providerKeyId);
  const [id] = ids.splice(fromIndex, 1);
  if (!id) return ids;
  const targetIndex = Math.max(0, Math.min(ids.length, toIndex));
  ids.splice(targetIndex, 0, id);
  return ids;
}
