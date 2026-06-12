# Ordinal sample capture

Automation for producing the Ordinal webhook samples in
`providers/ordinal/latest/`. There are two paths:

1. **`yarn generate:ordinal` (primary, no credentials).** Scrapes
   Ordinal's [documentation](https://docs.tryordinal.com/integrations/webhooks/introduction)
   and writes a payload for every event from the canonical example each
   docs page publishes. Ordinal has ~20 event types and no test-event
   trigger, so this is how the full set is kept current.
2. **`yarn setup:ordinal` + `yarn capture:ordinal` (optional, live).**
   Drives the real [Ordinal API](https://docs.tryordinal.com) and records
   the actual deliveries through a Hookdeck source + the repo's receiver,
   overwriting the API-triggerable subset with genuine captures.

The capture path is built on the shared, provider-agnostic harness in
[`scripts/lib/`](../lib/) — this directory is just Ordinal-specific config
(env shape, API client, event triggers, docs generator) plus thin drivers.

## Generate from docs (no credentials)

```sh
yarn generate:ordinal
```

`docs.ts` fetches the docs index (`llms.txt`), discovers every
`integrations/webhooks/<event>` page, extracts the single ```` ```json ````
example payload from each, and writes
`providers/ordinal/latest/<type>.json`. It reconciles the discovered
events against `events.ts` `ALL_TOPICS` and warns if the docs add or drop
any. Deterministic and re-runnable. The output is docs-sourced (see
[`../../providers/ordinal/README.md`](../../providers/ordinal/README.md)).

## How it works

```
Ordinal API  ──▶  emits webhook  ──▶  Hookdeck source URL (set via API by setup)
                                            │
                                            ▼
                                   hookdeck listen (CLI tunnel → localhost)
                                            │
                                            ▼
                          requestReceiver.ts on :9001  ──▶  providers/ordinal/latest/<type>.json
```

Unlike Scrapfly, Ordinal exposes a webhook-management API, so `setup`
registers the destination URL programmatically — no dashboard step.

## Prerequisites

- **Ordinal account, Pro plan or higher.** API keys require Pro; create
  one at <https://app.tryordinal.com/settings/integrations/api> (format
  `ord_…`). The key is workspace-scoped.
- **Hookdeck account + project.** A project API key from
  <https://dashboard.hookdeck.com/settings/project/secrets>.
- **Hookdeck CLI.** <https://hookdeck.com/docs/cli>

## One-time setup

1. Install the Hookdeck CLI.
2. Copy the env template and fill it in:
   ```sh
   cp scripts/ordinal/.env.example scripts/ordinal/.env.local
   # Set at least HOOKDECK_API_KEY and ORDINAL_API_KEY
   ```
   `.env.local` is read from `scripts/ordinal/.env.local` (preferred) or
   `<repo-root>/.env.local` (fallback). Both are gitignored.
3. Run setup:
   ```sh
   yarn setup:ordinal
   ```
   It will:
   - Authenticate the CLI in CI mode (`hookdeck ci --local`).
   - Upsert the `ordinal` Hookdeck source (generic `WEBHOOK` type —
     Ordinal has no documented signature scheme).
   - Upsert an Ordinal webhook named `samples-capture` pointing at the
     source URL, subscribed to **all** documented topics, and record its
     id in `.env.local`.

   Idempotent: re-running reuses the existing source and updates the
   existing Ordinal webhook (matched by name) in place.

## Capture

```sh
yarn capture:ordinal
```

Starts `requestReceiver.ts` and `hookdeck listen`, then drives the Ordinal
API to emit the **live-capturable** events and waits for each delivery to
land at `providers/ordinal/latest/<type>.json`.

Captured live (each on a throwaway post/invite):

- `post.created`, `post.scheduled`, `post.rescheduled`,
  `post.unscheduled`, `post.archived`
- `invite.created`

Everything else (social-profile connects, publishes, comments, approval
grants, invite acceptances, …) needs a human/OAuth side channel and keeps
its docs-sourced payload — the capture loop only clears and rewrites the
files for the triggers it runs, so the other payloads are left intact.
Triggers are best-effort: any that fail (e.g. scheduling on a workspace
with no connected channel) simply leave the existing payload untouched.

**Self-cleaning.** Each capture records the posts/invites it creates and
tears them down afterwards (posts archived to trash — Ordinal has no API
permanent-delete; invites deleted), so repeated runs don't pile up test
data in the workspace. Cleanup is best-effort and never masks the capture
result; anything it can't remove is logged for manual deletion.

See [`../../providers/ordinal/README.md`](../../providers/ordinal/README.md)
for the per-event provenance table.

> **Review before committing.** Real captures contain your test
> workspace's slug, member emails, and post URLs. Check the diff and
> replace anything you don't want published.

## Files

- `docs.ts` — docs scraper / payload generator (`yarn generate:ordinal`)
- `setup.ts` — one-time setup (Hookdeck auth + source + Ordinal webhook)
- `capture.ts` — capture driver (builds triggers, calls the shared runner)
- `ordinal.ts` — minimal Ordinal REST client (webhooks, posts, invites)
- `events.ts` — the 20-event taxonomy + the triggerable subset
- `lib.ts` — Ordinal env accessor; re-exports `scripts/lib`
- `.env.example` — env template
- `AGENTS.md` — context for agents working in this directory

## Gotchas

- The Ordinal webhook `ORDINAL_WEBHOOK_NAME` in `.env.local` **must
  match** the subscription name; setup matches on it for idempotent
  updates. Renaming one side orphans the other.
- `hookdeck listen` uses a CLI destination tunnel owned by the running
  process; it disappears when capture ends. The source persists.
- Scheduling-related triggers may require the workspace to have at least
  one connected channel. If they fail, the seeded payload stays in place.
