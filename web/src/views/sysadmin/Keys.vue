<script setup lang="ts">
/**
 * 服务商 API 密钥：创建时提交明文，服务端 AES 入库；列表仅显示 keyHint；可配配额与归属。
 */
import { Loader2, PlugZap, Plus, RefreshCw } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import { useSysadminKeysController } from "./useSysadminKeysController";

const {
  keys,
  t,
  createOpen,
  editOpen,
  editing,
  testingKeyId,
  createSaving,
  editSaving,
  form,
  editForm,
  supportedProviders,
  editProviderOptions,
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
  providerLabel,
  providerMeta,
  tableRowNumber
} = useSysadminKeysController();
</script>

<template>
  <AppShell>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">{{ t("nav.keys") }}</h1>
      <div class="flex flex-wrap gap-2">
        <button class="ui-button ui-button-secondary" type="button" @click="load">
          <RefreshCw class="h-4 w-4" />
          {{ t("sysadmin.refreshList") }}
        </button>
        <button class="ui-button ui-button-primary" type="button" @click="openCreate">
          <Plus class="h-4 w-4" />
          {{ t("sysadmin.createKey") }}
        </button>
      </div>
    </div>

    <div class="panel overflow-hidden">
      <div class="thin-scrollbar max-h-[calc(100vh-10rem)] overflow-auto">
        <table class="w-full min-w-[64rem] text-sm">
          <thead class="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>
              <th class="w-16 p-3">{{ t("common.sequence") }}</th>
              <th class="p-3">{{ t("sysadmin.label") }}</th>
              <th class="p-3">{{ t("sysadmin.provider") }}</th>
              <th class="p-3">{{ t("sysadmin.keyModel") }}</th>
              <th class="p-3">{{ t("sysadmin.keyHint") }}</th>
              <th class="p-3">{{ t("common.quota") }}</th>
              <th class="p-3">{{ t("adminUsers.status") }}</th>
              <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!keys.length" class="border-t border-border">
              <td class="p-4 text-center text-muted-foreground" colspan="8">
                {{ t("sysadmin.noKeys") }}
              </td>
            </tr>
            <tr v-for="(key, index) in keys" :key="key.id" class="border-t border-border">
              <td class="p-3 font-mono text-muted-foreground">{{ tableRowNumber(index) }}</td>
              <td class="p-3">
                <p class="font-medium">{{ key.label }}</p>
                <p class="text-xs text-muted-foreground">{{ key.id }}</p>
              </td>
              <td class="p-3">{{ providerLabel(key.providerId) }}</td>
              <td class="p-3">{{ key.model || "-" }}</td>
              <td class="p-3 font-mono">{{ key.keyHint }}</td>
              <td class="p-3">{{ key.usedQuota }} / {{ key.allocatedQuota ?? "∞" }}</td>
              <td class="p-3">
                <span
                  class="rounded-full px-2 py-1 text-xs"
                  :class="
                    key.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ key.enabled ? t("common.enabled") : t("common.disabled") }}
                </span>
              </td>
              <td class="space-x-2 p-3 text-right">
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  :disabled="testingKeyId === key.id"
                  @click="testKey(key)"
                >
                  <Loader2 v-if="testingKeyId === key.id" class="h-3.5 w-3.5 animate-spin" />
                  <PlugZap v-else class="h-3.5 w-3.5" />
                  {{ t("sysadmin.testKey") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="openEdit(key)"
                >
                  {{ t("sysadmin.edit") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs"
                  type="button"
                  @click="toggleKey(key)"
                >
                  {{ key.enabled ? t("common.disabled") : t("common.enabled") }}
                </button>
                <button
                  class="ui-button ui-button-secondary h-8 text-xs text-destructive"
                  type="button"
                  @click="deleteKey(key)"
                >
                  {{ t("common.delete") }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="createOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="!createSaving && (createOpen = false)"
    >
      <form
        class="panel w-full max-w-md space-y-3 p-5"
        :aria-busy="createSaving"
        @submit.prevent="create"
      >
        <h2 class="font-semibold">{{ t("sysadmin.createKey") }}</h2>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.provider") }}
          </span>
          <select
            v-model="form.providerId"
            class="ui-field h-10 px-3"
            required
            @change="syncCreateModelWithProvider"
          >
            <option value="">{{ t("sysadmin.selectProvider") }}</option>
            <option v-for="provider in supportedProviders" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
          <span v-if="form.providerId" class="mt-1 block text-xs text-muted-foreground">
            {{ providerMeta(form.providerId) }}
          </span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.label") }}
          </span>
          <input v-model="form.label" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.keyModel") }}
          </span>
          <input v-model="form.model" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.apiKey") }}
          </span>
          <input v-model="form.apiKey" class="ui-field h-10 px-3" required type="password" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="createSaving"
            @click="createOpen = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button class="ui-button ui-button-primary" type="submit" :disabled="createSaving">
            <Loader2 v-if="createSaving" class="h-4 w-4 animate-spin" />
            {{ t("common.create") }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="editOpen && editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="!editSaving && (editOpen = false)"
    >
      <form
        class="panel w-full max-w-md space-y-3 p-5"
        :aria-busy="editSaving"
        @submit.prevent="saveEdit"
      >
        <h2 class="font-semibold">{{ t("sysadmin.editKey") }}</h2>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.provider") }}
          </span>
          <select
            v-model="editForm.providerId"
            class="ui-field h-10 px-3"
            required
            @change="syncEditModelWithProvider"
          >
            <option
              v-for="provider in editProviderOptions"
              :key="provider.id"
              :value="provider.id"
              :disabled="
                provider.id !== editForm.providerId && (!provider.builtIn || !provider.enabled)
              "
            >
              {{ provider.name }}
            </option>
          </select>
          <span v-if="editForm.providerId" class="mt-1 block text-xs text-muted-foreground">
            {{ providerMeta(editForm.providerId) }}
          </span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.label") }}
          </span>
          <input v-model="editForm.label" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.keyModel") }}
          </span>
          <input v-model="editForm.model" class="ui-field h-10 px-3" required />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("sysadmin.apiKeyOptional") }}
          </span>
          <input v-model="editForm.apiKey" class="ui-field h-10 px-3" type="password" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :disabled="editSaving"
            @click="editOpen = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button class="ui-button ui-button-primary" type="submit" :disabled="editSaving">
            <Loader2 v-if="editSaving" class="h-4 w-4 animate-spin" />
            {{ t("common.save") }}
          </button>
        </div>
      </form>
    </div>
  </AppShell>
</template>
