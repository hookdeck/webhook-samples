# AGENTS — scripts/ordinal

Context for AI agents (Claude Code, Cursor, etc.) working in this
directory. Read this before touching the scripts.

## What this directory is

The Ordinal half of the webhook-samples capture harness. It refreshes the
JSON files in `providers/ordinal/latest/` by driving the Ordinal REST API
and recording the resulting webhook deliveries via Hookdeck + the repo's
`requestReceiver.ts`.

The shared, provider-agnostic machinery lives in `scripts/lib/` — env
loading, prompts, CLI shelling, the Hookdeck source upsert, and the
capture loop (`runCapture`). This directory only holds what's specific to
Ordinal:

- `lib.ts` — Ordinal env accessor (`createEnv(...)`) + re-export of `../lib`
- `ordinal.ts` — typed REST client
- `events.ts` — the event taxonomy and the triggerable subset
- `setup.ts` / `capture.ts` — thin drivers

When you add the next provider, copy this shape; do **not** fork
`scripts/lib/`.

## Conventions to preserve

- **Idempotency.** `setup.ts` uses `hookdeck ci --local`, `hookdeck
  gateway source upsert`, and `OrdinalClient.upsertWebhook` (list →
  match-by-name → PATCH or POST). Don't introduce `create`-only calls
  that fail on re-run.
- **No signature scheme.** Ordinal doesn't document one, so the Hookdeck
  source is a generic `WEBHOOK` type. Don't invent an HMAC step. If
  Ordinal adds signing later, switch the source type and verify like
  Scrapfly does.
- **Docs-sourced vs live.** Only the events in `TRIGGERABLE_TOPICS`
  (events.ts) are driven by `capture:ordinal`. The other ~14 are seeded
  from Ordinal's documented example payloads and labelled as such in
  `providers/ordinal/README.md`. If you make a new event triggerable, add
  a trigger in `buildTriggers`, add it to `TRIGGERABLE_TOPICS`, and update
  both READMEs' provenance tables.
- **Capture only clears what it captures.** `runCapture` deletes/rewrites
  only the files named by its triggers, so docs-sourced payloads survive
  an incremental capture. Keep it that way — don't bulk-delete
  `providers/ordinal/latest/`.
- **No new runtime deps.** Node built-ins + global `fetch` only, run by
  the repo's root `ts-node`.
- **Env in `.env.local`.** `lib.ts` checks `scripts/ordinal/.env.local`
  first, then `<repo-root>/.env.local`. Both gitignored.

## What not to do

- **Don't fabricate "real" captures.** If an event can't be triggered via
  the API, leave it docs-sourced and labelled. Never hand-edit a payload
  and present it as a live capture.
- **Don't over-scrub.** Ordinal payloads have no signature headers. Real
  captures from a test workspace carry that workspace's slug and member
  emails — review them by hand before committing rather than adding a
  broad auto-redactor.
- **Don't commit `.env.local`, `.hookdeck/`, or `.agents/`.**

## Related files outside this directory

- `scripts/lib/` — the shared harness (env, prompt, process, hookdeck,
  capture). Generalize here, not in a provider dir.
- `requestReceiver.ts` (repo root) — HTTP receiver; Hookdeck forwards to
  it via `hookdeck listen … --path /ordinal/latest`.
- `providers/ordinal/index.json` — `topic_identifier: "type"` tells the
  receiver to name files from the body's `type` field.
