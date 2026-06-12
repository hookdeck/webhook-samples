import { runHookdeck } from "./process";

/**
 * Authenticate the Hookdeck CLI in CI mode against a project, writing
 * credentials to `.hookdeck/config.toml` (gitignored). Idempotent and
 * isolated from any global `hookdeck login`.
 */
export function hookdeckCi(apiKey: string, name: string): void {
  const ci = runHookdeck(
    ["ci", "--api-key", apiKey, "--local", "--name", name],
    { capture: true }
  );
  if (ci.code !== 0) {
    console.error("hookdeck ci failed:");
    console.error(ci.stderr || ci.stdout);
    process.exit(1);
  }
  if (ci.stdout) process.stdout.write(ci.stdout);
}

export type UpsertSourceOptions = {
  name: string;
  type: string;
  description: string;
  webhookSecret?: string;
};

/**
 * Idempotently upsert a Hookdeck gateway source and return its public
 * URL. Used by every provider setup to obtain the stable inbound URL
 * that the provider's webhook is pointed at.
 */
export function upsertSource(opts: UpsertSourceOptions): string {
  const args = [
    "gateway",
    "source",
    "upsert",
    opts.name,
    "--type",
    opts.type,
    "--description",
    opts.description,
    "--output",
    "json",
  ];
  if (opts.webhookSecret) {
    args.push("--webhook-secret", opts.webhookSecret);
  }
  const result = runHookdeck(args, { capture: true });
  if (result.code !== 0) {
    console.error("hookdeck gateway source upsert failed:");
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  let url: string | undefined;
  try {
    const parsed = JSON.parse(result.stdout);
    url = parsed?.url || parsed?.source?.url;
  } catch {
    console.error("Could not parse upsert output as JSON:");
    console.error(result.stdout);
    process.exit(1);
  }
  if (!url) {
    console.error("No source URL returned from Hookdeck. Raw output:");
    console.error(result.stdout);
    process.exit(1);
  }
  return url;
}
