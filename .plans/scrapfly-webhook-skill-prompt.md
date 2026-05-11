# Skill creation brief: `scrapfly-webhooks`

A self-contained brief for an agent that creates webhook-handler
skills (e.g. the `hookdeck/webhook-skills` family — `stripe-webhooks`,
`shopify-webhooks`, etc.). The goal is to produce a `scrapfly-webhooks`
skill that pairs with `hookdeck/agent-skills`' `event-gateway` skill
in the same way the existing provider skills do: framework-specific
verification handlers (Express, Next.js, FastAPI), backed by a single
canonical verification reference.

## What Scrapfly is (one paragraph)

Scrapfly is a web-scraping API platform with three products that share
a single asynchronous job + webhook model:

- **Scrape API** — fetches a target URL with anti-bot / JS-render
  options. (`https://scrapfly.io/docs/scrape-api/webhook`)
- **Extraction API** — runs LLM- or template-based extraction over
  scraped/posted HTML. (`https://scrapfly.io/docs/extraction-api/webhook`)
- **Screenshot API** — renders a URL and returns image + metadata.
  (`https://scrapfly.io/docs/screenshot-api/webhook`)

All three use **one shared webhook system**. A single webhook URL
registered in the dashboard receives deliveries from all three
products, distinguished by header. **Webhooks require a paid Scrapfly
plan** (first paid tier) — note this as a prerequisite in the skill.

## Webhook system facts (verified against Scrapfly docs, 2026-05-11)

### Registration

- Webhooks are registered in the dashboard at
  <https://scrapfly.io/dashboard/webhook> with a **name** and a
  destination URL.
- There is **no API** for creating/updating/deleting webhooks
  programmatically.
- The destination URL **cannot be passed per-call**. Each API call
  references an already-registered webhook by name via the
  `webhook_name` query parameter, e.g.
  `…/scrape?…&webhook_name=samples-capture`.

### Headers Scrapfly sends

- `X-Scrapfly-Webhook-Signature` — HMAC-SHA256 of the raw body,
  **uppercase hex**.
- `X-Scrapfly-Webhook-Signature-Lowercase` — same digest, lowercase
  hex. Provided because some platforms downcase header values.
- `X-Scrapfly-Webhook-Job-Id` — UUID of the job that produced the
  payload.
- `X-Scrapfly-Webhook-Resource-Type` — one of `scrape`,
  `extraction`, `screenshot`. **This is how a handler dispatches
  by product**, and is the obvious topic identifier when the skill
  recommends per-event routing.
- `X-Scrapfly-Webhook-Env` — `test` or `live`.
- `X-Scrapfly-Webhook-Project` — project identifier.
- `X-Scrapfly-Webhook-Name` — webhook name (matches the dashboard
  registration).
- `X-Scrapfly-Webhook-Id` — webhook identifier.
- `X-Scrapfly-Log-Uuid`, `X-Scrapfly-Log-Url` — present when a log
  is available.

### Signature verification

Per Scrapfly docs (quoted):

> "Compute the digest over the raw request body bytes (don't parse
> and re-serialize JSON, that changes the byte sequence)."

- Algorithm: HMAC-SHA256.
- Secret: per-webhook, displayed in the dashboard alongside the
  webhook configuration. **Not** the account API key.
- Compare to either header (uppercase or lowercase). Use
  constant-time comparison.
- The docs **do not** mention timestamp tolerance / replay protection
  — there's no `t=…` style envelope (unlike Stripe). The skill should
  note this and recommend idempotency by `X-Scrapfly-Webhook-Job-Id`
  for at-least-once delivery safety.

Reference verification code from the docs (Python):

```python
import hmac, hashlib

secret_key = 'YOUR-WEBHOOK-SIGNING-SECRET'
webhook_payload = b'{"data": "example"}'

computed = hmac.new(
    secret_key.encode('utf-8'),
    webhook_payload,
    hashlib.sha256,
).hexdigest().upper()

if hmac.compare_digest(computed, received_signature):
    ...
```

### Payload shape

Per the docs, the webhook body is **the full response body of the
corresponding API**, with two additional `context.*` keys added:

- `context.webhook` — `{ name, secret, consecutive_failed_count, … }`
  (the `secret` field exposes the signing secret in the payload — the
  skill must warn handlers to ignore it; do not log or echo).
- `context.job` — `{ uuid, … }`.

The product-specific base shapes:

- **Scrape**: `{ result, config, context }` — `result` includes
  `content`, `status_code`, `success`, etc. See
  <https://scrapfly.io/docs/scrape-api/getting-started>.
