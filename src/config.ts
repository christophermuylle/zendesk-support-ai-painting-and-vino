import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return v;
}

export const CONFIG_DIR = path.resolve(process.cwd(), "config");
export const RULES_PATH = path.join(CONFIG_DIR, "rules.yaml");
export const LOCATIONS_PATH = path.join(CONFIG_DIR, "locations.yaml");
export const KNOWLEDGE_BASE_DIR = path.join(CONFIG_DIR, "knowledge-base");
export const SHARED_KNOWLEDGE_BASE_PATH = path.join(KNOWLEDGE_BASE_DIR, "shared.md");
export const LOCATION_KNOWLEDGE_BASE_DIR = path.join(KNOWLEDGE_BASE_DIR, "locations");

export function loadSharedKnowledgeBase(): string {
  return fs.readFileSync(SHARED_KNOWLEDGE_BASE_PATH, "utf-8");
}

/** Returns the location-specific snippet, or null if that location has no file (yet). */
export function loadLocationSnippet(file: string): string | null {
  const p = path.join(LOCATION_KNOWLEDGE_BASE_DIR, file);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

export type Mode = "draft" | "auto";

// Zendesk custom field used by the "order_confirmation" rule action (see
// src/pipeline.ts): the "Reason for Customer Contacting Us" tagger field.
// Setting it to this option's value also auto-applies the matching
// "order_confirmation" Zendesk tag. Configurable via env in case the field
// or option ever gets rebuilt with a new ID, but these defaults are the
// real IDs confirmed against ticket #81025 on Painting and Vino's Zendesk.
export const ORDER_CONFIRMATION_FIELD_ID = Number(process.env.ORDER_CONFIRMATION_FIELD_ID ?? 114096070134);
export const ORDER_CONFIRMATION_FIELD_VALUE = process.env.ORDER_CONFIRMATION_FIELD_VALUE ?? "order_confirmation";

// Same "Reason for Customer Contacting Us" tagger field (114096070134) used
// by the "licensee_initial_response" rule action (see src/pipeline.ts), just
// a different option value - matches Zendesk's own "Licensee Initial
// Response" macro (id 43362301834899) on Painting and Vino, confirmed
// against real tickets #81030 and #81022 (both tagged
// artist__licensee_or_venue after that macro was applied by hand). The
// macro's reply text is copied verbatim below so the automated version
// matches what Christopher already sends for every one of these.
export const LICENSEE_INITIAL_RESPONSE_FIELD_VALUE =
  process.env.LICENSEE_INITIAL_RESPONSE_FIELD_VALUE ?? "artist__licensee_or_venue";
export const LICENSEE_INITIAL_RESPONSE_TEXT =
  process.env.LICENSEE_INITIAL_RESPONSE_TEXT ??
  'Please respond with "RECEIVED" so we know you are receiving our responses.';

// Tag applied by pipeline.ts the moment a private event quote actually
// auto-sends (event_booking_question, bypassDraftModeForAutoSend, high
// confidence - see pipeline.ts) - this is the follow-up poller's
// (src/followups.ts) entry point into its 24h/72h/120h "no response"
// sequence, per Christopher 2026-09-18. Always paired with a
// `${PRIVATE_EVENT_QUOTE_SENT_TAG}_<category>` tag (category = fundraiser |
// kiddos | standard | corporate, from DraftResult.eventCategory) so the
// poller knows which email 2 variant to send without re-deriving it.
export const PRIVATE_EVENT_QUOTE_SENT_TAG = "private_event_quote_sent";

// Prefix for a tag recording WHICH location a quoted ticket matched (e.g.
// "private_event_location_tucson"), applied alongside
// PRIVATE_EVENT_QUOTE_SENT_TAG. The follow-up poller (src/followups.ts)
// reads this back for email 3's location-specific calendar link, rather
// than re-running location resolution against (possibly stale) ticket text
// days later.
export const PRIVATE_EVENT_LOCATION_TAG_PREFIX = "private_event_location_";

// Tags the follow-up poller (src/followups.ts) applies as each stage of the
// sequence fires, so a re-run never double-sends. Also used to detect that
// the sequence should stop (see followups.ts's isEligibleForFollowUp) -
// once the customer replies, Zendesk moves the ticket off "pending"
// automatically, which is the actual stop signal; these tags are purely
// per-stage idempotency guards.
export const FOLLOW_UP_1_SENT_TAG = "private_event_followup_1_sent";
export const FOLLOW_UP_2_SENT_TAG = "private_event_followup_2_sent";
export const FOLLOW_UP_3_SENT_TAG = "private_event_followup_3_sent";

export const env = {
  zendesk: {
    subdomain: required("ZENDESK_SUBDOMAIN"),
    email: required("ZENDESK_EMAIL"),
    apiToken: required("ZENDESK_API_TOKEN"),
  },
  webhookSecret: process.env.ZENDESK_WEBHOOK_SECRET ?? "",
  ai: {
    apiKey: required("ANTHROPIC_API_KEY"),
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
  },
  mode: (process.env.MODE === "auto" ? "auto" : "draft") as Mode,
  brand: process.env.BRAND ?? "painting_and_vino",
  port: Number(process.env.PORT ?? 3000),
};
