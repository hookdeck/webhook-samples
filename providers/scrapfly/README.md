# Scrapfly webhook samples

Real webhook deliveries captured from the [Scrapfly](https://scrapfly.io)
Scrape and Extraction APIs through Hookdeck. See
[`scripts/scrapfly/`](../../scripts/scrapfly/) for the automation that
produced them.

| File             | Source product               | Notes                                       |
|------------------|------------------------------|---------------------------------------------|
| `latest/scrape.json`     | Scrape API (`/scrape`)       | Full scrape result, ~25 KB                   |
| `latest/extraction.json` | Extraction API (`/extraction`) | LLM-extracted JSON from posted HTML, small  |
| `latest/crawler_*.json`  | Crawler API (`/crawl`)       | Doc-sourced, 7 files — see below             |

All three products (Scrape, Extraction, Screenshot) share the same
Scrapfly webhook system, distinguished by the
`X-Scrapfly-Webhook-Resource-Type` header — that's the
`topic_identifier` in [`index.json`](./index.json).

## The Crawler API is a fourth family, and it has its own header

The `crawler_*.json` files are doc-sourced (they carry a `source` key; see the
[repo README](../../README.md#doc-sourced-samples)) and they do **not** follow
the pattern above.

`X-Scrapfly-Webhook-Resource-Type` names the *product*, not the event. Scrapfly's
[Crawler webhook docs](https://scrapfly.io/docs/crawler-api/webhook) describe it
as "Resource type (always `crawler` for crawler webhooks)", so on this family it
is a constant — keying on it would collapse all seven crawler events into one
topic called `crawler`. The event name is in a separate header,
`X-Scrapfly-Crawl-Event-Name` ("Fast routing - Use this to route events without
parsing JSON"), mirrored by the top-level body field `event`.

`topic_identifier` is left as `x-scrapfly-webhook-resource-type` because that is
what resolves for the Scrape and Extraction captures, and only one identifier per
provider is expressible. The crawler files carry their correct topic explicitly.

## Why there is no `screenshot.json`

Scrapfly's [Screenshot API](https://scrapfly.io/docs/screenshot-api)
delivers raw image bytes (JPEG/PNG/WebP/GIF) as the webhook body, but
sends them with `Content-Type: application/json` — that header is set
by the dashboard webhook config and is applied uniformly across all
three product deliveries, regardless of the actual body format.

Hookdeck rejects the request at the source layer with
[`UNPARSABLE_JSON`](https://hookdeck.com/docs/requests#rejection-causes)
because the body fails JSON parsing. The Screenshot API has no
parameter to wrap the image in a JSON envelope, and Hookdeck's
inbound [supported content types](https://hookdeck.com/docs/sources)
do not include `image/*` or `application/octet-stream`. MsgPack
(the other Scrapfly delivery format) is also outside Hookdeck's
allowlist.

There is no client-side configuration that bridges the two, so
Screenshot is intentionally excluded from the automated capture.
Reported to Scrapfly so the JSON content-type setting may eventually
be honoured for the Screenshot product (or sent honestly as
`image/jpeg`).
