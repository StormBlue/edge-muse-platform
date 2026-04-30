<script setup lang="ts">
/**
 * sysadmin 案例 JSON 导入弹层。
 *
 * 只处理表单双向绑定和提交事件；JSON 解析、导入结果提示和刷新列表由控制器负责。
 */
import { useI18n } from "vue-i18n";
import { onBeforeUnmount, watch } from "vue";

const open = defineModel<boolean>("open", { required: true });
const source = defineModel<string>("source", { required: true });
const sourceUrl = defineModel<string>("sourceUrl", { required: true });
const payload = defineModel<string>("payload", { required: true });

const props = defineProps<{
  saving: boolean;
}>();

const emit = defineEmits<{
  submit: [];
}>();

const { t } = useI18n();

watch(
  open,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener("keydown", onEscape);
    } else {
      document.removeEventListener("keydown", onEscape);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onEscape);
});

function close() {
  if (!props.saving) open.value = false;
}

function onEscape(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
    <form
      class="panel flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden"
      @submit.prevent="emit('submit')"
    >
      <div class="border-b border-border p-4">
        <h2 class="font-semibold">{{ t("promptCases.importJson") }}</h2>
        <p class="mt-1 text-xs text-muted-foreground">{{ t("promptCases.importHint") }}</p>
      </div>
      <div class="grid gap-3 p-4 md:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("promptCases.importSource") }}
          </span>
          <input v-model="source" class="ui-field h-10 px-3" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("promptCases.sourceUrl") }}
          </span>
          <input v-model="sourceUrl" class="ui-field h-10 px-3" />
        </label>
        <label class="block md:col-span-2">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {{ t("promptCases.importPayload") }}
          </span>
          <textarea
            v-model="payload"
            class="ui-field min-h-80 p-3 font-mono text-xs"
            spellcheck="false"
          />
        </label>
      </div>
      <div class="flex justify-end gap-2 border-t border-border p-4">
        <button
          class="ui-button ui-button-secondary"
          type="button"
          :disabled="saving"
          @click="close"
        >
          {{ t("common.cancel") }}
        </button>
        <button class="ui-button ui-button-primary" type="submit" :disabled="saving">
          {{ t("promptCases.importJson") }}
        </button>
      </div>
    </form>
  </div>
</template>
