import { describe, expect, it } from "vitest";
import {
  isSingleActiveGenerationRole,
  MAX_SYSADMIN_IMAGE_COUNT,
  resolveImageCountForRole
} from "../src/lib/generationPolicy";

describe("generation policy", () => {
  it("allows sysadmins to customize image count", () => {
    expect(resolveImageCountForRole("sysadmin", "text2image", 12)).toBe(12);
    expect(MAX_SYSADMIN_IMAGE_COUNT).toBe(200);
    expect(resolveImageCountForRole("sysadmin", "text2image", 200)).toBe(200);
  });

  it("allows sysadmins to customize image-to-image count", () => {
    expect(resolveImageCountForRole("sysadmin", "image2image", 4)).toBe(4);
  });

  it("rejects customized image count for admins and users", () => {
    expect(() => resolveImageCountForRole("admin", "text2image", 2)).toThrow(
      "Only system administrators can customize image count"
    );
    expect(() => resolveImageCountForRole("user", "image2image", 3)).toThrow(
      "Only system administrators can customize image count"
    );
  });

  it("rejects counts outside the service limit", () => {
    expect(() => resolveImageCountForRole("sysadmin", "text2image", 0)).toThrow(
      "Image count must be between"
    );
    expect(() =>
      resolveImageCountForRole("sysadmin", "text2image", MAX_SYSADMIN_IMAGE_COUNT + 1)
    ).toThrow("Image count must be between");
  });

  it("limits concurrent active generations for admins and users only", () => {
    expect(isSingleActiveGenerationRole("user")).toBe(true);
    expect(isSingleActiveGenerationRole("admin")).toBe(true);
    expect(isSingleActiveGenerationRole("sysadmin")).toBe(false);
  });
});
