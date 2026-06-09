import { describe, expect, it } from "vitest";
import {
  assertMaxConcurrentTasksConfigAllowed,
  assertMaxImagesPerGenerationConfigAllowed,
  defaultMaxConcurrentTasksForRole,
  defaultMaxImagesPerGenerationForRole,
  isSingleActiveGenerationRole,
  MAX_CONFIGURABLE_IMAGE_COUNT,
  MAX_SYSADMIN_IMAGE_COUNT,
  resolveImageCountForRole,
  resolveMaxImagesPerGenerationForRole,
  resolveMaxConcurrentTasksForRole
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

  it("allows admins and users to customize image count within their configured limit", () => {
    expect(resolveImageCountForRole("admin", "text2image", 2, 2)).toBe(2);
    expect(resolveImageCountForRole("user", "image2image", 20, 20)).toBe(20);
  });

  it("rejects admin and user image counts above their configured limit", () => {
    expect(() => resolveImageCountForRole("admin", "text2image", 2)).toThrow(
      "Image count must be between 1 and 1"
    );
    expect(() => resolveImageCountForRole("user", "image2image", 3, 2)).toThrow(
      "Image count must be between 1 and 2"
    );
    expect(() => resolveImageCountForRole("user", "text2image", 21, 99)).toThrow(
      "Image count must be between 1 and 20"
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

  it("resolves role-based max active generation task defaults", () => {
    expect(defaultMaxConcurrentTasksForRole("sysadmin")).toBeNull();
    expect(defaultMaxConcurrentTasksForRole("admin")).toBe(10);
    expect(defaultMaxConcurrentTasksForRole("user")).toBe(5);
    expect(resolveMaxConcurrentTasksForRole("sysadmin", 100)).toBeNull();
    expect(resolveMaxConcurrentTasksForRole("admin", undefined)).toBe(10);
    expect(resolveMaxConcurrentTasksForRole("user", undefined)).toBe(5);
  });

  it("clamps configured active generation task limits by role", () => {
    expect(resolveMaxConcurrentTasksForRole("admin", 12)).toBe(12);
    expect(resolveMaxConcurrentTasksForRole("admin", 99)).toBe(15);
    expect(resolveMaxConcurrentTasksForRole("user", 8)).toBe(8);
    expect(resolveMaxConcurrentTasksForRole("user", 99)).toBe(10);
  });

  it("validates configurable active generation task limits", () => {
    expect(() => assertMaxConcurrentTasksConfigAllowed("admin", 15)).not.toThrow();
    expect(() => assertMaxConcurrentTasksConfigAllowed("user", 10)).not.toThrow();
    expect(() => assertMaxConcurrentTasksConfigAllowed("admin", 16)).toThrow(
      "Max concurrent tasks"
    );
    expect(() => assertMaxConcurrentTasksConfigAllowed("user", 11)).toThrow("Max concurrent tasks");
    expect(() => assertMaxConcurrentTasksConfigAllowed("sysadmin", 100)).not.toThrow();
  });

  it("resolves and validates configurable image count limits", () => {
    expect(MAX_CONFIGURABLE_IMAGE_COUNT).toBe(20);
    expect(defaultMaxImagesPerGenerationForRole("sysadmin")).toBeNull();
    expect(defaultMaxImagesPerGenerationForRole("admin")).toBe(1);
    expect(defaultMaxImagesPerGenerationForRole("user")).toBe(1);
    expect(resolveMaxImagesPerGenerationForRole("sysadmin", 20)).toBeNull();
    expect(resolveMaxImagesPerGenerationForRole("admin", undefined)).toBe(1);
    expect(resolveMaxImagesPerGenerationForRole("user", 12)).toBe(12);
    expect(resolveMaxImagesPerGenerationForRole("user", 99)).toBe(20);
    expect(() => assertMaxImagesPerGenerationConfigAllowed("admin", 20)).not.toThrow();
    expect(() => assertMaxImagesPerGenerationConfigAllowed("user", 21)).toThrow(
      "Max images per generation"
    );
  });
});
