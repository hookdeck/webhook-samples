# Shopify sample capture — 2026-07

Triggers every webhook topic Shopify documents at API version 2026-07 via
the Shopify CLI and captures the deliveries into
`providers/shopify/2026-07/`.

Same shape as [`../2024-10/`](../2024-10/), which is kept as the record of
how that version's samples were captured. Each API version gets its own
directory here because `topics.txt` and `--api-version` both change.

## Why 2026-07

The repo's newest Shopify samples were at `2024-10`, which
[stopped being accessible on 2025-10-16](https://shopify.dev/docs/api/usage/versioning).
Shopify falls forward to the oldest supported version once a version
expires, so requests pinned to `2024-10` are no longer served at that
version and its reference docs no longer resolve.

2026-07 is the current stable release. It should be re-run each time
Shopify ships a quarterly version — the samples are only as good as the
version they were captured at.

## Requires

- Shopify CLI installed and authenticated
- A Shopify app available to the CLI
- `yarn dev:receiver` running (writes to `providers/<provider>/<version>/`)
- Hookdeck CLI proxying the source to the receiver

## Run

```sh
SHOPIFY_APP_PATH=/path/to/your/shopify/app \
WEBHOOK_BASE_URL=https://hkdk.events/event_path \
node scripts/shopify/2026-07/trigger.js
```

`WEBHOOK_BASE_URL` defaults to `https://hkdk.events/event_path`; the
version segment is taken from this directory's name, so the receiver
writes to `providers/shopify/2026-07/`.

Set `WEBHOOK_BASE_URL` to the **bare** Hookdeck source URL —
`trigger.js` appends `/shopify/<version>` itself.

### The CLI destination path must be `/`

Start the tunnel as `hookdeck listen 9001 shopify`, with no `--path`.
Because the address already carries `/shopify/2026-07`, adding it again
via `--path` (the way `scripts/scrapfly/` does, since Scrapfly posts to
the bare source URL) forwards to
`localhost:9001/shopify/2026-07/shopify/2026-07` and every delivery
404s.

The path is stored on the CLI destination Hookdeck auto-creates, so
restarting `hookdeck listen` without the flag does **not** clear a bad
value. Reset it directly:

```sh
curl -X PUT https://api.hookdeck.com/2025-07-01/destinations/<dest_id> \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"config":{"path":"/","path_forwarding_disabled":false,
       "auth_type":"HOOKDECK_SIGNATURE","auth":{}}}'
```

### Authentication

`shopify app webhook trigger` starts a device-code login if the CLI
isn't authenticated, which will stall an unattended 217-topic run. Run
one topic by hand first and complete the login before starting the
sweep.

Topics the CLI has no trigger for are skipped and listed at the end of the
run rather than failing it — Shopify doesn't provide sample payloads for
every topic it documents.

## After the run

1. Review the captured files. They carry real headers including
   `x-shopify-api-version: 2026-07`, which is what distinguishes them
   from anything hand-entered.
2. Bump `latest_version` in `providers/shopify/index.json` to `2026-07`.
   Do this **only once the directory has samples in it** — `compile.ts`
   publishes `latest_version` and the version list separately, so
   pointing at a version that doesn't exist yet would break consumers.
3. `yarn compile` and check `public/providers/shopify/2026-07.json`.

## Regenerating topics.txt

`topics.txt` is a comma-separated list of the 217 topics documented at
<https://shopify.dev/docs/api/webhooks/latest>, extracted on 2026-08-06.
That page serves whatever the current stable version is, so re-extract it
rather than copying this file forward to the next version directory.

22 topics present at 2024-10 are gone at 2026-07 (`purchase_orders/*`,
`suppliers/*`, `translatable_content/*`, `checkouts/paid`,
`product_operations/finish` and others), and 31 are new — which is the
reason a version directory can't just inherit the previous list.
