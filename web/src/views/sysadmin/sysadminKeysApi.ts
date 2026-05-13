import { apiFetch } from "@/api/client";
import type {
  GroupForm,
  GroupMember,
  KeyForm,
  KeyGroupRow,
  KeyRow,
  ProviderRow
} from "./sysadminKeysTypes";

export async function loadSysadminKeysData() {
  const [keyBody, providerBody, groupBody] = await Promise.all([
    apiFetch<{ items: KeyRow[] }>("/sysadmin/provider-keys?includeUnsupported=1"),
    apiFetch<{ items: ProviderRow[] }>("/sysadmin/providers"),
    apiFetch<{ items: KeyGroupRow[] }>("/sysadmin/provider-key-groups")
  ]);
  return {
    keys: keyBody.items,
    providers: providerBody.items,
    groups: groupBody.items
  };
}

export function createProviderKey(form: KeyForm) {
  return apiFetch("/sysadmin/provider-keys", {
    method: "POST",
    body: JSON.stringify(form)
  });
}

export function updateProviderKey(key: KeyRow, form: KeyForm) {
  const providerChanged = form.providerId !== key.providerId;
  return apiFetch(`/sysadmin/provider-keys/${key.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      providerId: providerChanged ? form.providerId : undefined,
      label: form.label,
      model: form.model,
      apiKey: form.apiKey || undefined,
      allocatedQuota: form.allocatedQuota,
      maxConcurrency: form.maxConcurrency,
      enabled: form.enabled
    })
  });
}

export function setProviderKeyEnabled(key: KeyRow, enabled: boolean) {
  return apiFetch(`/sysadmin/provider-keys/${key.id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled })
  });
}

export function deleteProviderKey(key: KeyRow) {
  return apiFetch(`/sysadmin/provider-keys/${key.id}`, { method: "DELETE" });
}

export function testProviderKey(key: KeyRow) {
  return apiFetch<{ ok: boolean }>(`/sysadmin/provider-keys/${key.id}/test`, {
    method: "POST"
  });
}

export function createProviderKeyGroup(form: GroupForm) {
  return apiFetch<{ id: string }>("/sysadmin/provider-key-groups", {
    method: "POST",
    body: JSON.stringify({
      providerId: form.providerId,
      name: form.name,
      description: form.description || null,
      enabled: form.enabled
    })
  });
}

export function updateProviderKeyGroup(group: KeyGroupRow, form: GroupForm) {
  return apiFetch(`/sysadmin/provider-key-groups/${group.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      providerId: form.providerId !== group.providerId ? form.providerId : undefined,
      name: form.name,
      description: form.description || null,
      enabled: form.enabled
    })
  });
}

export function deleteProviderKeyGroup(group: KeyGroupRow) {
  return apiFetch(`/sysadmin/provider-key-groups/${group.id}`, { method: "DELETE" });
}

export function updateProviderKeyGroupMembers(group: KeyGroupRow, keyIds: string[]) {
  return apiFetch<{ members: GroupMember[] }>(`/sysadmin/provider-key-groups/${group.id}/members`, {
    method: "PUT",
    body: JSON.stringify({ keyIds })
  });
}
