import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  /** Print the child's stderr live (progress bars of ffmpeg, yt-dlp, render). */
  inheritStderr?: boolean;
  env?: Record<string, string>;
}

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  // Node's own fetch ignores HTTPS_PROXY unless asked; model downloads need it behind a proxy.
  if ((env.HTTPS_PROXY || env.https_proxy) && !env.NODE_USE_ENV_PROXY) env.NODE_USE_ENV_PROXY = "1";
  return env;
}

export function run(cmd: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: childEnv(options.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (options.inheritStderr) process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

export async function runOrThrow(
  cmd: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const result = await run(cmd, args, options);
  if (result.code !== 0) {
    const tail = (result.stderr || result.stdout).trim().split("\n").slice(-12).join("\n");
    throw new Error(
      `${cmd} ${args.slice(0, 2).join(" ")} … ist fehlgeschlagen (Exit ${result.code}):\n${tail}`,
    );
  }
  return result;
}

export async function hasCommand(cmd: string): Promise<boolean> {
  try {
    const result = await run(cmd, ["--version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
/** The HyperFrames repo this tool lives in (tools/ki-clipper/src → repo root). */
export const repoRoot = resolve(here, "..", "..", "..");

/**
 * How to call the HyperFrames CLI: `HYPERFRAMES_BIN`, else this repo's built
 * CLI, else `npx hyperframes`.
 */
export function hyperframesCommand(): { cmd: string; prefix: string[] } {
  const custom = process.env.HYPERFRAMES_BIN?.trim();
  if (custom) {
    const [cmd, ...prefix] = custom.split(/\s+/);
    return { cmd, prefix };
  }
  const local = join(repoRoot, "packages", "cli", "dist", "cli.js");
  if (existsSync(local)) return { cmd: "node", prefix: [local] };
  return { cmd: "npx", prefix: ["--yes", "hyperframes"] };
}

export function hyperframes(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const { cmd, prefix } = hyperframesCommand();
  return run(cmd, [...prefix, ...args], {
    ...options,
    env: { HYPERFRAMES_SKIP_SKILLS: "1", ...options.env },
  });
}
