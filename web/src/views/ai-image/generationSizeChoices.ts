import type { SizeOption } from "@/views/workspace/workspaceOptions";

export type GenerationSizeChoice = {
  kind: "auto" | "preferred" | "custom";
  option: SizeOption;
};

const AUTO_SIZE_VALUE = "auto";
const PREFERRED_RATIO = "3:2";

export function generationSizeChoices(options: SizeOption[], selectedValue: string) {
  const fallback = options[0] ?? {
    value: selectedValue,
    ratio: selectedValue,
    label: selectedValue
  };
  const auto = options.find((option) => option.value === AUTO_SIZE_VALUE);
  const preferred = options.find((option) => option.ratio === PREFERRED_RATIO);
  const custom =
    options.find(
      (option) =>
        option.value === selectedValue &&
        option.value !== auto?.value &&
        option.value !== preferred?.value
    ) ??
    options.find((option) => option.value !== auto?.value && option.value !== preferred?.value) ??
    fallback;

  return {
    primary: [
      { kind: "auto", option: auto ?? fallback },
      { kind: "preferred", option: preferred ?? custom },
      { kind: "custom", option: custom }
    ] satisfies GenerationSizeChoice[],
    customOptions: options.filter(
      (option) => option.value !== auto?.value && option.value !== preferred?.value
    )
  };
}
