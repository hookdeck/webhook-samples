import * as path from "path";
import {
  loadEnv,
  requireEnv,
  runCapture,
  REPO_ROOT,
  DEFAULT_API_BASE_URL,
} from "./lib";
import { OrdinalClient } from "./ordinal";
import { buildTriggers, CreatedResource } from "./events";

const RECEIVER_PATH = "/ordinal/latest";
const OUTPUT_DIR = path.join(REPO_ROOT, "providers", "ordinal", "latest");
const WEBHOOK_DELIVERY_TIMEOUT_MS = 120_000;

async function main() {
  const env = loadEnv();
  const required = requireEnv(env, [
    "HOOKDECK_API_KEY",
    "ORDINAL_API_KEY",
    "HOOKDECK_SOURCE_NAME",
  ]);
  const baseUrl = env.ORDINAL_API_BASE_URL || DEFAULT_API_BASE_URL;

  const client = new OrdinalClient(required.ORDINAL_API_KEY, baseUrl);

  // Resources the triggers create, torn down after the run regardless of
  // outcome so a capture leaves no junk in the workspace.
  const created: CreatedResource[] = [];
  try {
    await runCapture({
      hookdeckApiKey: required.HOOKDECK_API_KEY,
      ciName: "ordinal-capture",
      sourceName: required.HOOKDECK_SOURCE_NAME,
      receiverPath: RECEIVER_PATH,
      outputDir: OUTPUT_DIR,
      deliveryTimeoutMs: WEBHOOK_DELIVERY_TIMEOUT_MS,
      triggers: buildTriggers(client, created),
    });
  } finally {
    await cleanup(client, created);
  }

  console.log(
    "\nNote: events that can't be driven through the API unattended " +
      "(social_profile.*, post.published, comments, approvals granted, " +
      "invite.accepted, etc.) keep their docs-sourced payloads. See " +
      "providers/ordinal/README.md."
  );
}

/**
 * Best-effort teardown of everything the triggers created. Posts are
 * archived (moved to trash) — Ordinal has no API permanent-delete —
 * and invites are deleted. Failures are logged, never thrown, so
 * cleanup can't mask a capture result.
 */
async function cleanup(
  client: OrdinalClient,
  created: CreatedResource[]
): Promise<void> {
  if (created.length === 0) return;
  console.log(`\nCleaning up ${created.length} test resource(s)...`);
  let cleaned = 0;
  const leftBehind: string[] = [];
  for (const r of created) {
    try {
      if (r.kind === "post") await client.archivePost(r.id);
      else await client.deleteInvite(r.id);
      cleaned++;
    } catch (e) {
      leftBehind.push(`${r.kind} ${r.id} (${(e as Error).message})`);
    }
  }
  console.log(`   Cleaned ${cleaned}/${created.length}.`);
  if (leftBehind.length) {
    console.error(
      `   Left behind — remove manually: ${leftBehind.join("; ")}`
    );
  }
  console.log(
    "   (Posts are archived to trash; Ordinal has no API permanent-delete.)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
