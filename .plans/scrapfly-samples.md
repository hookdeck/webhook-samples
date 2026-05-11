# Plan: Scrapfly webhook samples

Drafted 2026-05-11.

## Goal

Add Scrapfly webhook samples to `providers/scrapfly/latest/` covering
all three Scrapfly products (Extraction, Scrape, Screenshot), and ship
the tooling needed to refresh them automatically.

Working branch: `feat/scrapfly-may-2026`.

## Status

- [x] Provider config (`providers/scrapfly/index.json`) with
      `x-scrapfly-webhook-resource-type` as topic identifier.
- [x] Automated capture harness in `scripts/scrapfly/` (`setup.ts`,
      `capture.ts`, `lib.ts`, `.env.example`, `README.md`, `AGENTS.md`).
- [x] `yarn setup:scrapfly` and `yarn capture:scrapfly` wired into root
      `package.json`.
- [x] Hookdeck agent skills installed (`.agents/skills/`,
      `.claude/skills/`) — both gitignored; `skills-lock.json` committed.
- [x] `yarn setup:scrapfly` run once: Hookdeck source `scrapfly` upserted
      in the configured project; CLI authed via
      `hookdeck ci --local` (`.hookdeck/config.toml` gitignored).
- [ ] **BLOCKED — Scrapfly paid tier required.** Webhooks are not
      available on the Scrapfly free tier; the feature unlocks on the
      first paid tier. Support ticket open as of 2026-05-11 asking
      whether they will enable webhooks for the testing context;
      otherwise an upgrade is required before the Scrapfly dashboard
      will let us register the `samples-capture` webhook against the
      Hookdeck source URL.
- [ ] Once unblocked: register the webhook in the Scrapfly dashboard,
      then run `yarn capture:scrapfly` to produce
      `providers/scrapfly/latest/{scrape,extraction,screenshot}.json`.
- [ ] Review captured files (project IDs, log URLs, signature secrets)
      and commit.

## Why the capture is two-script

Scrapfly does **not** expose an API for webhook URL registration. The
destination URL must be entered in their dashboard by a human, once.
That one-time step is what `setup.ts` prompts for; everything after
that (`capture.ts`) is fully automated.

The natural stable destination URL for our case is a Hookdeck Source
URL — same Hookdeck project, same source name across runs. `hookdeck
listen` is then used as a CLI destination so events are tunneled to
the local `requestReceiver.ts`. No ngrok needed.

## What was deliberately ruled out

- **Reverse-engineering the Scrapfly dashboard's internal webhook
  API** — fragile, likely against ToS.
- **Hand-crafted samples from docs alone** — Scrapfly only documents
  fragments of the payload; real captures are needed.
- **ngrok / cloudflared tunnel** — Hookdeck source URL is already a
  stable public URL, so a second tunnel layer is redundant.

## Related (separate work)

There's a pending admin task to flip the GitHub default branch from
`master` to `main` (a `main` ref has already been created at the same
SHA as `master`). That's a repo-settings change, not a code change,
and is independent of this Scrapfly work. Track separately.
