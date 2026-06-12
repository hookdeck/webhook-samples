import * as fs from "fs";
import * as path from "path";
import {
  spawn,
  spawnSync,
  SpawnOptions,
  ChildProcess,
} from "child_process";

// Repo root, relative to scripts/lib/.
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Run the Hookdeck CLI synchronously. Provider-agnostic — both the
 * Scrapfly and Ordinal harnesses shell out through here so there is a
 * single place that owns cwd and stdio handling.
 */
export function runHookdeck(
  args: string[],
  opts: { capture?: boolean } = {}
): { stdout: string; stderr: string; code: number } {
  const result = spawnSync("hookdeck", args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: opts.capture ? "pipe" : ["inherit", "pipe", "pipe"],
  });
  return {
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    code: result.status ?? 1,
  };
}

export function spawnLongRunning(
  cmd: string,
  args: string[],
  opts: SpawnOptions = {}
): ChildProcess {
  return spawn(cmd, args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

export async function waitForHttp(
  url: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

export async function waitForFile(
  filePath: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${filePath}`);
}
