<script setup lang="ts">
import { ref } from "vue";
import { Send, Upload } from "lucide-vue-next";
import type { SessionMode } from "@/stores/session";

const props = defineProps<{
  loading?: boolean;
}>();

const emit = defineEmits<{
  submit: [value: { prompt: string; mode: SessionMode; size: string; n: number; files: File[] }];
}>();

const prompt = ref("");
const mode = ref<SessionMode>("text2image");
const size = ref("1024x1024");
const n = ref(1);
const files = ref<File[]>([]);

function submit() {
  if (!prompt.value.trim()) return;
  emit("submit", {
    prompt: prompt.value.trim(),
    mode: mode.value,
    size: size.value,
    n: n.value,
    files: files.value
  });
  prompt.value = "";
  files.value = [];
}

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  files.value = Array.from(input.files ?? []).slice(0, 5);
}
</script>

<template>
  <form class="panel p-3" @submit.prevent="submit">
    <textarea
      v-model="prompt"
      class="ui-field min-h-24 resize-none px-3 py-3 text-sm"
      placeholder="描述你想生成的图片..."
      @keydown.meta.enter.prevent="submit"
      @keydown.ctrl.enter.prevent="submit"
    ></textarea>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <select v-model="mode" class="ui-field h-9 w-32 px-2 text-sm">
        <option value="text2image">文生图</option>
        <option value="image2image">图生图</option>
        <option value="chat">对话</option>
      </select>
      <select v-model="size" class="ui-field h-9 w-36 px-2 text-sm">
        <option value="1024x1024">1024 x 1024</option>
        <option value="1024x1536">1024 x 1536</option>
        <option value="1536x1024">1536 x 1024</option>
        <option value="auto">Auto</option>
      </select>
      <input
        v-model.number="n"
        class="ui-field h-9 w-20 px-2 text-sm"
        min="1"
        max="4"
        type="number"
      />
      <label class="ui-button ui-button-secondary">
        <Upload class="h-4 w-4" />
        <span>{{ files.length ? `${files.length} 张` : "参考图" }}</span>
        <input
          class="hidden"
          multiple
          accept="image/png,image/jpeg,image/webp"
          type="file"
          @change="onFiles"
        />
      </label>
      <button class="ui-button ui-button-primary ml-auto" :disabled="props.loading" type="submit">
        <Send class="h-4 w-4" />
        生成
      </button>
    </div>
  </form>
</template>
