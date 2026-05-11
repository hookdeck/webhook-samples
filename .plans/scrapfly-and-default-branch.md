# Plan: Default branch rename + Scrapfly webhook samples

Drafted 2026-05-11. Pick up from here in a fresh terminal session — everything you need to know is in this file.

## Context

Repo: `hookdeck/webhook-samples` (samples consumed by Hookdeck Console "Example Webhooks" and the `samples.hookdeck.com` Vercel deployment).

Goals from the user:
1. Ensure the local checkout is up to date with `origin`.
2. Make `main` the default branch on GitHub, keeping `master` around for now because Hookdeck Console and `samples.hookdeck.com` may still reference it.
3. Add Scrapfly webhook samples.

## Status snapshot

- Local `master` is at `84a3957` and matches `origin/master`. Nothing to pull.
- `main` ref has already been created on GitHub at `84a3957` (same SHA as `master`) via the GitHub API. Confirm with `git fetch origin && git branch -r`.
- Working branch for code changes: `claude/update-default-branch-43Cww` (already checked out). Push there; do NOT push to `master` or `main` directly.

## Task 1 — Default branch flip (admin actions, not code)

These cannot be done from code; they need someone with repo-admin rights in the GitHub UI:

1. **Settings → General → Default branch**: switch from `master` to `main`.
2. **Settings → Branches**: `master` is currently `protected`. Add an equivalent protection rule to `main`. Keep `master`'s protection in place — Console and `samples.hookdeck.com` may still read from it.
3. After flipping, anyone with a local clone should run:
   ```
   git fetch origin
   git remote set-head origin -a
   git branch -m master main   # optional, only if they want to rename locally
   git branch -u origin/main main
   ```

## Task 2 — Optional: auto-sync `main` → `master`

The user asked whether we should mirror new commits on `main` back to `master` until `master` can be retired. If yes, add `.github/workflows/sync-master.yml`:

```yaml
name: Sync master with main
on:
  push:
    branches: [main]
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git push origin main:master
```

Caveats: `master` is currently branch-protected, so the workflow's push will be rejected unless either (a) protection allows the `github-actions` bot, or (b) you use a PAT/Deploy Key with bypass. Confirm with the user before adding.

**Do not add this workflow without explicit user approval** — they said "say the word" and haven't yet.

## Task 3 — Scrapfly webhook samples

### What we learned from the docs

- Docs entry points: `scrapfly.io/docs/extraction-api/webhook`, `…/scrape-api/webhook`, `…/screenshot-api/webhook`.
- Webhook payloads **contain the full scraped/extracted/screenshot result inline** — they are not "completion notifications." Body shape is "the same as the regular API response, plus webhook information in `context.webhook` and `context.job`."
- A single webhook URL receives deliveries from all three Scrapfly products, distinguished by header.
- Headers Scrapfly sends:
  - `X-Scrapfly-Webhook-Signature` — HMAC-SHA256, uppercase hex
  - `X-Scrapfly-Webhook-Signature-Lowercase` — same value, lowercase
  - `X-Scrapfly-Webhook-Job-Id`
  - `X-Scrapfly-Webhook-Resource-Type` — `scrape` | `extraction` | `screenshot`
  - `X-Scrapfly-Webhook-Env` — `test` | `live`
  - `X-Scrapfly-Webhook-Project`
  - `X-Scrapfly-Webhook-Name`
  - `X-Scrapfly-Webhook-Id`
  - `X-Scrapfly-Log-Uuid`, `X-Scrapfly-Log-Url` (when available)
- Retry schedule: 30s → 1min → 5min → 30min → 1h → 1d. Webhook disabled after 100 consecutive failures.
- The docs only show a fragment of the payload (`context.webhook` + `context.job`); a full real-world body must be obtained by live capture, not copy-pasted from docs.

### Design decision: one provider, three topics

User confirmed the structural question by asking whether the three could be bundled as event types. They should be **a single `scrapfly` provider** because Scrapfly itself treats them as one webhook system distinguished by `X-Scrapfly-Webhook-Resource-Type`. This matches the existing repo pattern (cf. Shopify topics, Stripe `type`).

Create:

```
providers/scrapfly/
  index.json
  latest/
    scrape.json
    extraction.json
    screenshot.json
```

`providers/scrapfly/index.json`:
```json
{
  "label": "Scrapfly",
  "configs": {
    "latest_version": "latest",
    "topic_identifier": "x-scrapfly-webhook-resource-type"
  }
}
```

