import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// 自动发现所有测试，避免新增回归文件后因手工清单漏登记而被 CI 静默跳过。
// D1 测试单文件隔离批次，继续限制 Windows 下 workerd 的进程峰值。
const batches = readdirSync(new URL("../test/", import.meta.url))
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => [`test/${name}`]);
if (!batches.length) throw new Error("No server test files discovered");

const cwd = fileURLToPath(new URL("..", import.meta.url));
const command = process.execPath;
const vitestCli = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
// Miniflare/workerd can keep native worker processes alive briefly after Vitest exits.
// A short gap keeps Windows/Node 24 runs from tripping Vitest's worker-pool crash handling.
const batchDelayMs = Number(
  process.env.VITEST_BATCH_DELAY_MS ?? (process.platform === "win32" ? 1_000 : 0)
);
const retryDelayMs = Number(process.env.VITEST_BATCH_RETRY_DELAY_MS ?? 30_000);
const maxRetries = Number(process.env.VITEST_BATCH_RETRIES ?? 0);

for (const [index, files] of batches.entries()) {
  console.log(`\nRunning Vitest batch ${index + 1}/${batches.length}`);
  await runWithRetry(command, [vitestCli, "run", ...files], maxRetries);
  if (index < batches.length - 1 && batchDelayMs > 0) {
    await delay(batchDelayMs);
  }
}

async function runWithRetry(commandName, args, retries) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await run(commandName, args);
      return;
    } catch (error) {
      if (attempt >= retries) throw error;
      console.warn(
        `Vitest batch failed; retrying in ${retryDelayMs}ms (${attempt + 1}/${retries})`
      );
      await delay(retryDelayMs);
    }
  }
}

function run(commandName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `${commandName} ${args.join(" ")} exited with signal ${signal}`
            : `${commandName} ${args.join(" ")} exited with code ${code}`
        )
      );
    });
  });
}
