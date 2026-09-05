import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import type { ImageAttachment } from "@/stores/session";

export type ImageRecreation = { image: ImageAttachment; reuse: "params" | "reference" };

/** 只传递来源标识；目标页重新读取有权限的任务，URL 不承载提示词或图片内容。 */
export function useImageRecreation() {
  const auth = useAuthStore();
  const router = useRouter();
  const canRecreate = computed(() =>
    Boolean(
      auth.isSysadmin || auth.generationEntry?.showAiImage || auth.generationEntry?.showWorkspace
    )
  );
  async function recreate({ image, reuse }: ImageRecreation) {
    if (!canRecreate.value || !image.taskId) return;
    await router.push({
      path: auth.isSysadmin || auth.generationEntry?.showAiImage ? "/ai-image" : "/workspace",
      query: { mode: "blank", sourceTask: image.taskId, reuse, image: image.id }
    });
  }
  return { canRecreate, recreate };
}
