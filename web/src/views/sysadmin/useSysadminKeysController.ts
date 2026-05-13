import { computed, nextTick, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
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
import type { GroupMember, KeyGroupRow, KeyRow, ProviderRow } from "./sysadminKeysTypes";

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
  const selectedGroupId = ref<string>("");
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
  const keyListOffset = computed(() => 0);
  const selectedGroup = computed(
    () =>
      groups.value.find((group) => group.id === selectedGroupId.value) ?? groups.value[0] ?? null
  );
  const groupMembers = computed(() => selectedGroup.value?.members ?? []);
  const availableKeysForGroup = computed(() => {
    const group = selectedGroup.value;
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
  });
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
    if (
      !selectedGroupId.value ||
      !groups.value.some((group) => group.id === selectedGroupId.value)
    ) {
      selectedGroupId.value = groups.value[0]?.id ?? "";
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
    } finally {
      editSaving.value = false;
    }
  }

  async function toggleKey(key: KeyRow) {
    const enabled = !key.enabled;
    await setProviderKeyEnabled(key, enabled);
    toast.success(enabled ? t("sysadmin.keyEnabled") : t("sysadmin.keyDisabled"));
    await load();
  }

  async function deleteKey(key: KeyRow) {
    if (!window.confirm(t("sysadmin.deleteKeyConfirm", { label: key.label }))) return;
    await deleteProviderKey(key);
    toast.success(t("sysadmin.keyDeleted"));
    await load();
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
      const body = await createProviderKeyGroup(groupForm.value);
      toast.success(t("sysadmin.keyGroupCreated"));
      selectedGroupId.value = body.id;
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
    } finally {
      groupSaving.value = false;
    }
  }

  async function deleteGroup(group: KeyGroupRow) {
    if (!window.confirm(t("sysadmin.deleteKeyGroupConfirm", { name: group.name }))) return;
    await deleteProviderKeyGroup(group);
    toast.success(t("sysadmin.keyGroupDeleted"));
    selectedGroupId.value = "";
    await load();
  }

  async function addMember(keyId: string) {
    const group = selectedGroup.value;
    if (!group || !keyId || memberSaving.value) return;
    const keyIds = [...group.members.map((member) => member.providerKeyId), keyId];
    await saveMembers(group, keyIds, t("sysadmin.keyGroupMembersUpdated"));
  }

  async function removeMember(member: GroupMember) {
    const group = selectedGroup.value;
    if (!group || memberSaving.value) return;
    const keyIds = group.members
      .map((item) => item.providerKeyId)
      .filter((providerKeyId) => providerKeyId !== member.providerKeyId);
    await saveMembers(group, keyIds, t("sysadmin.keyGroupMembersUpdated"));
  }

  async function moveMember(fromIndex: number, toIndex: number) {
    const group = selectedGroup.value;
    if (!group || memberSaving.value) return;
    await saveMembers(
      group,
      reorderProviderKeyIds(group.members, fromIndex, toIndex),
      t("sysadmin.keyGroupMembersUpdated")
    );
  }

  async function saveMembers(group: KeyGroupRow, keyIds: string[], successMessage: string) {
    memberSaving.value = true;
    try {
      const body = await updateProviderKeyGroupMembers(group, keyIds);
      const target = groups.value.find((item) => item.id === group.id);
      if (target) target.members = body.members;
      toast.success(successMessage);
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

  function tableRowNumber(index: number) {
    return keyListOffset.value + index + 1;
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
    selectedGroupId,
    testingKeyId,
    createSaving,
    editSaving,
    groupSaving,
    memberSaving,
    form,
    editForm,
    groupForm,
    groupEditForm,
    selectedGroup,
    groupMembers,
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
    providerMeta,
    tableRowNumber
  };
}
export { reorderProviderKeyIds } from "./sysadminKeysForms";
