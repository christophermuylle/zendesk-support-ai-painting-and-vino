// Thin client around the Zendesk REST API (https://developer.zendesk.com/api-reference/).
// Auth uses an agent/admin email + API token, per Zendesk's basic-auth token scheme:
// https://developer.zendesk.com/api-reference/introduction/security-and-auth/#api-token

import type {
  ZendeskComment,
  ZendeskRequester,
  ZendeskTicket,
  TicketContext,
  ActionType,
} from "./types.js";

export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
  brand: string;
}

export type ZendeskStatus = "new" | "open" | "pending" | "hold" | "solved" | "closed";

/** Minimal surface the pipeline depends on - lets tests/mocks swap in a fake. */
export interface IZendeskClient {
  getTicketContext(ticketId: number): Promise<TicketContext>;
  postComment(
    ticketId: number,
    body: string,
    opts: {
      isPublic: boolean;
      status?: ActionType;
      addTags?: string[];
      fields?: Array<{ id: number; value: string | null }>;
      htmlBody?: string;
    }
  ): Promise<void>;
  /** Update status, tags, and/or custom fields WITHOUT posting a comment (used for out-of-scope tickets and rule-driven field updates like order confirmations). */
  updateTicket(
    ticketId: number,
    opts: { status?: ZendeskStatus; addTags?: string[]; fields?: Array<{ id: number; value: string | null }> }
  ): Promise<void>;
  /** Used only by the follow-up poller (src/followups.ts) to find candidate tickets. */
  searchTicketIds(query: string): Promise<number[]>;
}

export class ZendeskClient implements IZendeskClient {
  private baseUrl: string;
  private authHeader: string;
  private brand: string;