- **Extraction**: `{ content_type, data, context }` — `data` is the
  extracted JSON / model output. See
  <https://scrapfly.io/docs/extraction-api/getting-started>.
- **Screenshot**: `{ job_uuid, log_uuid, log_url, … context }` plus
  image metadata. See
  <https://scrapfly.io/docs/screenshot-api/getting-started>.

The skill should not hand-craft fake payloads from these descriptions
alone — direct the user to capture real samples (the webhook-samples
repo's `scripts/scrapfly/capture.ts` is one way; the
`providers/scrapfly/latest/*.json` files will be the canonical
reference once captured).

### Delivery semantics

- Retry schedule: 30s → 1min → 5min → 30min → 1h → 1d.
- A webhook is **disabled after 100 consecutive failures**. Handlers
  should aim for a 2xx response within the timeout and surface errors
  out-of-band rather than via 5xx responses.
- Deliveries are at-least-once. Use `X-Scrapfly-Webhook-Job-Id` as the
  idempotency key.

## Skill contents to produce

Match the shape of existing `hookdeck/webhook-skills` provider skills:

1. **`SKILL.md`** — top-level. Brief overview, scope, when to use
   together with `event-gateway`, key constraints (paid-tier
   prerequisite, no replay envelope, one shared system across three
   products).
2. **`references/verification.md`** — canonical signature-verification
   reference. Cover:
   - Raw-body capture (Express `express.raw({ type: '*/*' })`,
     FastAPI `request.body()`, Next.js App Router `await req.text()`
     before parsing).
   - HMAC-SHA256, uppercase hex, constant-time compare. Show both
     uppercase and lowercase header acceptance.
   - Pitfall section: do not `JSON.parse(...).stringify(...)` before
     verifying.
   - Idempotency-by-job-id recommendation.
3. **`examples/express/`**, **`examples/nextjs/`**, **`examples/fastapi/`**
   — runnable mini-projects with a `/webhooks/scrapfly` (or similar)
   route that:
   - Reads raw body
   - Verifies signature
   - Dispatches on `X-Scrapfly-Webhook-Resource-Type`
     (`scrape` | `extraction` | `screenshot`)
   - Returns 200 quickly
4. **`references/dispatching.md`** — how to route the three resource
   types within one handler. Show a switch on the header. Note that
   the dashboard-set `webhook_name` is the same for all three; the
   product is distinguished by header, not URL.
5. **`references/payload-shapes.md`** — quote the three product
   "getting-started" response shapes and the `context.webhook` /
   `context.job` overlay. Link out to the live docs as the source of
   truth; do not freeze field lists.

## Things to deliberately avoid

- **Do not hard-code a "Scrapfly SDK" for verification.** There is no
  official SDK construct equivalent to Stripe's `constructEvent`;
  verification is plain HMAC. Implementing it inline is correct here
  — do not introduce a third-party HMAC library.
- **Do not suggest passing the webhook URL on the API call.** That
  parameter does not exist; the only knob per call is `webhook_name`.
- **Do not invent a timestamp / replay window.** The docs don't
  describe one. If you want replay protection, recommend
  application-level deduplication keyed on the job ID, not a
  reconstructed `t=` window.

## Authoritative sources

Primary (re-fetch these when writing the skill — content evolves):

- <https://scrapfly.io/docs/scrape-api/webhook>
- <https://scrapfly.io/docs/extraction-api/webhook>
- <https://scrapfly.io/docs/screenshot-api/webhook>
- <https://scrapfly.io/docs/scrape-api/getting-started>
- <https://scrapfly.io/docs/extraction-api/getting-started>
- <https://scrapfly.io/docs/screenshot-api/getting-started>
- <https://scrapfly.io/dashboard/webhook> (dashboard, for UI shape
  references — login required)

Cross-reference / format precedents:

- <https://github.com/hookdeck/webhook-skills> — overall structure.
- The `stripe-webhooks` skill in that repo, specifically — same
  layered model (event-gateway + provider skill, raw-body
  verification, framework examples) is the closest analogue, minus
  Stripe's SDK construct.

## Definition of done

- `npx skills add hookdeck/webhook-skills --skill scrapfly-webhooks`
  installs the skill cleanly.
- The Express, Next.js, and FastAPI examples each run, accept a
  signed test request, reject an unsigned/tampered one, and log
  which resource type was received.
- The skill explicitly states the paid-tier prerequisite and the
  one-shared-system / three-products model.
- A handler built from the examples can be paired with `event-gateway`
  (Hookdeck CLI `hookdeck listen <port> scrapfly`) end-to-end.
