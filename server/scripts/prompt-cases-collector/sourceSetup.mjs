import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function ensureSources({ sources, sourceRootA, sourceRootB, siteRoot }) {
  mkdirSync(sourceRootA, { recursive: true });
  mkdirSync(sourceRootB, { recursive: true });
  mkdirSync(siteRoot, { recursive: true });
  ensureGitRepo(
    "https://github.com/gpt-image2/awesome-gptimage2-prompts.git",
    sources.gptimage2,
    sourceRootA
  );
  ensureGitRepo(
    "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts.git",
    sources.evolinkApi,
    sourceRootA
  );
  ensureGitRepo(
    "https://github.com/freestylefly/awesome-gpt-image-2.git",
    sources.freestyle,
    sourceRootB
  );
  ensureGitRepo("https://github.com/ZeroLu/awesome-gpt-image.git", sources.zeroLu, sourceRootB);
  if (!existsSync(sources.evolinkSite)) {
    execFileSync(
      "curl",
      [
        "-L",
        "--compressed",
        "-A",
        "Mozilla/5.0 EdgeMusePromptCollector/1.0",
        "https://evolink.ai/zh/gpt-image-2-prompts",
        "-o",
        sources.evolinkSite
      ],
      { stdio: "inherit" }
    );
  }
}

function ensureGitRepo(url, path, cwd) {
  if (existsSync(join(path, ".git"))) return;
  execFileSync("git", ["-C", cwd, "clone", "--depth", "1", url], { stdio: "inherit" });
}

export { ensureSources };
