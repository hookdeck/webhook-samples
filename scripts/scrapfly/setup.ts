import {
  loadEnv,
  writeEnv,
  requireEnv,
  prompt,
  runHookdeck,
} from "./lib";

async function main() {
  console.log("Scrapfly capture — setup\n");

  const env = loadEnv();
  const { HOOKDECK_API_KEY } = requireEnv(env, ["HOOKDECK_API_KEY"]);
  const sourceName = env.HOOKDECK_SOURCE_NAME || "scrapfly";
  const webhookName = env.SCRAPFLY_WEBHOOK_NAME || "samples-capture";

  console.log("1/3 Authenticating Hookdeck CLI for this project...");
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

  console.log(`\n2/3 Upserting Hookdeck source "${sourceName}"...`);
  const upsert = runHookdeck(
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
  if (upsert.code !== 0) {
    console.error("hookdeck gateway source upsert failed:");
    console.error(upsert.stderr || upsert.stdout);
    process.exit(1);
  }

  let sourceUrl: string | undefined;
  try {
    const parsed = JSON.parse(upsert.stdout);
    sourceUrl = parsed?.url || parsed?.source?.url;
  } catch (e) {
    console.error("Could not parse upsert output as JSON:");
    console.error(upsert.stdout);
    process.exit(1);
  }
  if (!sourceUrl) {
    console.error("No source URL returned from Hookdeck. Raw output:");
    console.error(upsert.stdout);
    process.exit(1);
  }

  console.log(`   Source URL: ${sourceUrl}`);

  console.log(`\n3/3 Configure Scrapfly manually:

   1. Open https://scrapfly.io/dashboard/webhook
   2. Create a webhook named "${webhookName}"
   3. Set the URL to:

      ${sourceUrl}

   4. Save it.
`);
  const ans = await prompt(
    `Press Enter when the Scrapfly webhook is saved (or type "skip"): `
  );
  if (ans.toLowerCase() === "skip") {
    console.log("Skipped manual confirmation. Capture will fail until configured.");
  }

  writeEnv({
    HOOKDECK_SOURCE_NAME: sourceName,
    SCRAPFLY_WEBHOOK_NAME: webhookName,
  });

  console.log(`\nDone. Next: ensure SCRAPFLY_API_KEY is set in .env.local, then run:
   yarn capture:scrapfly`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
