import * as path from "path";
import { createEnv, REPO_ROOT } from "../lib";

// Re-export the shared, provider-agnostic harness toolkit so existing
// imports (`from "./lib"`) keep working after the generalization.
export * from "../lib";

export type EnvShape = {
  HOOKDECK_API_KEY: string;
  SCRAPFLY_API_KEY: string;
  SCRAPFLY_WEBHOOK_NAME: string;
  HOOKDECK_SOURCE_NAME: string;
  SCRAPFLY_WEBHOOK_SECRET: string;
};

// Scrapfly-scoped env accessor: prefers scripts/scrapfly/.env.local,
// falls back to <repo-root>/.env.local. Both are gitignored.
const scrapflyEnv = createEnv(
  [path.join(__dirname, ".env.local"), path.join(REPO_ROOT, ".env.local")],
  "Copy scripts/scrapfly/.env.example to .env.local and fill in."
);

export const ENV_FILE = scrapflyEnv.ENV_FILE;
export const loadEnv = scrapflyEnv.loadEnv;
export const writeEnv = scrapflyEnv.writeEnv;
export const requireEnv = scrapflyEnv.requireEnv;
