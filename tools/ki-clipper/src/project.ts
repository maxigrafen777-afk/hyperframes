import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { ClipPlan } from "./clips.ts";
import { generateComposition, wordsInWindow } from "./composition.ts";
import { hyperframes, repoRoot } from "./run.ts";
import type { Word } from "./transcript.ts";

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";

/** A local GSAP build, so a render never fetches from the network. */
function localGsap(): string | null {
  for (const base of [repoRoot, process.cwd()]) {
    try {
      return createRequire(join(base, "package.json")).resolve("gsap/dist/gsap.min.js");
    } catch {
      // try the next base
    }
  }
  return null;
}

/** Writes a complete HyperFrames project for one clip; the clip video must already be in assets/. */
export async function writeClipProject(dir: string, clip: ClipPlan, words: Word[]): Promise<void> {
  await mkdir(join(dir, "assets"), { recursive: true });
  const gsap = localGsap();
  let gsapSrc = GSAP_CDN;
  if (gsap) {
    await copyFile(gsap, join(dir, "assets", "gsap.min.js"));
    gsapSrc = "assets/gsap.min.js";
  }
  const html = generateComposition({
    duration: clip.duration,
    hookTitle: clip.hookTitle,
    words: wordsInWindow(words, clip.start, clip.end),
    videoSrc: "assets/clip.mp4",
    gsapSrc,
  });
  await writeFile(join(dir, "index.html"), html);
  await writeFile(
    join(dir, "hyperframes.json"),
    `${JSON.stringify(
      {
        $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
        registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
        paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
        media: { autoProxy: true },
      },
      null,
      2,
    )}\n`,
  );
  if (!existsSync(join(dir, "meta.json"))) {
    await writeFile(
      join(dir, "meta.json"),
      `${JSON.stringify({ id: clip.slug, name: clip.hookTitle }, null, 2)}\n`,
    );
  }
}

export interface CheckOutcome {
  ok: boolean;
  summary: string;
}

/** `hyperframes lint` and `check`; returns a short summary instead of throwing. */
export async function checkProject(dir: string): Promise<CheckOutcome> {
  const lint = await hyperframes(["lint"], { cwd: dir });
  if (lint.code !== 0) {
    return {
      ok: false,
      summary: `lint: ${(lint.stdout + lint.stderr).trim().split("\n").slice(-6).join(" | ")}`,
    };
  }
  const check = await hyperframes(["check", "--json"], { cwd: dir });
  if (check.code !== 0) {
    return {
      ok: false,
      summary: `check: ${summarizeCheck(check.stdout) ?? check.stderr.trim().split("\n").slice(-4).join(" | ")}`,
    };
  }
  return { ok: true, summary: "lint + check bestanden" };
}

function summarizeCheck(stdout: string): string | null {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  try {
    const data: unknown = JSON.parse(stdout.slice(start));
    return JSON.stringify(data).slice(0, 600);
  } catch {
    return stdout.slice(0, 600);
  }
}

export async function renderProject(dir: string, output: string): Promise<void> {
  const result = await hyperframes(["render", "-o", output], { cwd: dir, inheritStderr: false });
  if (result.code !== 0 || !existsSync(output)) {
    const tail = (result.stdout + result.stderr).trim().split("\n").slice(-10).join("\n");
    throw new Error(`Rendern fehlgeschlagen:\n${tail}`);
  }
}
