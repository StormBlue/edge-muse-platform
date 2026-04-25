<script setup lang="ts">
import { ref } from "vue";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const nickname = ref(auth.user?.nickname ?? "");

async function save() {
  await auth.updateProfile(nickname.value);
  toast.success("已保存");
}
</script>

<template>
  <AppShell>
    <div class="max-w-xl">
      <h1 class="mb-4 text-xl font-semibold">个人资料</h1>
      <form class="panel space-y-4 p-5" @submit.prevent="save">
        <label class="block text-sm font-medium">昵称</label>
        <input v-model="nickname" class="ui-field h-11 px-3" />
        <button class="ui-button ui-button-primary" type="submit">保存</button>
      </form>
    </div>
  </AppShell>
</template>
