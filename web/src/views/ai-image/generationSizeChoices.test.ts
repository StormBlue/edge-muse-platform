import { describe, expect, it } from "vitest";
import { generationSizeChoices } from "./generationSizeChoices";

describe("generationSizeChoices", () => {
  it("shows Auto, 3:2, and a custom choice while keeping all other sizes in the menu", () => {
    const choices = generationSizeChoices(
      [
        { value: "1024x1024", ratio: "1:1", label: "1024 x 1024" },
        { value: "auto", ratio: "Auto", label: "Auto" },
        { value: "1536x1024", ratio: "3:2", label: "1536 x 1024" },
        { value: "1024x1536", ratio: "2:3", label: "1024 x 1536" }
      ],
      "1024x1536"
    );

    expect(choices.primary.map((choice) => choice.option.value)).toEqual([
      "auto",
      "1536x1024",
      "1024x1536"
    ]);
    expect(choices.customOptions.map((option) => option.value)).toEqual(["1024x1024", "1024x1536"]);
  });
});
