import {
  loadEnv,
  writeEnv,
  requireEnv,
  prompt,
  promptHidden,
  runHookdeck,
} from "./lib";

async function main() {
  console.log("Scrapfly capture — setup\n");

  const env = loadEnv();
  const { HOOKDECK_API_KEY } = requireEnv(env, ["HOOKDECK_API_KEY"]);
  const sourceName = env.HOOKDECK_SOURCE_NAME || "scrapfly";
  const webhookName = env.SCRAPFLY_WEBHOOK_NAME || "samples-capture";

  console.log("1/4 Authenticating Hookdeck CLI for this project...");
  const ci = runHookdeck(
    ["ci", "--api-key", HOOKDECK_API_KEY, "--local", "--name", "scrapfly-samples"],
    { capture: true }
  );
  if (ci.code !== 0) {
    console.error("hookdeck ci failed:");
    console.error(ci.stderr || ci.stdout);
    process.exit(1);
  }
  process.stdout.write(ci.stdout);

  console.log(`\n2/4 Upserting Hookdeck source "${sourceName}" (initial, no secret)...`);
  const initialUpsert = runHookdeck(
    [
      "gateway",
      "source",
      "upsert",
      sourceName,
      "--type",
      "WEBHOOK",
      "--description",
      "Captures sample webhooks from Scrapfly for the webhook-samples repo",
      "--output",
      "json",
    ],
    { capture: true }
  );
  if (initialUpsert.code !== 0) {
    console.error("hookdeck gateway source upsert failed:");
    console.error(initialUpsert.stderr || initialUpsert.stdout);
    process.exit(1);
  }

  let sourceUrl: string | undefined;
  try {
    const parsed = JSON.parse(initialUpsert.stdout);
    sourceUrl = parsed?.url || parsed?.source?.url;
  } catch (e) {
    console.error("Could not parse upsert output as JSON:");
    console.error(initialUpsert.stdout);
    process.exit(1);
  }
  if (!sourceUrl) {
    console.error("No source URL returned from Hookdeck. Raw output:");
    console.error(initialUpsert.stdout);
    process.exit(1);
  }

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
  const secureUpsert = runHookdeck(
    [
      "gateway",
      "source",
      "upsert",
      sourceName,
      "--type",
      "SCRAPFLY",
      "--webhook-secret",
      webhookSecret,
      "--description",
      "Captures sample webhooks from Scrapfly for the webhook-samples repo",
      "--output",
      "json",
    ],
    { capture: true }
  );
  if (secureUpsert.code !== 0) {
    console.error("Failed to upgrade source to SCRAPFLY type:");
    console.error(secureUpsert.stderr || secureUpsert.stdout);
    console.error(
      "\nFallback: source remains as type WEBHOOK without verification. " +
        "Re-run `yarn setup:scrapfly` to retry."
    );
    process.exit(1);
  }
  console.log(`   Source verification enabled.`);

  console.log(`\nDone. Next: ensure SCRAPFLY_API_KEY is set in .env.local, then run:
   yarn capture:scrapfly`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
