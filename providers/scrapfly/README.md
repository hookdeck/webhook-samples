# Scrapfly webhook samples

Real webhook deliveries captured from the [Scrapfly](https://scrapfly.io)
Scrape and Extraction APIs through Hookdeck. See
[`scripts/scrapfly/`](../../scripts/scrapfly/) for the automation that
produced them.

| File             | Source product               | Notes                                       |
|------------------|------------------------------|---------------------------------------------|
| `latest/scrape.json`     | Scrape API (`/scrape`)       | Full scrape result, ~25 KB                   |
| `latest/extraction.json` | Extraction API (`/extraction`) | LLM-extracted JSON from posted HTML, small  |
| `latest/crawler_*.json`  | Crawler API (`/crawl`)       | One file per crawler event — see below       |

All four products (Scrape, Extraction, Screenshot, Crawler) share the
same Scrapfly webhook system, distinguished by the
`X-Scrapfly-Webhook-Resource-Type` header.

## The Crawler API needs a second topic_identifier

`X-Scrapfly-Webhook-Resource-Type` names the *product*, not the event.
Scrapfly's [Crawler webhook docs](https://scrapfly.io/docs/crawler-api/webhook)
describe it as "Resource type (always `crawler` for crawler webhooks)" —
so on this family it is a constant. Keying on it alone would collapse
every crawler event into one topic called `crawler`. The event name is
in a separate header, `X-Scrapfly-Crawl-Event-Name`, mirrored by the
top-level body field `event`.

So `topic_identifier` in [`index.json`](./index.json) is a list rather
than a single key:

```json
"topic_identifier": [
  "x-scrapfly-crawl-event-name",
  "x-scrapfly-webhook-resource-type"
]
```

`requestReceiver.ts` takes the first key that resolves. Crawler
deliveries carry the crawl-event-name header and resolve to
`crawler_started`, `crawler_finished` and so on; Scrape and Extraction
deliveries don't carry it and fall through to the resource-type header,
resolving to `scrape` and `extraction` exactly as before.

Four crawler events land on any clean crawl and are captured by
`yarn capture:scrapfly`. The other four (`crawler_url_failed`,
`crawler_url_skipped`, `crawler_stopped`, `crawler_cancelled`) only fire
on a crawl that fails, filters a URL, or is interrupted, so the capture
script leaves them alone rather than manufacturing a failing crawl.

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
