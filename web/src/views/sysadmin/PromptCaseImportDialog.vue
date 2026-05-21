<script setup lang="ts">
/**
 * sysadmin 案例 JSON 导入弹层。
 *
 * 只处理表单双向绑定和提交事件；JSON 解析、导入结果提示和刷新列表由控制器负责。
 */
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const open = defineModel<boolean>("open", { required: true });
const source = defineModel<string>("source", { required: true });
const sourceUrl = defineModel<string>("sourceUrl", { required: true });
const payload = defineModel<string>("payload", { required: true });

defineProps<{
  saving: boolean;
}>();

const emit = defineEmits<{
  submit: [];
}>();

const { t } = useI18n();
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      class="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0"
      prevent-outside-close
    >
      <DialogHeader class="border-b border-border p-4 pr-12">
        <DialogTitle>{{ t("promptCases.importJson") }}</DialogTitle>
        <p class="text-xs text-muted-foreground">{{ t("promptCases.importHint") }}</p>
      </DialogHeader>
      <form class="flex min-h-0 flex-1 flex-col overflow-hidden" @submit.prevent="emit('submit')">
        <div class="grid min-h-0 gap-3 overflow-y-auto p-4 md:grid-cols-2">
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.importSource") }}
            </span>
            <Input v-model="source" class="h-10" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.sourceUrl") }}
            </span>
            <Input v-model="sourceUrl" class="h-10" />
          </label>
          <label class="block md:col-span-2">
            <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
              {{ t("promptCases.importPayload") }}
            </span>
            <Textarea v-model="payload" class="min-h-80 font-mono text-xs" spellcheck="false" />
          </label>
        </div>
        <DialogFooter class="border-t border-border p-4">
          <DialogClose as-child>
            <Button variant="secondary" type="button" :disabled="saving">
              {{ t("common.cancel") }}
            </Button>
          </DialogClose>
          <Button type="submit" :disabled="saving">
            {{ t("promptCases.importJson") }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
