# Plan: Scrapfly webhook samples

Drafted 2026-05-11. Updated 2026-05-15.

## Goal

Add Scrapfly webhook samples to `providers/scrapfly/latest/`, and ship
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
- [x] `yarn setup:scrapfly` run: Hookdeck source `scrapfly` is
      `type=SCRAPFLY` with HMAC verification enabled from the secret
      pasted out of the Scrapfly dashboard's Security tab.
- [x] `yarn capture:scrapfly` run: captured
      `providers/scrapfly/latest/scrape.json` and
      `providers/scrapfly/latest/extraction.json` from real
      deliveries.
- [ ] Screenshot is intentionally excluded — Scrapfly sends
      `Content-Type: application/json` with raw image bytes, which
      Hookdeck rejects as UNPARSABLE_JSON. No client-side workaround
      exists. See `providers/scrapfly/README.md` for the full
      diagnosis. Out-of-band: reported to Scrapfly so the JSON
      content-type setting may eventually be honoured (or sent
      honestly as `image/jpeg`).

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
