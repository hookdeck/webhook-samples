# Scrapfly sample capture

Automation for refreshing the Scrapfly webhook samples in
`providers/scrapfly/latest/` by issuing real Scrapfly API calls and
recording the deliveries via a Hookdeck source + local receiver.

## How it works

```
Scrapfly  ──▶  Hookdeck source URL (registered manually, once)
                │
                ▼
         hookdeck listen (CLI destination tunneled to localhost)
                │
                ▼
         requestReceiver.ts on :9001  ──▶  providers/scrapfly/latest/*.json
```

Scrapfly does not expose an API to register webhook URLs, so the
destination URL has to be entered in their dashboard by hand the first
time. After that, the Hookdeck source URL is stable, so subsequent
captures are fully automated.

## Prerequisites

- **Scrapfly paid tier.** Webhooks are not available on the free tier;
  the feature unlocks on the first paid plan. Without it, the Scrapfly
  dashboard does not expose the webhook UI.
- **Hookdeck account + project.** Any tier; you need a project API key
  from <https://dashboard.hookdeck.com/settings/project/secrets>.
- **Hookdeck CLI.** <https://hookdeck.com/docs/cli>

## One-time setup

1. Install the Hookdeck CLI: <https://hookdeck.com/docs/cli>
2. Copy the env template and fill it in:
   ```sh
   cp scripts/scrapfly/.env.example scripts/scrapfly/.env.local
   # Edit it — at minimum, set HOOKDECK_API_KEY and SCRAPFLY_API_KEY
   ```
   `.env.local` is read from either `scripts/scrapfly/.env.local`
   (preferred — co-located with the only script that reads it) or
   `<repo-root>/.env.local` (fallback). Both are gitignored.
   `HOOKDECK_API_KEY` is the project API key from
   <https://dashboard.hookdeck.com/settings/project/secrets>. The Hookdeck
   project used for these captures is shared per-team — coordinate before
   creating a new one.
3. Run the setup script:
   ```sh
   yarn setup:scrapfly
   ```
   It will:
   - Authenticate the CLI in CI mode (`hookdeck ci --local`), writing
     `.hookdeck/config.toml` (gitignored).
   - Upsert the `scrapfly` Hookdeck source idempotently.
   - Print the source URL.
   - Pause and ask you to register a webhook named `samples-capture` in
     <https://scrapfly.io/dashboard/webhook> pointing at that URL.

## Capture

```sh
yarn capture:scrapfly
```

This starts `requestReceiver.ts` and `hookdeck listen` as child
processes, fires one Scrapfly API call per product (extraction, scrape,
screenshot) with `webhook_name=samples-capture`, then waits for the
deliveries to land at `providers/scrapfly/latest/{scrape,extraction,
screenshot}.json`. A small scrub pass replaces obvious secret fields
(`secret`, `api_key`, HMAC signature headers) with `REDACTED`.

Review the captured files before committing — webhook payloads
occasionally surface account-specific data (project IDs, log URLs) that
should be replaced with placeholders.

## Files

- `setup.ts` — one-time setup (auth + source upsert + manual prompt)
- `capture.ts` — fully automated capture run
- `lib.ts` — shared env loading, CLI shelling, child-process and poll
  helpers
- `.env.example` — env template (copy to `.env.local` in repo root)
- `AGENTS.md` — context for agents (Claude Code, etc.) working in this
  directory

## Gotchas

- Each capture spends ~3 Scrapfly credits (one per product). A
  test-tier key works.
- `hookdeck listen` uses a CLI destination, not an HTTP destination —
  the tunnel is owned by the running process and disappears when the
  capture script ends. The source itself persists.
- The webhook name in `.env.local` (`SCRAPFLY_WEBHOOK_NAME`) **must
  match** the name registered in the Scrapfly dashboard. Changing it on
  one side without the other will silently send events to the wrong
  webhook (or none).
