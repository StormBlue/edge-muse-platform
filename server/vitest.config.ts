import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 20_000,
    fileParallelism: false,
    maxWorkers: 1,
    include: ["test/**/*.test.ts"]
  }
});
