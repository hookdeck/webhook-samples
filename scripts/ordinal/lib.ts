import * as path from "path";
import { createEnv, REPO_ROOT } from "../lib";

// Re-export the shared, provider-agnostic harness toolkit.
export * from "../lib";

export type EnvShape = {
  HOOKDECK_API_KEY: string;
  ORDINAL_API_KEY: string;
  HOOKDECK_SOURCE_NAME: string;
  ORDINAL_WEBHOOK_NAME: string;
  ORDINAL_WEBHOOK_ID: string;
  ORDINAL_API_BASE_URL: string;
};

// Ordinal-scoped env accessor: prefers scripts/ordinal/.env.local,
// falls back to <repo-root>/.env.local. Both are gitignored.
const ordinalEnv = createEnv(
  [path.join(__dirname, ".env.local"), path.join(REPO_ROOT, ".env.local")],
  "Copy scripts/ordinal/.env.example to .env.local and fill in."
);

export const ENV_FILE = ordinalEnv.ENV_FILE;
export const loadEnv = ordinalEnv.loadEnv;
export const writeEnv = ordinalEnv.writeEnv;
export const requireEnv = ordinalEnv.requireEnv;

export const DEFAULT_API_BASE_URL = "https://app.tryordinal.com/api/v1";
