import * as fs from "fs";
import * as path from "path";
import { loadEnv, requireEnv, runCapture, REPO_ROOT } from "./lib";

const RECEIVER_PATH = "/scrapfly/latest";
const OUTPUT_DIR = path.join(REPO_ROOT, "providers", "scrapfly", "latest");
// Screenshot is intentionally omitted. Scrapfly's Screenshot API
// posts raw image bytes with a `Content-Type: application/json`
// header (dictated by the webhook config) — the header lies about
// the body. Hookdeck rejects with UNPARSABLE_JSON. See
// providers/scrapfly/README.md for the full diagnosis.
const WEBHOOK_DELIVERY_TIMEOUT_MS = 120_000;

const INLINE_HTML = `<!doctype html>
<html><body>
<h1>Sample Product</h1>
<div class="product">
  <span class="name">Widget</span>
  <span class="price">$19.99</span>
  <span class="stock">In stock</span>
</div>
</body></html>`;

type ScrapflyEnv = {
  SCRAPFLY_API_KEY: string;
  SCRAPFLY_WEBHOOK_NAME: string;
};

async function main() {
  const env = loadEnv();
  const required = requireEnv(env, [
    "HOOKDECK_API_KEY",
    "SCRAPFLY_API_KEY",
    "SCRAPFLY_WEBHOOK_NAME",
    "HOOKDECK_SOURCE_NAME",
  ]);

  await runCapture({
    hookdeckApiKey: required.HOOKDECK_API_KEY,
    ciName: "scrapfly-capture",
    sourceName: required.HOOKDECK_SOURCE_NAME,
    receiverPath: RECEIVER_PATH,
    outputDir: OUTPUT_DIR,
    deliveryTimeoutMs: WEBHOOK_DELIVERY_TIMEOUT_MS,
    scrub: scrubFile,
    triggers: [
      { name: "extraction", run: () => triggerExtraction(required) },
      { name: "scrape", run: () => triggerScrape(required) },
    ],
  });
}

async function triggerExtraction(env: ScrapflyEnv): Promise<string> {
  const url = new URL("https://api.scrapfly.io/extraction");
  url.searchParams.set("key", env.SCRAPFLY_API_KEY);
  url.searchParams.set("url", "https://web-scraping.dev/products");
  url.searchParams.set(
    "extraction_prompt",
    "Extract the product name, price, and stock as JSON"
  );
  url.searchParams.set("webhook_name", env.SCRAPFLY_WEBHOOK_NAME);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "text/html" },
    body: INLINE_HTML,
  });
  return parseJobId(res, "extraction");
}

async function triggerScrape(env: ScrapflyEnv): Promise<string> {
  const url = new URL("https://api.scrapfly.io/scrape");
  url.searchParams.set("key", env.SCRAPFLY_API_KEY);
  url.searchParams.set("url", "https://web-scraping.dev/products");
  url.searchParams.set("webhook_name", env.SCRAPFLY_WEBHOOK_NAME);
  const res = await fetch(url.toString());
  return parseJobId(res, "scrape");
}

async function parseJobId(res: Response, label: string): Promise<string> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    const parsed = JSON.parse(text);
    return parsed?.context?.job?.uuid || parsed?.uuid || "(unknown)";
  } catch {
    return "(non-json)";
  }
}

function scrubFile(filePath: string): void {
  const raw = fs.readFileSync(filePath, "utf-8");
  const obj = JSON.parse(raw);
  scrubInPlace(obj);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n");
}

function scrubInPlace(node: any): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(scrubInPlace);
    return;
  }
  for (const key of Object.keys(node)) {
    if (
      typeof node[key] === "string" &&
      (key === "secret" ||
        key === "api_key" ||
        key === "x-scrapfly-webhook-signature" ||
        key === "x-scrapfly-webhook-signature-lowercase")
    ) {
      node[key] = "REDACTED";
    } else {
      scrubInPlace(node[key]);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