Each topic file follows the same shape as existing providers (`providers/stripe/2022-11-15/customer.created.json` is a good reference): top-level `headers` and `body` objects.

### How to capture real payloads (live capture)

The user picked the live-capture path. Steps:

1. Get a Scrapfly API key from the user (test environment is fine; each capture costs ~1 credit on whichever product).
2. Install deps and run the receiver locally:
   ```
   yarn install
   yarn dev:receiver
   ```
   Receiver listens on `http://localhost:9001/:provider/:version`. For Scrapfly we'd use `http://localhost:9001/scrapfly/latest`. Confirm this by reading `requestReceiver.ts` — incoming requests are auto-persisted to the matching provider directory.
3. Expose the receiver to the public internet (Scrapfly cannot reach `localhost`). Either:
   - User runs `ngrok http 9001` (or `cloudflared tunnel`, etc.) on their machine, or
   - User has an existing Hookdeck source they can point at the local receiver.
4. Register the public URL as a Scrapfly webhook in their dashboard (or pass `webhook_name=…` on API calls that point to that webhook).
5. Trigger one API call per product:
   - **Extraction**: `curl -X POST "https://api.scrapfly.io/extraction?key=$KEY&url=https%3A%2F%2Fweb-scraping.dev&extraction_prompt=Extract%20the%20product%20specification%20in%20json%20format&webhook_name=$NAME" -H "content-type: text/html" -d @product.html`
   - **Scrape**: `curl "https://api.scrapfly.io/scrape?key=$KEY&url=https%3A%2F%2Fweb-scraping.dev&webhook_name=$NAME"`
   - **Screenshot**: `curl "https://api.scrapfly.io/screenshot?key=$KEY&url=https%3A%2F%2Fweb-scraping.dev&webhook_name=$NAME"`
6. Each delivery should land in `providers/scrapfly/latest/<resource-type>.json`. Verify the filename matches the topic identifier rule — receiver pulls the topic from `topic_identifier`, which here is the header `x-scrapfly-webhook-resource-type`.
7. Sanity-check the captured files: scrub any account-identifying fields (`webhook.secret`, `project`, real `log_url`s), but keep header structure intact — Console renders these as illustrative payloads. Look at how other providers handle secrets (Stripe's signature stays, but it's not tied to a real key anymore).
8. Commit on `claude/update-default-branch-43Cww` and push with `-u origin claude/update-default-branch-43Cww`.

### Fallback: hand-crafted samples

If the user can't supply a key in this session, hand-craft `extraction.json`, `scrape.json`, and `screenshot.json` by combining:
- The base response shapes from each product's "getting started" page (extraction: `{content_type, data}`; scrape: `{result, config, context}`; screenshot: response includes `job_uuid`, `log_uuid`, `log_url` plus image-related metadata).
- The webhook envelope: add `context.webhook = { name, secret, consecutive_failed_count }` and `context.job = { uuid, ... }` per the docs.
- A fake but plausible header set matching the list above. Use a placeholder HMAC signature (clearly fake, not a real one).

Mark hand-crafted files in a commit message so they can be replaced with live captures later.

### Auto-generation idea (deferred)

User raised the meta-question of generating samples from spec/docs/scraping. My read:
- Scrapfly doesn't publish a public OpenAPI spec, so spec-driven generation is out.
- The receiver-based live-capture flow this repo already has is the right path; the missing piece is just making it easy to point external providers at it (a documented ngrok recipe, or a Hookdeck connection pre-baked into the dev workflow).
- LLM-from-docs synthesis is fine as a stopgap but should always be replaced with a real capture when possible. Don't invest in tooling around it.

Recommend bringing this up as a separate piece of work after Scrapfly is in.

## Suggested order of operations for the terminal session

1. `git status` — confirm clean tree on `claude/update-default-branch-43Cww`.
2. Ask the user for a Scrapfly API key (or confirm we're going hand-crafted).
3. If live: walk them through `yarn dev:receiver` + tunnel + Scrapfly webhook registration; capture three payloads; scrub.
4. If hand-crafted: write the three files per the schema above; mark as synthetic.
5. Add `providers/scrapfly/index.json`.
6. Commit and push to `claude/update-default-branch-43Cww`. Do NOT open a PR unless the user asks.
7. Remind the user to do the GitHub Settings flip for the default branch (Task 1) — this is not done yet.

## Open questions to confirm with the user

- Do they want the `main → master` sync workflow? (See Task 2 caveats about branch protection.)
- Test or live Scrapfly environment for the captures?
- Are there any account-specific fields they want preserved vs. scrubbed in the sample bodies?
