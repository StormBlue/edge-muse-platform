import { computed, nextTick, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import type { ApiError } from "@/api/client";
import {
  createProviderKey,
  createProviderKeyGroup,
  deleteProviderKey,
  deleteProviderKeyGroup,
  loadSysadminKeysData,
  setProviderKeyEnabled,
  testProviderKey,
  updateProviderKey,
  updateProviderKeyGroup,
  updateProviderKeyGroupMembers
} from "./sysadminKeysApi";
import {
  defaultGroupForm,
  defaultKeyForm,
  editGroupForm,
  editKeyForm,
  reorderProviderKeyIds
} from "./sysadminKeysForms";
export type {
  GroupForm,
  GroupMember,
  KeyForm,
  KeyGroupRow,
  KeyRow,
  ProviderRow
} from "./sysadminKeysTypes";
import type { KeyGroupRow, KeyRow, ProviderRow } from "./sysadminKeysTypes";

export function useSysadminKeysController() {
  const keys = ref<KeyRow[]>([]);
  const groups = ref<KeyGroupRow[]>([]);
  const providers = ref<ProviderRow[]>([]);
  const { t } = useI18n();
  const createOpen = ref(false);
  const editOpen = ref(false);
  const groupCreateOpen = ref(false);
  const groupEditOpen = ref(false);
  const editing = ref<KeyRow | null>(null);
  const editingGroup = ref<KeyGroupRow | null>(null);
  const testingKeyId = ref<string | null>(null);
  const createSaving = ref(false);
  const editSaving = ref(false);
  const groupSaving = ref(false);
  const memberSaving = ref(false);
  const form = ref(defaultKeyForm());
  const editForm = ref(defaultKeyForm());
  const groupForm = ref(defaultGroupForm());
  const groupEditForm = ref(defaultGroupForm());

  const supportedProviders = computed(() =>
    providers.value.filter((provider) => provider.enabled && provider.builtIn)
  );
  function groupById(groupId: string): KeyGroupRow | null {
    return groups.value.find((group) => group.id === groupId) ?? null;
  }

  function availableKeysForGroup(groupId: string): KeyRow[] {
    const group = groupById(groupId);
    if (!group) return [];
    const memberIds = new Set(group.members.map((member) => member.providerKeyId));
    const usedByOtherGroupIds = new Set(
      groups.value
        .filter((item) => item.id !== group.id)
        .flatMap((item) => item.members.map((member) => member.providerKeyId))
    );
    return keys.value.filter(
      (key) =>
        key.providerId === group.providerId &&
        key.enabled &&
        !memberIds.has(key.id) &&
        !usedByOtherGroupIds.has(key.id)
    );
  }
  function groupContainingKey(keyId: string): KeyGroupRow | null {
    return (
      groups.value.find((group) =>
        group.members.some((member) => member.providerKeyId === keyId)
      ) ?? null
    );
  }

  function groupWhereKeyIsLastEnabledMember(keyId: string): KeyGroupRow | null {
    return (
      groups.value.find(
        (group) =>
          group.members.some((member) => member.providerKeyId === keyId) &&
          group.members.filter((member) => member.enabled).length <= 1
      ) ?? null
    );
  }
  const editProviderOptions = computed(() => {
    const current = providers.value.find((provider) => provider.id === editForm.value.providerId);
    if (!current || current.builtIn) return supportedProviders.value;
    return [current, ...supportedProviders.value];
  });
  const groupEditProviderOptions = computed(() => {
    const current = providers.value.find(
      (provider) => provider.id === groupEditForm.value.providerId
    );
    if (!current || current.builtIn) return supportedProviders.value;
    return [current, ...supportedProviders.value];
  });

  async function load() {
    const body = await loadSysadminKeysData();
    keys.value = body.keys;
    providers.value = body.providers;
    groups.value = body.groups;
    if (!form.value.providerId && supportedProviders.value[0]) {
      form.value.providerId = supportedProviders.value[0].id;
      form.value.model = supportedProviders.value[0].defaultModel;
    }
  }

  function openCreate() {
    createSaving.value = false;
    form.value = defaultKeyForm(supportedProviders.value[0]);
    createOpen.value = true;
  }

  async function create() {
    if (createSaving.value) return;
    createSaving.value = true;
    try {
      await createProviderKey(form.value);
      toast.success(t("sysadmin.keyCreated"));
      createOpen.value = false;
      await load();
    } finally {
      createSaving.value = false;
    }
  }

  function syncCreateModelWithProvider() {
    const provider = providers.value.find((item) => item.id === form.value.providerId);
    if (!provider) return;
    form.value.model = provider.defaultModel;
  }

  function openEdit(key: KeyRow) {
    editSaving.value = false;
    editing.value = key;
    editForm.value = editKeyForm(key);
    editOpen.value = true;
  }

  function syncEditModelWithProvider() {
    const provider = providers.value.find((item) => item.id === editForm.value.providerId);
    if (!provider) return;
    editForm.value.model = provider.defaultModel;
  }

  async function saveEdit() {
    if (!editing.value || editSaving.value) return;
    editSaving.value = true;
    const key = editing.value;
    try {
      await updateProviderKey(key, editForm.value);
      toast.success(t("sysadmin.keyUpdated"));
      editOpen.value = false;
      editing.value = null;
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error, t("sysadmin.keyUpdateFailed"), t));
    } finally {
      editSaving.value = false;
    }
  }

  async function toggleKey(key: KeyRow) {
    const enabled = !key.enabled;
    if (!enabled) {
      const group = groupWhereKeyIsLastEnabledMember(key.id);
      if (group) {
        toast.error(t("sysadmin.keyDisableBlockedLastGroupKey", { name: group.name }));
        return;
      }
    }
    try {
      await setProviderKeyEnabled(key, enabled);
      toast.success(enabled ? t("sysadmin.keyEnabled") : t("sysadmin.keyDisabled"));
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error, t("sysadmin.keyToggleFailed"), t));
    }
  }

  async function deleteKey(key: KeyRow) {
    const group = groupContainingKey(key.id);
    if (group) {
      toast.error(t("sysadmin.keyDeleteBlockedByGroup", { name: group.name }));
      return;
    }
    if (!window.confirm(t("sysadmin.deleteKeyConfirm", { label: key.label }))) return;
    try {
      await deleteProviderKey(key);
      toast.success(t("sysadmin.keyDeleted"));
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error, t("sysadmin.keyDeleteFailed"), t));
    }
  }

  function openCreateGroup() {
    groupSaving.value = false;
    groupForm.value = defaultGroupForm(supportedProviders.value[0]);
    groupCreateOpen.value = true;
  }

  async function createGroup() {
    if (groupSaving.value) return;
    groupSaving.value = true;
    try {
      await createProviderKeyGroup(groupForm.value);
      toast.success(t("sysadmin.keyGroupCreated"));
      groupCreateOpen.value = false;
      await load();
    } finally {
      groupSaving.value = false;
    }
  }

  function openEditGroup(group: KeyGroupRow) {
    groupSaving.value = false;
    editingGroup.value = group;
    groupEditForm.value = editGroupForm(group);
    groupEditOpen.value = true;
  }

  async function saveGroupEdit() {
    if (!editingGroup.value || groupSaving.value) return;
    groupSaving.value = true;
    const group = editingGroup.value;
    try {
      await updateProviderKeyGroup(group, groupEditForm.value);
      toast.success(t("sysadmin.keyGroupUpdated"));
      groupEditOpen.value = false;
      editingGroup.value = null;
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error, t("sysadmin.keyGroupProviderMismatch")));
    } finally {
      groupSaving.value = false;
    }
  }

  async function deleteGroup(group: KeyGroupRow) {
    if (!window.confirm(t("sysadmin.deleteKeyGroupConfirm", { name: group.name }))) return;
    await deleteProviderKeyGroup(group);
    toast.success(t("sysadmin.keyGroupDeleted"));
    await load();
  }

  async function addMember(groupId: string, keyId: string) {
    const group = groupById(groupId);
    if (!group || !keyId || memberSaving.value) return;
    const key = keys.value.find((item) => item.id === keyId);
    if (!key || key.providerId !== group.providerId) {
      toast.error(t("sysadmin.keyGroupProviderMismatch"));
      return;
    }
    const keyIds = [...group.members.map((member) => member.providerKeyId), keyId];
    await saveMembers(group, keyIds, t("sysadmin.keyGroupMembersUpdated"));
  }

  async function removeMember(groupId: string, providerKeyId: string) {
    const group = groupById(groupId);
    if (!group || memberSaving.value) return;
    const keyIds = group.members
      .map((item) => item.providerKeyId)
      .filter((itemProviderKeyId) => itemProviderKeyId !== providerKeyId);
    await saveMembers(group, keyIds, t("sysadmin.keyGroupMembersUpdated"));
  }

  async function moveMember(groupId: string, fromIndex: number, toIndex: number) {
    const group = groupById(groupId);
    if (!group || memberSaving.value) return;
    await saveMembers(
      group,
      reorderProviderKeyIds(group.members, fromIndex, toIndex),
      t("sysadmin.keyGroupMembersUpdated")
    );
  }

  async function saveMembers(group: KeyGroupRow, keyIds: string[], successMessage: string) {
    const nextKeyIds = filterProviderKeyIdsForGroup(keyIds, keys.value, group.providerId);
    memberSaving.value = true;
    try {
      const body = await updateProviderKeyGroupMembers(group, nextKeyIds);
      const target = groups.value.find((item) => item.id === group.id);
      if (target) target.members = body.members;
      toast.success(successMessage);
    } catch (error) {
      toast.error(apiErrorMessage(error, t("sysadmin.keyGroupProviderMismatch")));
    } finally {
      memberSaving.value = false;
      await nextTick();
    }
  }

  async function testKey(key: KeyRow) {
    testingKeyId.value = key.id;
    try {
      const body = await testProviderKey(key);
      if (body.ok) {
        toast.success(t("sysadmin.keyTestPassed"));
      } else {
        toast.error(t("sysadmin.keyTestFailed"));
      }
    } catch {
      toast.error(t("sysadmin.keyTestFailed"));
    } finally {
      testingKeyId.value = null;
    }
  }

  function providerLabel(id: string) {
    const provider = providers.value.find((item) => item.id === id);
    return provider ? provider.name : id;
  }

  function providerMeta(id: string) {
    const provider = providers.value.find((item) => item.id === id);
    if (!provider) return "";
    return `${provider.defaultModel} · ${provider.baseUrl}`;
  }

  onMounted(load);

  return {
    keys,
    groups,
    providers,
    t,
    createOpen,
    editOpen,
    groupCreateOpen,
    groupEditOpen,
    editing,
    editingGroup,
    testingKeyId,
    createSaving,
    editSaving,
    groupSaving,
    memberSaving,
    form,
    editForm,
    groupForm,
    groupEditForm,
    availableKeysForGroup,
    supportedProviders,
    editProviderOptions,
    groupEditProviderOptions,
    load,
    openCreate,
    create,
    syncCreateModelWithProvider,
    openEdit,
    syncEditModelWithProvider,
    saveEdit,
    toggleKey,
    deleteKey,
    testKey,
    openCreateGroup,
    createGroup,
    openEditGroup,
    saveGroupEdit,
    deleteGroup,
    addMember,
    removeMember,
    moveMember,
    providerLabel,
    providerMeta
  };
}
export { reorderProviderKeyIds } from "./sysadminKeysForms";

export function filterProviderKeyIdsForGroup(keyIds: string[], keys: KeyRow[], providerId: string) {
  const keyById = new Map(keys.map((key) => [key.id, key]));
  return keyIds.filter((keyId) => keyById.get(keyId)?.providerId === providerId);
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

function apiErrorMessage(error: unknown, fallback: string, t?: Translate) {
  const maybeApiError = error as Partial<ApiError>;
  const details = maybeApiError.error?.details;
  if (t && details && typeof details === "object") {
    const reason = (details as { reason?: unknown }).reason;
    const groupName = (details as { groupName?: unknown }).groupName;
    const name = typeof groupName === "string" && groupName ? groupName : t("sysadmin.keyGroups");
    if (reason === "PROVIDER_KEY_IN_GROUP") {
      return t("sysadmin.keyDeleteBlockedByGroup", { name });
    }
    if (reason === "LAST_ENABLED_PROVIDER_KEY_IN_GROUP") {
      return t("sysadmin.keyDisableBlockedLastGroupKey", { name });
    }
  }
  return maybeApiError.error?.message || fallback;
}
