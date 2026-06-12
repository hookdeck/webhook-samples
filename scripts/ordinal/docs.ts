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
// Re-runnable and deterministic. The result is docs-sourced (clearly
// labelled in providers/ordinal/README.md).

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DOCS_BASE = "https://docs.tryordinal.com";
const LLMS_INDEX = `${DOCS_BASE}/llms.txt`;
const OUTPUT_DIR = path.join(REPO_ROOT, "providers", "ordinal", "latest");

// The docs do not enumerate delivery headers, so these are a
// representative (not recorded) set.
const REPRESENTATIVE_HEADERS = {
  accept: "*/*",
  "content-type": "application/json",
  "user-agent": "Ordinal-Webhooks",
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

/** Discover every webhook event-schema page URL from the docs index. */
function discoverEventPages(llms: string): string[] {
  const urls = new Set<string>();
  const re = /https?:\/\/[^\s)]+\/integrations\/webhooks\/([a-z0-9-]+)\.md/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(llms)) !== null) {
    if (NON_EVENT_PAGES.has(m[1])) continue;
    urls.add(m[0]);
  }
  return Array.from(urls).sort();
}

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

function writeSample(topic: string, body: unknown): void {
  const file = path.join(OUTPUT_DIR, `${topic}.json`);
  const out = { headers: REPRESENTATIVE_HEADERS, body, topic };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
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
      const md = await fetchText(url);
      const body = extractExamplePayload(md, url);
      const topic = body?.type;
      if (typeof topic !== "string" || !topic) {
        throw new Error(`example payload has no string "type" (${url})`);
      }
      writeSample(topic, body);
      captured.push(topic);
      console.log(`   ${topic}.json`);
    } catch (e) {
      failures.push((e as Error).message);
      console.error(`   SKIP — ${(e as Error).message}`);
    }
  }

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
