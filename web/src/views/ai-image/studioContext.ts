import { inject, provide, type InjectionKey } from "vue";
import type { useImageStudio } from "./useImageStudio";

type ImageStudio = ReturnType<typeof useImageStudio>;
const studioKey: InjectionKey<ImageStudio> = Symbol("image-studio");

/** 编辑器、结果与案例选择器共享同一控制器，避免把可变业务状态当成只读 props 传递。 */
export function provideImageStudio(studio: ImageStudio) {
  provide(studioKey, studio);
}

export function useImageStudioContext() {
  const studio = inject(studioKey);
  if (!studio) throw new Error("Image studio provider is required");
  return studio;
}
