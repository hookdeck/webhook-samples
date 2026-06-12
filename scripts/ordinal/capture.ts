import * as path from "path";
import {
  loadEnv,
  requireEnv,
  runCapture,
  REPO_ROOT,
  DEFAULT_API_BASE_URL,
} from "./lib";
import { OrdinalClient } from "./ordinal";
import { buildTriggers } from "./events";

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

  await runCapture({
    hookdeckApiKey: required.HOOKDECK_API_KEY,
    ciName: "ordinal-capture",
    sourceName: required.HOOKDECK_SOURCE_NAME,
    receiverPath: RECEIVER_PATH,
    outputDir: OUTPUT_DIR,
    deliveryTimeoutMs: WEBHOOK_DELIVERY_TIMEOUT_MS,
    triggers: buildTriggers(client),
  });

  console.log(
    "\nNote: events that can't be driven through the API unattended " +
      "(social_profile.*, post.published, comments, approvals granted, " +
      "invite.accepted, etc.) keep their docs-sourced payloads. See " +
      "providers/ordinal/README.md."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
