import * as fs from "fs";

export type EnvMap = Record<string, string>;

export type EnvAccessor = {
  /** The env file that will be read/written (first existing candidate, else last candidate). */
  readonly ENV_FILE: string;
  /** Parse the env file into a flat key/value map. Returns {} if none exists. */
  loadEnv(): EnvMap;
  /** Merge values into the env file, preserving existing keys. */
  writeEnv(values: EnvMap): void;
  /** Assert the given keys are present; exit(1) with a helpful hint otherwise. */
  requireEnv<K extends string>(
    env: Record<string, string | undefined>,
    keys: readonly K[]
  ): Record<K, string>;
};

/**
 * Build a provider-scoped env accessor over a list of candidate
 * `.env.local` paths (first existing wins; the last is used for writes
 * when none exist yet). This is the only env mechanism the harnesses
 * use — no dotenv dependency, just a tiny KEY=VALUE parser.
 */
export function createEnv(
  candidates: string[],
  exampleHint: string
): EnvAccessor {
  if (candidates.length === 0) {
    throw new Error("createEnv requires at least one candidate path");
  }
  const findEnvFile = (): string | undefined =>
    candidates.find((p) => fs.existsSync(p));
  const ENV_FILE = findEnvFile() ?? candidates[candidates.length - 1];

  const loadEnv = (): EnvMap => {
    const file = findEnvFile();
    if (!file) return {};
    const text = fs.readFileSync(file, "utf-8");
    const out: EnvMap = {};
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
    return out;
  };

  const writeEnv = (values: EnvMap): void => {
    const merged: EnvMap = { ...loadEnv(), ...values };
    const lines = Object.keys(merged).map((key) => `${key}=${merged[key]}`);
    fs.writeFileSync(findEnvFile() ?? ENV_FILE, lines.join("\n") + "\n");
  };

  const requireEnv = <K extends string>(
    env: Record<string, string | undefined>,
    keys: readonly K[]
  ): Record<K, string> => {
    const missing = keys.filter((k) => !env[k]);
    if (missing.length) {
      console.error(
        `Missing required env vars in ${ENV_FILE}: ${missing.join(", ")}`
      );
      console.error(exampleHint);
      process.exit(1);
    }
    return Object.fromEntries(keys.map((k) => [k, env[k]!])) as Record<
      K,
      string
    >;
  };

  return { ENV_FILE, loadEnv, writeEnv, requireEnv };
}
