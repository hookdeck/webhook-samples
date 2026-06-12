// Generate providers/ordinal/latest/<type>.json from Ordinal's published
// webhook documentation.
//
// Ordinal has no test-event trigger and ~20 event types, most of which
// can't be driven through the API unattended (OAuth connects, real
// publishes, approver/invitee actions). Rather than hand-transcribe
// payloads, this script scrapes Ordinal's docs: every event page ships
// one canonical example payload in a ```json fence. We discover the event
// pages from the docs index (llms.txt), extract each example, and write
// it in this repo's { headers, body, topic } shape.
//
// Re-runnable and deterministic. The result is docs-sourced (clearly
// labelled in providers/ordinal/README.md), and `yarn capture:ordinal`
// can later overwrite the API-triggerable subset with real deliveries.

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT } from "./lib";
import { ALL_TOPICS } from "./events";

const DOCS_BASE = "https://docs.tryordinal.com";
const LLMS_INDEX = `${DOCS_BASE}/llms.txt`;
const OUTPUT_DIR = path.join(REPO_ROOT, "providers", "ordinal", "latest");

// The docs do not enumerate delivery headers, so these are a
// representative (not recorded) set. Real captures replace them.
const REPRESENTATIVE_HEADERS = {
  accept: "*/*",
  "content-type": "application/json",
  "user-agent": "Ordinal-Webhooks",
};

// Pages under integrations/webhooks/ that are not event schemas.
const NON_EVENT_PAGES = new Set(["introduction", "event-types"]);

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

  console.log(`3/3 Reconciling against the known taxonomy...`);
  const known = new Set<string>(ALL_TOPICS as readonly string[]);
  const capturedSet = new Set(captured);
  const unexpected = captured.filter((t) => !known.has(t));
  const missing = Array.from(known).filter((t) => !capturedSet.has(t));
  if (unexpected.length) {
    console.log(
      `   New events not yet in events.ts ALL_TOPICS: ${unexpected.join(", ")}`
    );
  }
  if (missing.length) {
    console.log(
      `   Known events with no docs example captured: ${missing.join(", ")}`
    );
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
