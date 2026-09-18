// Shared types used across the pipeline.

export interface ZendeskComment {
  id: number;
  author_id: number;
  body: string;
  html_body?: string;
  public: boolean;
  created_at: string;
}

export interface ZendeskTicket {
  id: number;
  subject: string;
  description: string;
  status: "new" | "open" | "pending" | "hold" | "solved" | "closed";
  requester_id: number;
  tags: string[];
  priority?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZendeskRequester {
  id: number;
  name: string;
  email: string;
}

/** Everything the rules engine + AI drafting need about one ticket. */
export interface TicketContext {
  ticket: ZendeskTicket;
  requester: ZendeskRequester | null;
  comments: ZendeskComment[]; // chronological, oldest first
  brand: string;
}

export type ActionType = "solve" | "pending" | "escalate" | "no_action" | "order_confirmation" | "licensee_initial_response";

/** Outcome of running the rules engine against a ticket. */
export interface RuleDecision {
  action: ActionType;
  /** Which rule (by name) produced this decision, for logging/audit. */
  matchedRule: string;
  /** Tags to add to the ticket when this rule fires. */
  addTags?: string[];
  /** If true, never auto-send even in auto mode - always require human review. */
  forceHumanReview: boolean;
  /**
   * If true, this rule is allowed to auto-send WITHOUT waiting for MODE=auto
   * globally (see pipeline.ts) - an explicit, narrow, per-rule exception to
   * the "MODE=draft holds everything for human review" default, used ONLY
   * for event_booking_question per Christopher's explicit request
   * (2026-09-18: private event quotes should send automatically). Every
   * other rule category is unaffected and still gated by MODE as before.
   * Still subject to a confidence gate in pipeline.ts - only a "high"
   * confidence AI draft actually bypasses review, even for a rule with this
   * set, since these are real priced quotes going straight to a customer.
   */
  bypassDraftModeForAutoSend?: boolean;
  /** Extra instruction to hand the AI when drafting the reply (e.g. "ask for the event date"). */
  draftingHint?: string;
}

/**
 * Which private-event quote category the AI drafted, if any - used only by
 * the event_booking_question rule (see rules.yaml) so the follow-up poller
 * (src/followups.ts) can pick the right email 2 variant (Corporate vs
 * Standard) later, and so pipeline.ts knows whether to apply follow-up
 * tracking tags at all. null/absent for every non-quote reply (general FAQ
 * redirects, other rules, etc.).
 */
export type PrivateEventCategory = "fundraiser" | "kiddos" | "standard" | "corporate";

/** Outcome of the AI drafting step. */
export interface DraftResult {
  replyBody: string;
  suggestedAction: ActionType;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  /** Only set (non-null) when this reply was a private event quote. */
  eventCategory?: PrivateEventCategory | null;
}
