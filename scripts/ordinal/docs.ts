// Generate providers/ordinal/latest/<type>.json from Ordinal's published
// webhook documentation.
//
// Ordinal has ~20 event types and no test-event trigger, and most events
// (OAuth connects, real publishes, approver/invitee actions) can't be
// driven through an API unattended — so there is no practical way to
// capture live deliveries for the full set. Instead we scrape Ordinal's
// docs: every event page ships one canonical example payload in a ```json
// fence. We discover the event pages from the docs index (llms.txt),
// extract each example, and write it in this repo's
// { headers, body, topic } shape.
//
// Re-runnable and deterministic. The result is docs-sourced, and every file
// says so itself: it carries a `source` block naming the page its body was
// read from and the date it was read, the marking this repo's README gives
// doc-sourced samples. index.json records the same fact one level up, as
// `provenance.latest.sourced_via: "docs"`.

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DOCS_BASE = "https://docs.tryordinal.com";
const LLMS_INDEX = `${DOCS_BASE}/llms.txt`;
const PROVIDER_DIR = path.join(REPO_ROOT, "providers", "ordinal");
const VERSION = "latest";
const OUTPUT_DIR = path.join(PROVIDER_DIR, VERSION);

// The date this run read the docs, stamped into each file's `source`.
const RETRIEVED = new Date().toISOString().slice(0, 10);

// A doc page gives a body, never a delivery, so the only header written is
// the one the docs state: "The request body is JSON"
// (https://docs.tryordinal.com/integrations/webhooks/introduction).
// Ordinal documents no vendor-set delivery header at all (no User-Agent, no
// event-type header, no delivery id, no signature), so none is written. An
// invented `user-agent` / `accept` pair is worse than none: it is what makes
// a hand-written fixture look like a capture.
const HEADERS = {
  "content-type": "application/json",
};

// Pages under integrations/webhooks/ that are not event schemas.
const NON_EVENT_PAGES = new Set(["introduction", "event-types"]);

// The event taxonomy we expect the docs to publish, as of the last review
// (https://docs.tryordinal.com/integrations/webhooks/event-types). Used
// only as a safety net: the generator warns if the docs add or drop an
// event so a human can react. The docs remain the source of truth.
const EXPECTED_TOPICS = [
  "social_profile.connected",
  "social_profile.disconnected",
  "social_profile.reconnect_needed",
  "post.created",
  "post.scheduled",
  "post.rescheduled",
  "post.unscheduled",
  "post.published",
  "post.publish_failed",
  "post.archived",
  "post.permanently_deleted",
  "post.content.edited",
  "post.comment.created",
  "post.inline_comment.created",
  "post.approval.requested",
  "post.approval.approved",
  "campaign.approval.requested",
  "campaign.approval.approved",
  "invite.created",
  "invite.accepted",
];

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.text();
}

/**
 * Discover every webhook event-schema page URL from the docs index.
 *
 * Returns the human page URL (no `.md`). The index has listed pages both
 * with and without the `.md` suffix; the markdown is fetched from
 * `<page>.md` either way (see markdownUrl), and the page URL is what the
 * sample's `source.url` cites.
 */
function discoverEventPages(llms: string): string[] {
  const urls = new Set<string>();
  const re =
    /(https?:\/\/[^\s)]+\/integrations\/webhooks\/([a-z0-9-]+))(?:\.md)?(?=[\s)]|$)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(llms)) !== null) {
    if (NON_EVENT_PAGES.has(m[2])) continue;
    urls.add(m[1]);
  }
  return Array.from(urls).sort();
}

const markdownUrl = (pageUrl: string): string => `${pageUrl}.md`;

/** Extract the single ```json example payload from a docs page. */
function extractExamplePayload(markdown: string, sourceUrl: string): any {
  const match = markdown.match(/```json[^\n]*\n([\s\S]*?)```/);
  if (!match) {
    throw new Error(`no \`\`\`json example block found in ${sourceUrl}`);
  }
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    throw new Error(
      `failed to parse JSON example in ${sourceUrl}: ${(e as Error).message}`
    );
  }
}

function writeSample(topic: string, body: unknown, pageUrl: string): void {
  const file = path.join(OUTPUT_DIR, `${topic}.json`);
  const out = {
    headers: HEADERS,
    body,
    topic,
    source: {
      type: "vendor-documentation",
      url: pageUrl,
      retrieved: RETRIEVED,
    },
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}

/**
 * Record `provenance.latest` in index.json. `sourced_on` is the OLDEST
 * `retrieved` date across the version's files, so a partial re-run (a page
 * that failed keeps its earlier file) can never overstate freshness.
 */
function writeProvenance(): void {
  const indexFile = path.join(PROVIDER_DIR, "index.json");
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  const dates = fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), "utf8"));
      if (!d.source?.retrieved) {
        throw new Error(`${f} has no source.retrieved — regenerate it`);
      }
      return d.source.retrieved as string;
    })
    .sort();
  index.provenance = {
    ...(index.provenance || {}),
    [VERSION]: { sourced_via: "docs", sourced_on: dates[0] },
  };
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n");
}

async function main() {
  console.log("Ordinal docs → samples\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`1/3 Discovering event pages from ${LLMS_INDEX}...`);
  const pages = discoverEventPages(await fetchText(LLMS_INDEX));
  if (pages.length === 0) {
    throw new Error("no webhook event pages discovered from llms.txt");
  }
  console.log(`   Found ${pages.length} event pages.`);

  console.log(`2/3 Fetching and extracting example payloads...`);
  const captured: string[] = [];
  const failures: string[] = [];
  for (const url of pages) {
    try {
      const md = await fetchText(markdownUrl(url));
      const body = extractExamplePayload(md, url);
      const topic = body?.type;
      if (typeof topic !== "string" || !topic) {
        throw new Error(`example payload has no string "type" (${url})`);
      }
      writeSample(topic, body, url);
      captured.push(topic);
      console.log(`   ${topic}.json`);
    } catch (e) {
      failures.push((e as Error).message);
      console.error(`   SKIP — ${(e as Error).message}`);
    }
  }

  writeProvenance();

  console.log(`3/3 Reconciling against the expected taxonomy...`);
  const expected = new Set(EXPECTED_TOPICS);
  const capturedSet = new Set(captured);
  const unexpected = captured.filter((t) => !expected.has(t));
  const missing = EXPECTED_TOPICS.filter((t) => !capturedSet.has(t));
  if (unexpected.length) {
    console.log(
      `   New events the docs added (update EXPECTED_TOPICS): ${unexpected.join(
        ", "
      )}`
    );
  }
  if (missing.length) {
    console.log(
      `   Expected events with no docs example captured: ${missing.join(", ")}`
    );
  }
  if (!unexpected.length && !missing.length) {
    console.log(`   All ${EXPECTED_TOPICS.length} expected events present.`);
  }

  console.log(
    `\nDone. ${captured.length} payload(s) written to ${path.relative(
      REPO_ROOT,
      OUTPUT_DIR
    )}/.` + (failures.length ? ` ${failures.length} skipped.` : "")
  );
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
