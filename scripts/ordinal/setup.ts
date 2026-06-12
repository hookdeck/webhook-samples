import {
  loadEnv,
  writeEnv,
  requireEnv,
  hookdeckCi,
  upsertSource,
  DEFAULT_API_BASE_URL,
} from "./lib";
import { OrdinalClient } from "./ordinal";
import { ALL_TOPICS } from "./events";

const SOURCE_DESCRIPTION =
  "Captures sample webhooks from Ordinal for the webhook-samples repo";

async function main() {
  console.log("Ordinal capture — setup\n");

  const env = loadEnv();
  const { HOOKDECK_API_KEY, ORDINAL_API_KEY } = requireEnv(env, [
    "HOOKDECK_API_KEY",
    "ORDINAL_API_KEY",
  ]);
  const sourceName = env.HOOKDECK_SOURCE_NAME || "ordinal";
  const webhookName = env.ORDINAL_WEBHOOK_NAME || "samples-capture";
  const baseUrl = env.ORDINAL_API_BASE_URL || DEFAULT_API_BASE_URL;

  console.log("1/3 Authenticating Hookdeck CLI for this project...");
  hookdeckCi(HOOKDECK_API_KEY, "ordinal-samples");

  // Ordinal has no documented webhook signature scheme, so the source is
  // a generic WEBHOOK type (no signature verification). The Hookdeck
  // source URL is unguessable and acts as the shared secret.
  console.log(`\n2/3 Upserting Hookdeck source "${sourceName}"...`);
  const sourceUrl = upsertSource({
    name: sourceName,
    type: "WEBHOOK",
    description: SOURCE_DESCRIPTION,
  });
  console.log(`   Source URL: ${sourceUrl}`);

  console.log(
    `\n3/3 Upserting Ordinal webhook "${webhookName}" → source (all ${ALL_TOPICS.length} topics)...`
  );
  const client = new OrdinalClient(ORDINAL_API_KEY, baseUrl);
  const { webhook, created } = await client.upsertWebhook({
    name: webhookName,
    url: sourceUrl,
    topics: [...ALL_TOPICS],
    description: "webhook-samples capture",
  });
  console.log(
    `   Ordinal webhook ${created ? "created" : "updated"} (id ${webhook.id}).`
  );

  writeEnv({
    HOOKDECK_SOURCE_NAME: sourceName,
    ORDINAL_WEBHOOK_NAME: webhookName,
    ORDINAL_WEBHOOK_ID: webhook.id,
    ORDINAL_API_BASE_URL: baseUrl,
  });

  console.log(`\nDone. Next run:
   yarn capture:ordinal`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
