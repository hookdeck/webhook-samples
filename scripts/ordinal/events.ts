import { TriggerSpec } from "../lib";
import { OrdinalClient } from "./ordinal";

// The complete, documented Ordinal event taxonomy
// (https://docs.tryordinal.com/integrations/webhooks/event-types).
// Every one of these has a captured/seeded payload in
// providers/ordinal/latest/<topic>.json.
export const ALL_TOPICS = [
  "social_profile.connected",
  "social_profile.disconnected",
  "social_profile.reconnect_needed",
  "post.created",
  "post.scheduled",
  "post.rescheduled",
  "post.unscheduled",
  "post.published",
  "post.publish_failed",
  "post.archived",
  "post.permanently_deleted",
  "post.content.edited",
  "post.comment.created",
  "post.inline_comment.created",
  "post.approval.requested",
  "post.approval.approved",
  "campaign.approval.requested",
  "campaign.approval.approved",
  "invite.created",
  "invite.accepted",
] as const;

const isoIn = (ms: number): string => new Date(Date.now() + ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;

const draftTitle = (label: string): string =>
  `[webhook-samples] ${label} ${new Date().toISOString()}`;

/**
 * A resource a trigger created during capture, recorded so the capture
 * driver can tear it down afterwards (see scripts/ordinal/capture.ts).
 * Posts can only be archived (Ordinal has no API permanent-delete);
 * invites are deleted outright.
 */
export type CreatedResource =
  | { kind: "post"; id: string }
  | { kind: "invite"; id: string };

/**
 * The subset of events the capture harness can drive end-to-end through
 * the documented Ordinal REST API on a bare workspace, with no human in
 * the loop. Each trigger creates its own throwaway resource so the
 * triggers stay independent and parallel-safe; the resulting delivery is
 * captured into `<name>.json`.
 *
 * Everything NOT listed here requires a side channel the API can't drive
 * unattended (an OAuth social connection, an approver/invitee acting, the
 * in-app editor's debounce, etc.) and is shipped as a docs-sourced
 * payload instead — see providers/ordinal/README.md. Triggers are
 * best-effort: any that fail (e.g. scheduling on a workspace with no
 * connected channel) leave the existing seeded payload untouched.
 *
 * Every resource a trigger creates is pushed into `created` so the
 * capture driver can clean it up afterwards.
 */
export function buildTriggers(
  client: OrdinalClient,
  created: CreatedResource[]
): TriggerSpec[] {
  const createDraft = async (label: string): Promise<string> => {
    const id = await client.createPost({
      title: draftTitle(label),
      publishAt: isoIn(7 * DAY),
      status: "ToDo",
    });
    created.push({ kind: "post", id });
    return id;
  };

  return [
    {
      name: "post.created",
      run: async () => {
        const id = await createDraft("created");
        return `post ${id}`;
      },
    },
    {
      name: "post.scheduled",
      run: async () => {
        const id = await createDraft("scheduled");
        await client.schedulePost(id, isoIn(7 * DAY));
        return `post ${id}`;
      },
    },
    {
      name: "post.rescheduled",
      run: async () => {
        const id = await createDraft("rescheduled");
        await client.schedulePost(id, isoIn(7 * DAY));
        await client.schedulePost(id, isoIn(14 * DAY));
        return `post ${id}`;
      },
    },
    {
      name: "post.unscheduled",
      run: async () => {
        const id = await createDraft("unscheduled");
        await client.schedulePost(id, isoIn(7 * DAY));
        await client.unschedulePost(id);
        return `post ${id}`;
      },
    },
    {
      name: "post.archived",
      run: async () => {
        const id = await createDraft("archived");
        await client.archivePost(id);
        return `post ${id}`;
      },
    },
    {
      name: "invite.created",
      run: async () => {
        const email = `capture+${Date.now()}@example.com`;
        const res = await client.createInvite(email);
        if (res.invite?.id) created.push({ kind: "invite", id: res.invite.id });
        return email;
      },
    },
  ];
}

export const TRIGGERABLE_TOPICS = [
  "post.created",
  "post.scheduled",
  "post.rescheduled",
  "post.unscheduled",
  "post.archived",
  "invite.created",
] as const;
