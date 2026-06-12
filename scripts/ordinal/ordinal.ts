// Minimal typed client for the Ordinal REST API
// (https://docs.tryordinal.com). Only the operations the capture
// harness needs are implemented. Auth is a workspace-scoped bearer
// token: `Authorization: Bearer ord_...`.

export type Webhook = {
  id: string;
  name: string;
  url: string;
  description?: string | null;
  headers?: Record<string, string> | null;
  topics: string[];
  createdAt: string;
};

export type CreatePostInput = {
  title: string;
  publishAt: string;
  status: string;
  notes?: string;
};

export class OrdinalClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Ordinal ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`
      );
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  // --- Webhooks -------------------------------------------------------

  listWebhooks(): Promise<Webhook[]> {
    return this.request<Webhook[]>("GET", "/webhooks");
  }

  createWebhook(input: {
    name: string;
    url: string;
    topics: string[];
    description?: string;
    headers?: Record<string, string>;
  }): Promise<Webhook> {
    return this.request<Webhook>("POST", "/webhooks", input);
  }

  updateWebhook(
    id: string,
    input: {
      name?: string;
      url?: string;
      topics?: string[];
      description?: string;
      headers?: Record<string, string>;
    }
  ): Promise<Webhook> {
    return this.request<Webhook>("PATCH", `/webhooks/${id}`, input);
  }

  /** Create the webhook if absent, otherwise update the existing one (matched by name). */
  async upsertWebhook(input: {
    name: string;
    url: string;
    topics: string[];
    description?: string;
    headers?: Record<string, string>;
  }): Promise<{ webhook: Webhook; created: boolean }> {
    const existing = (await this.listWebhooks()).find(
      (w) => w.name === input.name
    );
    if (existing) {
      const webhook = await this.updateWebhook(existing.id, {
        url: input.url,
        topics: input.topics,
        description: input.description,
        headers: input.headers,
      });
      return { webhook: { ...existing, ...webhook }, created: false };
    }
    const webhook = await this.createWebhook(input);
    return { webhook, created: true };
  }

  // --- Posts ----------------------------------------------------------

  async createPost(input: CreatePostInput): Promise<string> {
    const res = await this.request<any>("POST", "/posts", input);
    const id = res?.id ?? res?.post?.id;
    if (!id) throw new Error("createPost: no post id in response");
    return id;
  }

  schedulePost(id: string, publishAt: string): Promise<unknown> {
    return this.request("POST", `/posts/${id}/schedule`, { publishAt });
  }

  unschedulePost(id: string): Promise<unknown> {
    return this.request("POST", `/posts/${id}/unschedule`);
  }

  archivePost(id: string): Promise<unknown> {
    return this.request("POST", `/posts/${id}/archive`);
  }

  // --- Invites --------------------------------------------------------

  createInvite(email: string): Promise<{ invite: { id: string } | null }> {
    return this.request("POST", "/invites", { email });
  }

  deleteInvite(id: string): Promise<unknown> {
    return this.request("DELETE", `/invites/${id}`);
  }
}
