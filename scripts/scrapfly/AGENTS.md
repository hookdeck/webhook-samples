# AGENTS — scripts/scrapfly

Context for AI agents (Claude Code, Cursor, etc.) working in this
directory. Read this before touching the scripts.

## What this directory is

A two-script harness that refreshes the JSON files in
`providers/scrapfly/latest/` by triggering real Scrapfly API calls and
recording the resulting webhook deliveries via Hookdeck + the local
`requestReceiver.ts`.

Producing those JSON files is the whole point. The receiver
(`requestReceiver.ts` at repo root) is what writes them — the scripts
here just orchestrate the surrounding plumbing (auth, source, tunnel,
trigger, scrub).

## Architecture, in one paragraph

Scrapfly does not have a webhook management API. The destination URL
must be set in their dashboard once by a human. We pick a stable URL
that we control — a Hookdeck source URL — and use `hookdeck listen` to
tunnel deliveries from that source to `localhost:9001`. The receiver
auto-persists each delivery into the matching provider directory,
keyed by `x-scrapfly-webhook-resource-type` (see
`providers/scrapfly/index.json`).

## Conventions to preserve

- **Idempotency.** `setup.ts` is safe to re-run; it uses
  `hookdeck gateway source upsert` and `hookdeck ci --local`. Don't
  introduce `create`-style commands that fail on existing resources.
- **Two-pass upsert in setup.** The first pass upserts the source as
  `--type WEBHOOK` so the URL is available before the user has
  configured Scrapfly. The second pass re-upserts as `--type SCRAPFLY
  --webhook-secret <secret>` after the user pastes the signing secret
  from the dashboard. This split exists because Scrapfly's signing
  secret only appears in the dashboard *after* the webhook is created
  there with a destination URL — there's no chicken/egg-free path.
- **Hidden secret input.** `promptHidden` in `lib.ts` masks the
  pasted signing secret (no terminal echo). If you need to prompt for
  another secret in the future, reuse it; don't add a fresh raw-mode
  reader.
- **No new runtime deps.** Both scripts use Node built-ins only
  (`fs`, `path`, `child_process`, `readline`, global `fetch`). The
  repo's root `ts-node` runs them. Adding dependencies here means
  adding them to the root `package.json` — avoid unless necessary.
- **CLI in CI mode, local config.** `hookdeck ci --api-key … --local`
  writes credentials to `.hookdeck/config.toml` inside the repo. This
  keeps the captures isolated from any global `hookdeck login` the
  developer may have. `.hookdeck/` is gitignored.
- **Env in `.env.local`.** `lib.ts:loadEnv` checks
  `scripts/scrapfly/.env.local` first (preferred — co-located with the
  only script that reads it), then falls back to
  `<repo-root>/.env.local`. The `.env.example` template lives in this
  directory.
- **Minimal scrub.** `scrubInPlace` in `capture.ts` only redacts
  fields named `secret`, `api_key`, and the two HMAC signature
  headers. Other providers in this repo keep their captured payloads
  as-is — don't over-scrub.

## What not to do

- **Don't try to programmatically register the Scrapfly webhook URL.**
  Their API doesn't support it; reverse-engineering the dashboard is
  fragile and likely against ToS. The one-time human step is a
  feature, not a bug.
- **Don't add ngrok/cloudflared.** The Hookdeck source URL is already
  a stable public URL; introducing another tunnel layer is wasted
  complexity.
- **Don't use `hookdeck listen` to implicitly create the source.** It
  can, but we want the source creation to be explicit and visible in
  `setup.ts` so a Terraform/migration-style audit of resources is
  possible.
- **Don't commit `.env.local`, `.hookdeck/`, or `.agents/`.** All
  three are gitignored.

## When you change `capture.ts`

If you add or remove a Scrapfly product trigger, also update:
- `TOPICS` constant at the top of `capture.ts`
- The expected output files listed in `../../providers/scrapfly/latest/`
- This file and `README.md`

If a future Scrapfly API change emits a new sensitive field, extend
`scrubInPlace`. Don't replace it with a third-party scrubber — the
list of sensitive keys is short and reviewable.

## Related files outside this directory

- `requestReceiver.ts` (repo root) — the HTTP receiver. Hookdeck
  forwards events to it via `hookdeck listen … --path /scrapfly/latest`.
- `providers/scrapfly/index.json` — `topic_identifier` config that
  tells the receiver to use the resource-type header for the filename.
- `.plans/scrapfly-samples.md` — original planning notes. May be
  out of date once this dir is in place; prefer reading the scripts
  and this file.
