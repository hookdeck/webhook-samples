# Webhook Samples

This repo is a collection of webhooks data from different platforms that distribute webhooks. This data is used in https://console.hookdeck.com "Example Webhooks".

## Contributing

### Adding a new provider

1. Add a new directory for the provider in `./providers`

2. Create a `index.json` file in that provider directory. The index.json file needs a `label` which is the publicly recognizable name for the provider, and a set of configs. The `latest_version` represents the most recent version for that provider, if the provider doesn't offer versioning then input `latest`. The `topic_identifier` is optional and represent either a header or body key to extract the topic from the request.

```
{
  "label": "Shopify",
  "configs": {
    "latest_version": "2023-01",
    "topic_identifier": "x-shopify-topic"
  }
}
```

`latest_version` must be the version the provider's own documentation
currently publishes. Use `latest` only where the provider has no version
scheme at all — if a version appears in the payload (`api_version`,
`meta.version`) or in the docs URL, that is the value.

`topic_identifier` can also be a list, for providers that put the event
type in different places depending on the product. The first key that
resolves wins, so the most specific one goes first:

```
{
  "label": "Scrapfly",
  "configs": {
    "latest_version": "latest",
    "topic_identifier": [
      "x-scrapfly-crawl-event-name",
      "x-scrapfly-webhook-resource-type"
    ]
  }
}
```

A `topic_identifier` may be a plain key or a path into the body, so
providers that nest the event type are named correctly on capture:

| Form | Example | Resolves |
|---|---|---|
| plain key | `event` | `body.event`, or the header of that name |
| dotted path | `data.type` | `body.data.type` |
| array segment | `events[].eventType` | first element of `body.events` |
| nested arrays | `entry[].changes[].field` | first element at each level |

A header or body key whose literal name contains a dot is matched before
the value is treated as a path, so real keys always win.

Only a scalar can name a file. If a path resolves to an object or array the
sample falls back to `untitled-<hash>`, which is a signal that the
identifier is wrong for that payload rather than something to work around.

`provenance` is optional and records, per version, how that version's
samples were obtained:

```
{
  "label": "Shopify",
  "configs": { ... },
  "provenance": {
    "2026-07": { "sourced_via": "capture", "sourced_on": "2026-08-06" }
  }
}
```

`sourced_via` is one of:

| Value | Meaning |
|---|---|
| `capture` | Received as a real delivery from the provider |
| `docs` | Transcribed from the provider's documentation |
| `unknown` | Not recorded — the default for any version with no entry |

`capture` describes how the request arrived, not how realistic the body
is: several providers send synthetic fixtures through the real delivery
path, and some send an empty body for topics they have no sample for.
The headers are real either way.

`docs` is weaker than `capture` and consumers should be able to tell
them apart. Documentation goes stale, and is sometimes wrong — Scrapfly's
crawler docs state the resource-type header is `crawler`, where real
deliveries send `crawl`.

`sourced_on` is the date the samples were obtained (`YYYY-MM-DD`). Where
a version's files were captured on different dates, use the **oldest**,
so the value never overstates how fresh the set is. Don't infer it from
git history — leave the version out entirely and let it resolve to
`unknown` rather than record a date nobody checked.

Both fields are published per version in `providers.json`. A version
with no entry is published as `unknown`, never as a claim that it was
captured. An unrecognised `sourced_via` fails the build.

3. [OPTIONAL] Install the dependencies with `yarn` install` and start the request receiver with `yarn dev:receiver`. You can now send a request to http://localhost:9001/:provider/:version, and the received request will automatically be saved to that provider directory.

Each provider has a directory for each version, and each version has a file for each topic. The file's name is the topic and contains the request data `headers` and `body`.

You can manually enter the data if you'd instead not use the request receiver.

### Doc-sourced samples

Some providers have no captured traffic to draw on. Those carry the vendor's
**published documentation example** instead, marked with a `source` key that a
captured sample never has:

```json
{
  "headers": { "content-type": "application/json" },
  "body": { "...": "the vendor's documented example" },
  "topic": "payment.succeeded",
  "source": {
    "type": "vendor-documentation",
    "url": "https://vendor.example/docs/webhooks",
    "retrieved": "2026-07-29"
  }
}
```

The version those samples live under is marked `"sourced_via": "docs"` in the
provider's `provenance` block, so a consumer can tell without downloading the
version file. The two must agree: a version marked `capture` may not contain
files carrying a `source` key, and `yarn compile` fails the build if it does.

Two things follow from the marking:

- **A capture always beats a doc example.** These are a fallback. When a real
  request for the same provider and topic is captured, it replaces the
  doc-sourced file — the `source` key is what makes that check possible, and its
  absence is what identifies an observed sample.
- **The headers are synthesized.** Vendor docs publish bodies, not deliveries, so
  a doc-sourced file carries `content-type` plus the topic header where the
  provider puts the event type in one. Signature headers are absent, and mock
  sends can't produce valid signatures anyway.

They come from [hookdeck/webhook-registry](https://github.com/hookdeck/webhook-registry)
(`samples-doc/`), which records where each example was read and when.

## Using the data

The data is packaged into JSON files that are distributed over http. The files can be found on https://samples.hookdeck.com

List of providers: https://samples.hookdeck.com/providers.json
Data for a provider: https://samples.hookdeck.com/providers/shopify/2023-01.json
