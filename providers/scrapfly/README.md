# Scrapfly webhook samples

Real webhook deliveries captured from the [Scrapfly](https://scrapfly.io)
Scrape and Extraction APIs through Hookdeck. See
[`scripts/scrapfly/`](../../scripts/scrapfly/) for the automation that
produced them.

| File             | Source product               | Notes                                       |
|------------------|------------------------------|---------------------------------------------|
| `latest/scrape.json`     | Scrape API (`/scrape`)       | Full scrape result, ~25 KB                   |
| `latest/extraction.json` | Extraction API (`/extraction`) | LLM-extracted JSON from posted HTML, small  |

All three products (Scrape, Extraction, Screenshot) share the same
Scrapfly webhook system, distinguished by the
`X-Scrapfly-Webhook-Resource-Type` header — that's the
`topic_identifier` in [`index.json`](./index.json).

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
