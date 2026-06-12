import * as fs from "fs";
import * as path from "path";
import { spawn, SpawnOptions, ChildProcess } from "child_process";
import * as readline from "readline";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ENV_CANDIDATES = [
  path.join(__dirname, ".env.local"),
  path.join(REPO_ROOT, ".env.local"),
];

export type EnvShape = {
  HOOKDECK_API_KEY: string;
  SCRAPFLY_API_KEY: string;
  SCRAPFLY_WEBHOOK_NAME: string;
  HOOKDECK_SOURCE_NAME: string;
  SCRAPFLY_WEBHOOK_SECRET: string;
};

function findEnvFile(): string | undefined {
  return ENV_CANDIDATES.find((p) => fs.existsSync(p));
}

export const ENV_FILE = findEnvFile() ?? ENV_CANDIDATES[1];

export function loadEnv(): Partial<EnvShape> {
  const file = findEnvFile();
  if (!file) return {};
  const text = fs.readFileSync(file, "utf-8");
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out as Partial<EnvShape>;
}

export function writeEnv(values: Partial<EnvShape>): void {
  const existing = loadEnv();
  const merged: Record<string, string> = { ...existing, ...values } as Record<
    string,
    string
  >;
  const ordered = [
    "HOOKDECK_API_KEY",
    "SCRAPFLY_API_KEY",
    "SCRAPFLY_WEBHOOK_NAME",
    "HOOKDECK_SOURCE_NAME",
    "SCRAPFLY_WEBHOOK_SECRET",
  ];
  const lines: string[] = [];
  for (const key of ordered) {
    if (merged[key] !== undefined) lines.push(`${key}=${merged[key]}`);
  }
  for (const key of Object.keys(merged)) {
    if (!ordered.includes(key)) lines.push(`${key}=${merged[key]}`);
  }
  fs.writeFileSync(findEnvFile() ?? ENV_FILE, lines.join("\n") + "\n");
}

export function requireEnv<K extends keyof EnvShape>(
  env: Partial<EnvShape>,
  keys: readonly K[]
): Pick<EnvShape, K> {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    console.error(
      `Missing required env vars in ${ENV_FILE}: ${missing.join(", ")}`
    );
    console.error(
      `Copy scripts/scrapfly/.env.example to .env.local and fill in.`
    );
    process.exit(1);
  }
  return Object.fromEntries(keys.map((k) => [k, env[k]!])) as Pick<
    EnvShape,
    K
  >;
}

export async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

export async function promptHidden(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isTTY ? stdin.isRaw : false;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");

    const CODE_LF = 0x0a;
    const CODE_CR = 0x0d;
    const CODE_CTRL_C = 0x03;
    const CODE_BS = 0x08;
    const CODE_DEL = 0x7f;

    let buffer = "";
    const finish = () => {
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === CODE_LF || code === CODE_CR) {
          finish();
          resolve(buffer.trim());
          return;
        }
        if (code === CODE_CTRL_C) {
          finish();
          reject(new Error("Aborted"));
          return;
        }
        if (code === CODE_BS || code === CODE_DEL) {
          buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += ch;
      }
    };
    stdin.on("data", onData);
  });
}

export function runHookdeck(
  args: string[],
  opts: { capture?: boolean } = {}
): { stdout: string; stderr: string; code: number } {
  const { spawnSync } = require("child_process") as typeof import("child_process");
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
  const child = spawn(cmd, args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  return child;
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
