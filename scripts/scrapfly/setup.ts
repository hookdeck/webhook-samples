import {
  loadEnv,
  writeEnv,
  requireEnv,
  prompt,
  promptHidden,
  hookdeckCi,
  upsertSource,
} from "./lib";

const SOURCE_DESCRIPTION =
  "Captures sample webhooks from Scrapfly for the webhook-samples repo";

async function main() {
  console.log("Scrapfly capture — setup\n");

  const env = loadEnv();
  const { HOOKDECK_API_KEY } = requireEnv(env, ["HOOKDECK_API_KEY"]);
  const sourceName = env.HOOKDECK_SOURCE_NAME || "scrapfly";
  const webhookName = env.SCRAPFLY_WEBHOOK_NAME || "samples-capture";

  console.log("1/4 Authenticating Hookdeck CLI for this project...");
  hookdeckCi(HOOKDECK_API_KEY, "scrapfly-samples");

  console.log(
    `\n2/4 Upserting Hookdeck source "${sourceName}" (initial, no secret)...`
  );
  const sourceUrl = upsertSource({
    name: sourceName,
    type: "WEBHOOK",
    description: SOURCE_DESCRIPTION,
  });
  console.log(`   Source URL: ${sourceUrl}`);

  console.log(`\n3/4 Configure Scrapfly manually:

   1. Open https://scrapfly.io/dashboard/webhook
   2. Create (or open) a webhook named "${webhookName}"
   3. Set the URL to:

      ${sourceUrl}

   4. Save it.
   5. Open the "Security" tab on the webhook and copy the signing secret.
`);

  let webhookSecret = env.SCRAPFLY_WEBHOOK_SECRET || "";
  if (webhookSecret) {
    const reuse = await prompt(
      `An existing SCRAPFLY_WEBHOOK_SECRET is set in .env.local. Reuse it? [Y/n]: `
    );
    if (reuse.toLowerCase() === "n" || reuse.toLowerCase() === "no") {
      webhookSecret = "";
    }
  }
  while (!webhookSecret) {
    webhookSecret = await promptHidden(
      `Paste the Scrapfly webhook signing secret (input hidden): `
    );
    if (!webhookSecret) {
      console.log("   Empty value. Try again or press Ctrl-C to abort.");
    }
  }

  writeEnv({
    HOOKDECK_SOURCE_NAME: sourceName,
    SCRAPFLY_WEBHOOK_NAME: webhookName,
    SCRAPFLY_WEBHOOK_SECRET: webhookSecret,
  });

  console.log(
    `\n4/4 Re-upserting source as type SCRAPFLY with signature verification...`
  );
  upsertSource({
    name: sourceName,
    type: "SCRAPFLY",
    description: SOURCE_DESCRIPTION,
    webhookSecret,
  });
  console.log(`   Source verification enabled.`);

  console.log(`\nDone. Next: ensure SCRAPFLY_API_KEY is set in .env.local, then run:
   yarn capture:scrapfly`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
