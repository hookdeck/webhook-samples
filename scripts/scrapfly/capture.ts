import * as fs from "fs";
import * as path from "path";
import { ChildProcess } from "child_process";
import {
  loadEnv,
  requireEnv,
  runHookdeck,
  spawnLongRunning,
  waitForFile,
  waitForHttp,
  REPO_ROOT,
} from "./lib";

const RECEIVER_PORT = 9001;
const RECEIVER_PATH = "/scrapfly/latest";
const OUTPUT_DIR = path.join(REPO_ROOT, "providers", "scrapfly", "latest");
// Screenshot is intentionally omitted. Scrapfly's Screenshot API
// posts raw image bytes with a `Content-Type: application/json`
// header (dictated by the webhook config) — the header lies about
// the body. Hookdeck rejects with UNPARSABLE_JSON. See
// providers/scrapfly/README.md for the full diagnosis.
const PRODUCT_TOPICS = ["scrape", "extraction"] as const;

// One crawl job emits several events. These five land on any clean
// crawl, so they're the ones we delete up front and then wait for.
// crawler_url_skipped is among them: a crawl bounded by max_depth
// filters out every link beyond the boundary, so a normal run skips
// far more URLs than it visits.
const CRAWLER_TOPICS = [
  "crawler_started",
  "crawler_url_discovered",
  "crawler_url_visited",
  "crawler_url_skipped",
  "crawler_finished",
] as const;

// The remaining crawler events only fire on a crawl that hits a bad
// URL or is interrupted. A clean run won't produce them, so they're
// never deleted and never waited for — if one shows up it's a bonus.
// Capturing them deliberately means crawling a site that fails, which
// isn't worth wiring into the happy path.
const CONDITIONAL_CRAWLER_TOPICS = [
  "crawler_url_failed",
  "crawler_stopped",
  "crawler_cancelled",
] as const;

// Omitting webhook_events does NOT subscribe to everything — Scrapfly
// defaults to crawler_started, crawler_stopped, crawler_cancelled and
// crawler_finished, so the per-URL events never arrive. They have to be
// named explicitly.
const CRAWLER_WEBHOOK_EVENTS = [
  ...CRAWLER_TOPICS,
  ...CONDITIONAL_CRAWLER_TOPICS,
];

const TOPICS = [...PRODUCT_TOPICS, ...CRAWLER_TOPICS] as const;
// A crawl emits its events over the life of the job, so crawler_finished
// arrives well after the scrape and extraction deliveries. Override with
// SCRAPFLY_CAPTURE_TIMEOUT_MS when a run needs longer.
const WEBHOOK_DELIVERY_TIMEOUT_MS = Number(
  process.env.SCRAPFLY_CAPTURE_TIMEOUT_MS ?? 120_000
);
const PROCESS_READY_DELAY_MS = 5_000;

const INLINE_HTML = `<!doctype html>
<html><body>
<h1>Sample Product</h1>
<div class="product">
  <span class="name">Widget</span>
  <span class="price">$19.99</span>
  <span class="stock">In stock</span>
</div>
</body></html>`;

type ChildHandles = {
  receiver: ChildProcess;
  listen: ChildProcess;
};

