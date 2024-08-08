Script that reads in the webhook topics from `topics.txt` from https://shopify.dev/docs/api/admin-graphql/unstable/enums/WebhookSubscriptionTopic#value-customeraccountsettingsupdate
and uses the Shopify CLI to trigger webhooks and capture the output.

Requires:

- Shopify CLI installed
- Shopify app created and available to the CLI
- Running `yarn dev:receiver` to capture the webhooks
- Running the Hookdeck CLI and proxying the events to the receiver
- Updating the variables in `trigger.js`
- Running `node trigger.js`