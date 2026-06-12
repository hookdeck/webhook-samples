# Ordinal sample generation

Generates the Ordinal webhook samples in `providers/ordinal/latest/` from
Ordinal's [documentation](https://docs.tryordinal.com/integrations/webhooks/introduction).

```sh
yarn generate:ordinal
```

## Why docs-sourced

Ordinal has ~20 webhook event types and **no test-event trigger**, and
most events can't be produced through the API unattended — they need an
OAuth social connection, a real publish to a live channel, an approver or
invitee acting, or the in-app editor (debounced). Live-capturing the full
set isn't practical. But Ordinal publishes a canonical example payload for
every event in its docs, so we generate the samples from there instead.

## How it works

`docs.ts`:

1. Fetches the docs index, `https://docs.tryordinal.com/llms.txt`.
2. Discovers every `integrations/webhooks/<event>` page (excluding
   `introduction` and `event-types`).
3. Fetches each page and extracts the single ```` ```json ```` example
   payload it publishes.
4. Derives the topic from the payload's own `type` and writes
   `providers/ordinal/latest/<type>.json` in this repo's
   `{ headers, body, topic }` shape.
5. Reconciles the discovered events against `EXPECTED_TOPICS` (a
   human-maintained safety net) and warns if the docs added or dropped an
   event.

Deterministic and re-runnable, with no credentials. It fails loudly
(non-zero exit) rather than writing a wrong payload if a page has no
parseable example or no `type`.

`headers` on the generated files are representative, not recorded — the
docs don't enumerate delivery headers. Payloads use Ordinal's own
placeholder data (`Acme Inc`, `550e8400-…` UUIDs), so they're clearly
examples, not real captures. See
[`../../providers/ordinal/README.md`](../../providers/ordinal/README.md)
for the full provenance and event taxonomy.

## Files

- `docs.ts` — the generator (`yarn generate:ordinal`)
- `AGENTS.md` — context for agents working in this directory

## Maintenance

If Ordinal adds or removes an event, `generate:ordinal` will warn during
the reconcile step. Update `EXPECTED_TOPICS` in `docs.ts` to match, re-run,
and commit the new/removed payload files.