  constructor(cfg: ZendeskConfig) {
    this.baseUrl = `https://${cfg.subdomain}.zendesk.com/api/v2`;
    const token = Buffer.from(`${cfg.email}/token:${cfg.apiToken}`).toString("base64");
    this.authHeader = `Basic ${token}`;
    this.brand = cfg.brand;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Zendesk API ${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText} ${body}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * Find ticket IDs matching a Zendesk Search query, e.g.
   * `type:ticket status:pending tags:private_event_quote_sent`. Follows
   * `next_page` to collect every page rather than just the first 100 -
   * results are expected to be a small queue (private event follow-ups),
   * but silently dropping tickets past page 1 would be a real bug in an
   * unattended poller, so this is deliberately not capped.
   *
   * Deliberately does NOT try to express "updated more than 24 hours ago"
   * in the query string - Zendesk Search's date filters (updated<, etc.)
   * are day-granularity only, not hour-granularity, so they can't express
   * the 24h/72h/120h windows the follow-up poller needs precisely. Callers
   * should search broadly (by tag/status only) and do exact hour-math
   * filtering themselves against each ticket's real updated_at.
   */
  async searchTicketIds(query: string): Promise<number[]> {
    const ids: number[] = [];
    let path: string | null = `/search.json?query=${encodeURIComponent(query)}&sort_by=updated_at&sort_order=asc`;
    while (path) {
      const data: { results: Array<{ id: number }>; next_page: string | null } = await this.request(path);
      ids.push(...data.results.map((r) => r.id));
      // next_page is a full URL (including the base) - strip it back down to
      // a path relative to this.baseUrl so the same authenticated request()
      // helper can follow it.
      path = data.next_page ? data.next_page.replace(this.baseUrl, "") : null;
    }
    return ids;
  }

  async getTicket(ticketId: number): Promise<ZendeskTicket> {
    const data = await this.request<{ ticket: ZendeskTicket }>(`/tickets/${ticketId}.json`);
    return data.ticket;
  }

  async getComments(ticketId: number): Promise<ZendeskComment[]> {
    const data = await this.request<{ comments: ZendeskComment[] }>(
      `/tickets/${ticketId}/comments.json?sort_order=asc`
    );
    return data.comments;
  }

  async getRequester(userId: number): Promise<ZendeskRequester | null> {
    try {
      const data = await this.request<{ user: ZendeskRequester }>(`/users/${userId}.json`);
      return data.user;
    } catch {
      return null;
    }
  }

  /**
   * Zendesk's `additional_tags` convenience field on a ticket PUT is
   * silently ignored on this account: sending
   * `{ ticket: { additional_tags: [...] } }` gets a 200 back but the tag
   * never actually lands on the ticket. Confirmed 2026-09-13 by testing
   * directly against production - this was the root cause of every
   * no_action / pending / escalate rule's tags never showing up (only
   * order_confirmation ever worked, and that tag comes from the "Reason
   * for Customer Contacting Us" tagger field's side effect, not from
   * additional_tags at all). The plain `tags` field (full replace) DOES
   * work, so work around it by fetching the ticket's current tags and
   * sending the union back. Not atomic with whatever else the caller is
   * changing in the same request - a tag added by a human between this
   * GET and the follow-up PUT could theoretically be missed - but that's
   * a far smaller risk than every AI-applied tag silently vanishing.
   */
  private async mergeTags(ticketId: number, newTags: string[]): Promise<string[]> {
    const current = await this.getTicket(ticketId);
    return [...new Set([...(current.tags ?? []), ...newTags])];
  }

  /** Fetch everything the rules engine + AI need in one shot. */
  async getTicketContext(ticketId: number): Promise<TicketContext> {
    const ticket = await this.getTicket(ticketId);
    const [comments, requester] = await Promise.all([
      this.getComments(ticketId),
      this.getRequester(ticket.requester_id),
    ]);
    return { ticket, comments, requester, brand: this.brand };
  }

  /**
   * Post a comment on a ticket.
   * `isPublic: false` posts an internal note (visible only to agents) - this is what
   * MODE=draft uses so a human can review before anything reaches the customer.
   *
   * `htmlBody` (optional): when set, sent as the comment's `html_body`
   * instead of plain `body` - Zendesk renders this as rich text, so this is
   * how the follow-up poller (src/followups.ts) turns "[CLICK HERE...]"
   * style markdown links in Bonnie's email 2/3 templates into actual
   * clickable hyperlinks, which a plain-text `body` comment can't do. AI
   * drafts (rules.yaml/ai.ts) never set this - they only ever send plain
   * `body`, matching the "plain text, no markdown" instruction in ai.ts's
   * system prompt.
   */
  async postComment(
    ticketId: number,
    body: string,
    opts: {
      isPublic: boolean;
      status?: ActionType;
      addTags?: string[];
      fields?: Array<{ id: number; value: string | null }>;
      htmlBody?: string;
    }
  ): Promise<void> {
    const statusMap: Record<string, string> = { solve: "solved", pending: "pending", escalate: "open" };
    const ticket: Record<string, unknown> = {
      comment: opts.htmlBody ? { html_body: opts.htmlBody, public: opts.isPublic } : { body, public: opts.isPublic },
    };
    if (opts.status && statusMap[opts.status]) {
      ticket.status = statusMap[opts.status];
    }
    if (opts.addTags?.length) {
      ticket.tags = await this.mergeTags(ticketId, opts.addTags);
    }
    if (opts.fields?.length) {
      ticket.fields = opts.fields;
    }
    await this.request(`/tickets/${ticketId}.json`, {
      method: "PUT",
      body: JSON.stringify({ ticket }),
    });
  }

  /**
   * Update status and/or tags without posting a comment - used for
   * out-of-scope tickets (e.g. wrong location) that should stay silent but
   * still land in the right queue for a human to redirect.
   *
   * Adds tags via the plain `tags` field (see mergeTags - `additional_tags`
   * doesn't actually work on this account). This IS a full replace under
   * the hood, but mergeTags reads the ticket's current tags first and
   * includes them, so nothing set by another trigger/app gets wiped.
   *
   * `fields` sets Zendesk custom ticket fields (e.g. the "Reason for
   * Customer Contacting Us" tagger field) - passed straight through as the
   * `fields` array the ticket API expects: [{ id, value }, ...].
   */
  async updateTicket(
    ticketId: number,
    opts: { status?: ZendeskStatus; addTags?: string[]; fields?: Array<{ id: number; value: string | null }> }
  ): Promise<void> {
    const ticket: Record<string, unknown> = {};
    if (opts.status) ticket.status = opts.status;
    if (opts.addTags?.length) ticket.tags = await this.mergeTags(ticketId, opts.addTags);
    if (opts.fields?.length) ticket.fields = opts.fields;
    if (Object.keys(ticket).length === 0) return;
    await this.request(`/tickets/${ticketId}.json`, {
      method: "PUT",
      body: JSON.stringify({ ticket }),
    });
  }
}
