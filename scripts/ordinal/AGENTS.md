# AGENTS — scripts/ordinal

Context for AI agents (Claude Code, Cursor, etc.) working in this
directory. Read this before touching the script.

## What this directory is

A single script, `docs.ts`, that generates `providers/ordinal/latest/`
from Ordinal's published webhook documentation (`yarn generate:ordinal`).

Ordinal has ~20 event types and no test-event trigger, and most events
can't be driven through the API unattended (OAuth connects, real
publishes, approver/invitee actions, the debounced in-app editor). So
rather than live-capture, we scrape the docs: every event page ships one
canonical example payload in a ```` ```json ```` fence. `docs.ts`
discovers the pages from the docs index (`llms.txt`), extracts each
example, derives the topic from the payload's own `type`, and writes
`<type>.json` in the repo's `{ headers, body, topic }` shape.

## Conventions to preserve

- **Docs are the source of truth.** Don't hand-edit payloads under
  `providers/ordinal/latest/` — change them by re-running the generator so
  they stay faithful to Ordinal's published examples. If you need a
  different value, fix it upstream or in the generator, not in the output.
- **Fail loudly.** If a page has no parseable ```` ```json ```` block or no
  string `type`, `docs.ts` exits non-zero rather than writing a wrong
  payload. Keep that behavior — a silently-wrong sample is worse than a
  visible failure.
- **`EXPECTED_TOPICS` is a safety net, not the source.** It exists so the
  generator can warn when the docs add/drop an event. The actual set
  written is whatever the docs publish. Keep `EXPECTED_TOPICS` in sync when
  the docs change.
- **Representative headers.** The docs don't enumerate delivery headers, so
  `REPRESENTATIVE_HEADERS` is a small honest stand-in. Don't fabricate
  signature/HMAC headers — Ordinal documents no signing scheme.
- **No runtime deps.** Node built-ins + global `fetch`, run by the repo's
  root `ts-node`. The repo's `ts-node` target rejects iterating/spreading a
  `Set` — use `Array.from(...)` rather than `[...set]`.

## Related files outside this directory

- `providers/ordinal/index.json` — `topic_identifier: "type"`, which is
  why each sample is filed by its `body.type`.
- `providers/ordinal/README.md` — event taxonomy + provenance.
