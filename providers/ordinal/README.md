# Ordinal webhook samples

Sample webhook deliveries for [Ordinal](https://tryordinal.com), the
social media planning tool. Ordinal's webhook feature
([docs](https://docs.tryordinal.com/integrations/webhooks/introduction))
shipped 2026-04-07 and covers the full post lifecycle, social-profile
connection state, approvals, and workspace invites.

See [`scripts/ordinal/`](../../scripts/ordinal/) for the automation that
provisions the capture pipeline and refreshes these payloads.

## Delivery format

Every event shares one envelope:

```json
{ "type": "post.published", "data": { ... }, "createdAt": "2025-02-26T14:30:00.000Z" }
```

- `type` — the event identifier; this is the `topic_identifier` in
  [`index.json`](./index.json), so each delivery is filed as
  `latest/<type>.json`.
- `data` — event-specific; schema varies by `type`.
- `createdAt` — ISO 8601 emission time.

Ordinal does not document a webhook signature/HMAC scheme. The Hookdeck
source is therefore a generic `WEBHOOK` type and the unguessable source
URL acts as the shared secret. Custom headers can be attached per
subscription via the webhook's `headers` field if downstream
verification is needed.

## ⚠️ Provenance of these payloads

> **All payloads currently in `latest/` are docs-sourced** — they are the
> official example payloads published on each event's schema page under
> <https://docs.tryordinal.com/integrations/webhooks/>, reshaped into this
> repo's `{ headers, body, topic }` format. They are **not** live captures
> yet. They use Ordinal's own placeholder data (`Acme Inc`,
> `jane@example.com`, `550e8400-…` UUIDs) so they can't be mistaken for a
> real account's traffic. `headers` on these files are representative, not
> recorded (the docs do not enumerate delivery headers).

A subset can be refreshed with **real** captures by running
`yarn capture:ordinal` against a live Ordinal workspace (see
[`scripts/ordinal/`](../../scripts/ordinal/)). The rest require a side
channel the API can't drive unattended and stay docs-sourced until
captured by hand. The table below tracks which is which.

## Event taxonomy

| `type` | Group | Capture status | Why |
|--------|-------|----------------|-----|
| `post.created` | Post | **Live-capturable** | `POST /posts` |
| `post.scheduled` | Post | **Live-capturable** | `POST /posts/{id}/schedule` |
| `post.rescheduled` | Post | **Live-capturable** | re-schedule with a new time |
| `post.unscheduled` | Post | **Live-capturable** | `POST /posts/{id}/unschedule` |
| `post.archived` | Post | **Live-capturable** | `POST /posts/{id}/archive` |
| `invite.created` | Invite | **Live-capturable** | `POST /invites` |
| `post.published` | Post | Docs-sourced | needs a connected channel + a real publish to the platform |
| `post.publish_failed` | Post | Docs-sourced | needs a real publish attempt to fail |
| `post.permanently_deleted` | Post | Docs-sourced | no API endpoint; trash-retention or in-app delete |
| `post.content.edited` | Post | Docs-sourced | in-app editor only, ~5 min debounce |
| `post.comment.created` | Post | Docs-sourced | no comment API |
| `post.inline_comment.created` | Post | Docs-sourced | no comment API |
| `post.approval.requested` | Approval | Docs-sourced | needs another workspace member as approver |
| `post.approval.approved` | Approval | Docs-sourced | needs an approver to grant approval |
| `campaign.approval.requested` | Approval | Docs-sourced | campaign approvals are in-app |
| `campaign.approval.approved` | Approval | Docs-sourced | needs an approver to grant approval |
| `invite.accepted` | Invite | Docs-sourced | needs the invitee to accept |
| `social_profile.connected` | Social profile | Docs-sourced | OAuth connect flow |
| `social_profile.disconnected` | Social profile | Docs-sourced | OAuth/in-app disconnect |
| `social_profile.reconnect_needed` | Social profile | Docs-sourced | emitted when a token expires |

> `post.approval.requested` is API-reachable in principle
> (`POST /approvals`) but needs a second member in the workspace to
> request approval from, so it isn't driven by the unattended capture.

### Field notes worth knowing

- `channels` (array) appears on the editorial events (created, scheduled,
  rescheduled, unscheduled, archived, content.edited, permanently_deleted);
  `post.published` / `post.publish_failed` use a singular `channel` string
  because they fire once per channel.
- `linkedIn` / `x` content blocks (and `labels`) are present and nullable
  on the editorial events, absent on the publish-outcome events.
- The three `social_profile.*` events share one `profile` sub-schema,
  differing only in the actor/timestamp fields.

## Re-running the capture

```sh
yarn setup:ordinal     # one-time: Hookdeck source + Ordinal webhook subscription
yarn capture:ordinal   # refresh the live-capturable subset
```

Full instructions, prerequisites, and design notes are in
[`scripts/ordinal/README.md`](../../scripts/ordinal/README.md). Review any
newly captured files before committing — real deliveries carry your test
workspace's slug, user emails, and post URLs.
