import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const batches = [
  [
    "test/authRefresh.test.ts",
    "test/cookies.test.ts",
    "test/crypto.test.ts",
    "test/cubenceRegression.test.ts",
    "test/generationPolicy.test.ts",
    "test/historyImages.test.ts",
    "test/jwt.test.ts",
    "test/password.test.ts",
    "test/promptAssistant.test.ts",
    "test/provider.test.ts",
    "test/providerCapabilities.test.ts",
    "test/referenceImages.test.ts",
    "test/turnstile.test.ts"
  ],
  ["test/apiPermissions.test.ts"],
  [
    "test/aiModelSettings.test.ts",
    "test/captcha.test.ts",
    "test/generationEntry.test.ts",
    "test/promptCases.integration.test.ts"
  ],
  ["test/announcements.test.ts", "test/sessionDeletion.test.ts", "test/tasksCreate.test.ts"],
  ["test/queueScheduler.test.ts"]
];

const cwd = fileURLToPath(new URL("..", import.meta.url));
const command = process.execPath;
const vitestCli = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
// Miniflare/workerd can keep native worker processes alive briefly after Vitest exits.
// A short gap keeps Windows/Node 24 runs from tripping Vitest's worker-pool crash handling.
const batchDelayMs = Number(process.env.VITEST_BATCH_DELAY_MS ?? 10_000);
const retryDelayMs = Number(process.env.VITEST_BATCH_RETRY_DELAY_MS ?? 30_000);
const maxRetries = Number(process.env.VITEST_BATCH_RETRIES ?? 1);

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