async function main() {
  const env = loadEnv();
  const required = requireEnv(env, [
    "HOOKDECK_API_KEY",
    "SCRAPFLY_API_KEY",
    "SCRAPFLY_WEBHOOK_NAME",
    "HOOKDECK_SOURCE_NAME",
  ]);

  // Deleting up front is how a capture proves a file is new rather than
  // left over from a previous run. Keep the old contents in memory so a
  // topic that fails to arrive can be put back — otherwise one bad run
  // destroys a good sample that may not be recapturable on demand.
  const previous = new Map<string, string>();
  for (const topic of TOPICS) {
    const f = path.join(OUTPUT_DIR, `${topic}.json`);
    if (fs.existsSync(f)) {
      previous.set(topic, fs.readFileSync(f, "utf-8"));
      fs.unlinkSync(f);
    }
  }

  console.log("1/5 Refreshing Hookdeck CLI auth (--local)...");
  const ci = runHookdeck(
    [
      "ci",
      "--api-key",
      required.HOOKDECK_API_KEY,
      "--local",
      "--name",
      "scrapfly-capture",
    ],
    { capture: true }
  );
  if (ci.code !== 0) {
    console.error(ci.stderr || ci.stdout);
    process.exit(1);
  }

  const children: Partial<ChildHandles> = {};
  const cleanup = () => {
    for (const c of Object.values(children)) {
      if (c && !c.killed) c.kill("SIGTERM");
    }
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    console.log(`2/5 Starting receiver on port ${RECEIVER_PORT}...`);
    children.receiver = spawnLongRunning("node", [
      "./node_modules/.bin/ts-node",
      "requestReceiver.ts",
    ]);
    children.receiver.stdout?.on("data", (b) =>
      process.stdout.write(`[receiver] ${b}`)
    );
    children.receiver.stderr?.on("data", (b) =>
      process.stderr.write(`[receiver] ${b}`)
    );
    await waitForHttp(`http://localhost:${RECEIVER_PORT}/healthz`, 15_000).catch(
      () => {
        // receiver doesn't have /healthz — fall back to any 4xx/2xx response on root
      }
    );
    await waitForHttp(`http://localhost:${RECEIVER_PORT}/`, 15_000);

    console.log(
      `3/5 Starting hookdeck listen → :${RECEIVER_PORT}${RECEIVER_PATH}...`
    );
    children.listen = spawnLongRunning("hookdeck", [
      "listen",
      String(RECEIVER_PORT),
      required.HOOKDECK_SOURCE_NAME,
      "--path",
      RECEIVER_PATH,
      "--output",
      "compact",
    ]);
    children.listen.stdout?.on("data", (b) =>
      process.stdout.write(`[hookdeck] ${b}`)
    );
    children.listen.stderr?.on("data", (b) =>
      process.stderr.write(`[hookdeck] ${b}`)
    );
    await new Promise((r) => setTimeout(r, PROCESS_READY_DELAY_MS));

    console.log("4/5 Triggering Scrapfly API calls (extraction, scrape, crawl)...");
    const triggers = await Promise.allSettled([
      triggerExtraction(required),
      triggerScrape(required),
      triggerCrawl(required),
    ]);
    const triggerNames = ["extraction", "scrape", "crawl"];
    for (let i = 0; i < triggers.length; i++) {
      const t = triggers[i];
      const name = triggerNames[i];
      if (t.status === "rejected") {
        console.error(`   ${name}: ERROR — ${t.reason?.message ?? t.reason}`);
      } else {
        console.log(`   ${name}: queued (job ${t.value})`);
      }
    }

    console.log(
      `5/5 Waiting up to ${WEBHOOK_DELIVERY_TIMEOUT_MS / 1000}s for webhook deliveries...`
    );
    const results = await Promise.allSettled(
      TOPICS.map((topic) =>
        waitForFile(
          path.join(OUTPUT_DIR, `${topic}.json`),
          WEBHOOK_DELIVERY_TIMEOUT_MS
        ).then(() => topic)
      )
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const topic = TOPICS[i];
      if (r.status === "fulfilled") {
        console.log(`   ${topic}.json captured`);
        scrubFile(path.join(OUTPUT_DIR, `${topic}.json`));
      } else {
        console.error(`   ${topic}.json NOT captured (${r.reason?.message ?? r.reason})`);
        const prior = previous.get(topic);
        if (prior !== undefined) {
          fs.writeFileSync(path.join(OUTPUT_DIR, `${topic}.json`), prior);
          console.error(`   ${topic}.json restored from the previous capture`);
        }
      }
    }

    for (const topic of CONDITIONAL_CRAWLER_TOPICS) {
      const f = path.join(OUTPUT_DIR, `${topic}.json`);
      if (fs.existsSync(f)) {
        console.log(`   ${topic}.json present (conditional event)`);
        scrubFile(f);
      }
    }

    console.log("\nDone. Review files under providers/scrapfly/latest/ before committing.");
  } finally {
    cleanup();
  }
}

async function triggerExtraction(env: {
  SCRAPFLY_API_KEY: string;
  SCRAPFLY_WEBHOOK_NAME: string;
}): Promise<string> {
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

async function triggerScrape(env: {
  SCRAPFLY_API_KEY: string;
  SCRAPFLY_WEBHOOK_NAME: string;
}): Promise<string> {
  const url = new URL("https://api.scrapfly.io/scrape");
  url.searchParams.set("key", env.SCRAPFLY_API_KEY);
  url.searchParams.set("url", "https://web-scraping.dev/products");
  url.searchParams.set("webhook_name", env.SCRAPFLY_WEBHOOK_NAME);
  const res = await fetch(url.toString());
  return parseJobId(res, "scrape");
}

// The Crawler API is a fourth product on the same webhook, but its
// deliveries set X-Scrapfly-Webhook-Resource-Type to a constant
// `crawler` and carry the event name in X-Scrapfly-Crawl-Event-Name
// instead. That's why providers/scrapfly/index.json lists two
// topic_identifiers rather than one — without the crawl-event-name
// key first, every event below would land in a single crawler.json.
//
// webhook_events names every crawler event, since the default
// subscription covers only the four lifecycle ones. page_limit and
// max_depth keep the crawl small: the point is to produce one of each
// delivery, not to scrape the site.
async function triggerCrawl(env: {
  SCRAPFLY_API_KEY: string;
  SCRAPFLY_WEBHOOK_NAME: string;
}): Promise<string> {
  // Unlike /scrape and /extraction, the Crawler API takes its config as
  // a JSON body — only `key` goes in the query string. Passing the
  // config as query params returns HTTP 400 "Invalid JSON payload".
  const url = new URL("https://api.scrapfly.io/crawl");
  url.searchParams.set("key", env.SCRAPFLY_API_KEY);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: "https://web-scraping.dev/products",
      webhook_name: env.SCRAPFLY_WEBHOOK_NAME,
      webhook_events: CRAWLER_WEBHOOK_EVENTS,
      page_limit: 3,
      max_depth: 1,
    }),
  });
  return parseJobId(res, "crawl");
}

async function parseJobId(res: Response, label: string): Promise<string> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    const parsed = JSON.parse(text);
    // /scrape returns the job under context.job, /extraction and /crawl
    // return a flat job_uuid.
    return (
      parsed?.context?.job?.uuid ||
      parsed?.job_uuid ||
      parsed?.uuid ||
      "(unknown)"
    );
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
