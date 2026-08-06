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

3. [OPTIONAL] Install the dependencies with `yarn` install` and start the request receiver with `yarn dev:receiver`. You can now send a request to http://localhost:9001/:provider/:version, and the received request will automatically be saved to that provider directory.

Each provider has a directory for each version, and each version has a file for each topic. The file's name is the topic and contains the request data `headers` and `body`.

You can manually enter the data if you'd instead not use the request receiver.

## Using the data

The data is packaged into JSON files that are distributed over http. The files can be found on https://samples.hookdeck.com

List of providers: https://samples.hookdeck.com/providers.json
Data for a provider: https://samples.hookdeck.com/providers/shopify/2023-01.json
