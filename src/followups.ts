// Private event "no response" follow-up sequence (Christopher, 2026-09-18):
// three emails, all counted from the SAME anchor - when the original quote
// went out - not from each other:
//   - Email 1 at 24h, if still pending with no customer reply.
//   - Email 2 at 72h (Corporate or Standard variant), same condition.
//   - Email 3 at 120h: includes a one-time $10 promo code. Leaves the
//     ticket PENDING, like the other two.
//
// Christopher, 2026-09-24: "You should never close Private Event tickets
// as closed. Only pending. Let the human solve and close them." Email 3
// used to Solve the ticket as the sequence's end, which is why a batch of
// private-event tickets ended up Solved with no human ever having looked
// at them. Nothing in this file sets any status other than "pending" now;
// the FOLLOW_UP_3_SENT_TAG is what ends the sequence, not the status, so
// a ticket sitting in pending after email 3 is picked up by the sweep,
// matched by nextStage() as all-sent, and skipped without re-sending.
//
// This runs as a periodic sweep (see index.ts's setInterval), NOT off the
// Zendesk ticket-update webhook - unlike every other rule in this codebase,
// "24 hours have now passed" isn't a ticket update Zendesk can notify us
// about, so this has to poll instead.
//
// ANCHOR TIMESTAMP: the "quote sent" moment is taken to be the first PUBLIC
// comment on the ticket authored by someone other than the requester (i.e.
// our own reply, not the customer's original inbound message) - this is a
// reasonable proxy given this rule's architecture (the quote is normally
// the very first agent reply on a fresh ticket) but isn't literally tracked
// as its own field. If an agent ever posts an earlier unrelated public
// reply on a ticket before the quote, this would anchor to the wrong
// comment - worth a dedicated Zendesk custom field storing the actual send
// time if that turns out to matter in practice.

import type { IZendeskClient } from "./zendesk.js";
import type { LocationResolver } from "./locations.js";
import { loadLocationSnippet } from "./config.js";
import {
  PRIVATE_EVENT_QUOTE_SENT_TAG,
  PRIVATE_EVENT_LOCATION_TAG_PREFIX,
  FOLLOW_UP_1_SENT_TAG,
  FOLLOW_UP_2_SENT_TAG,
  FOLLOW_UP_3_SENT_TAG,
} from "./config.js";
import type { PrivateEventCategory } from "./types.js";
import { renderEmail1, renderEmail2, renderEmail3 } from "./followup-templates.js";
import { loadPromoCodeConfig, claimNextCode } from "./promo-codes.js";

const HOURS_STAGE_1 = 24;
const HOURS_STAGE_2 = 72;
const HOURS_STAGE_3 = 120;

export interface FollowUpDeps {
  zendesk: IZendeskClient;
  locations: LocationResolver;
}

export interface FollowUpSweepResult {
  checked: number;
  sent: { stage: 1 | 2 | 3; ticketId: number }[];
  errors: { ticketId: number; error: string }[];
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function firstName(name: string | null | undefined): string {
  if (!name) return "there";
  return name.trim().split(/\s+/)[0] || "there";
}

function eventCategoryFromTags(tags: string[]): PrivateEventCategory | null {
  for (const cat of ["fundraiser", "kiddos", "standard", "corporate"] as const) {
    if (tags.includes(`${PRIVATE_EVENT_QUOTE_SENT_TAG}_${cat}`)) return cat;
  }
  return null;
}

function locationSlugFromTags(tags: string[]): string | null {
  const t = tags.find((tag) => tag.startsWith(PRIVATE_EVENT_LOCATION_TAG_PREFIX));
  return t ? t.slice(PRIVATE_EVENT_LOCATION_TAG_PREFIX.length) : null;
}

/** Extracts the "Direct link: <url>" line already on file in a location's knowledge-base snippet - never invents one. */
function extractCalendarLink(snippet: string): string | null {
  const m = snippet.match(/Direct link:\s*(\S+)/);
  return m ? m[1] : null;
}

/** Which stage (1, 2, or 3) is next for this ticket, or null if all three have already been sent. */
function nextStage(tags: string[]): 1 | 2 | 3 | null {
  if (!tags.includes(FOLLOW_UP_1_SENT_TAG)) return 1;
  if (!tags.includes(FOLLOW_UP_2_SENT_TAG)) return 2;
  if (!tags.includes(FOLLOW_UP_3_SENT_TAG)) return 3;
  return null;
}

type CandidateOutcome = "sent" | "skipped_not_due" | "skipped_not_eligible" | "skipped_all_sent";

async function processCandidate(
  deps: FollowUpDeps,
  ticketId: number
): Promise<{ outcome: CandidateOutcome; stage?: 1 | 2 | 3 }> {
  const ctx = await deps.zendesk.getTicketContext(ticketId);

  // Re-check eligibility for real, even though the search query already
  // filtered on tag+status - a customer reply (which flips status off
  // "pending") or a human editing tags between the search and this fetch
  // should never result in a follow-up firing anyway.
  if (ctx.ticket.status !== "pending") return { outcome: "skipped_not_eligible" };
  const tags = ctx.ticket.tags;
  if (!tags.includes(PRIVATE_EVENT_QUOTE_SENT_TAG)) return { outcome: "skipped_not_eligible" };

  const stage = nextStage(tags);
  if (stage === null) return { outcome: "skipped_all_sent" };

  // The quote itself - see file header note on why "first public comment
  // NOT from the requester" is used as the anchor.
  const quoteComment = ctx.comments.find((c) => c.public && c.author_id !== ctx.ticket.requester_id);
  if (!quoteComment) return { outcome: "skipped_not_eligible" }; // shouldn't happen - we only tag after posting one

  const threshold = stage === 1 ? HOURS_STAGE_1 : stage === 2 ? HOURS_STAGE_2 : HOURS_STAGE_3;
  if (hoursSince(quoteComment.created_at) < threshold) return { outcome: "skipped_not_due" };

  const stageTag = stage === 1 ? FOLLOW_UP_1_SENT_TAG : stage === 2 ? FOLLOW_UP_2_SENT_TAG : FOLLOW_UP_3_SENT_TAG;
  const first = firstName(ctx.requester?.name);

  if (stage === 1) {
    await deps.zendesk.postComment(ticketId, renderEmail1(), {
      isPublic: true,
      status: "pending",
      addTags: [stageTag],
    });
    return { outcome: "sent", stage };
  }

  if (stage === 2) {
    const category = eventCategoryFromTags(tags) ?? "standard";
    await deps.zendesk.postComment(ticketId, "", {
      isPublic: true,
      status: "pending",
      addTags: [stageTag],
      htmlBody: renderEmail2(first, category),
    });
    return { outcome: "sent", stage };
  }

  // Stage 3 - needs a promo code from the Google Sheet before it can send.
  const promoCfg = loadPromoCodeConfig();
  if (!promoCfg) {
    console.error(
      `[followups] ticket ${ticketId}: email 3 is due but the Google Sheets promo code integration isn't configured yet ` +
        `(missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY - see src/promo-codes.ts). ` +
        `Tagging for a human to send it manually instead of blocking the whole sweep.`
    );
    await deps.zendesk.updateTicket(ticketId, { addTags: ["needs_human", `${stageTag}_needs_manual_code`] });
    return { outcome: "skipped_not_eligible" };
  }

  const code = await claimNextCode(promoCfg);
  if (!code) {
    console.error(
      `[followups] ticket ${ticketId}: email 3 is due but the promo code pool is EMPTY. Tagging for a human - ` +
        `Christopher needs to add more codes to the sheet.`
    );
    await deps.zendesk.updateTicket(ticketId, { addTags: ["needs_human", `${stageTag}_needs_manual_code`] });
    return { outcome: "skipped_not_eligible" };
  }

  const slug = locationSlugFromTags(tags);
  const loc = slug ? deps.locations.getBySlug(slug) : null;
  const snippet = loc ? loadLocationSnippet(loc.file) : null;
  const calendarLink = snippet ? extractCalendarLink(snippet) : null;

  await deps.zendesk.postComment(ticketId, "", {
    isPublic: true,
    // Pending, never "solve" - see the Christopher 2026-09-24 note in this
    // file's header. A human solves and closes private-event tickets.
    status: "pending",
    addTags: [stageTag],
    htmlBody: renderEmail3(code, loc?.displayName ?? null, calendarLink),
  });
  return { outcome: "sent", stage };
}

/**
 * Runs one sweep: finds every still-pending, quoted private-event ticket
 * and sends whichever follow-up (if any) is now due. Safe to call
 * repeatedly/concurrently-in-spirit (each stage's tag is the idempotency
 * guard - a ticket already at stage N never re-sends stage N).
 */
export async function runFollowUpSweep(deps: FollowUpDeps): Promise<FollowUpSweepResult> {
  const candidateIds = await deps.zendesk.searchTicketIds(
    `type:ticket status:pending tags:${PRIVATE_EVENT_QUOTE_SENT_TAG}`
  );

  const result: FollowUpSweepResult = { checked: candidateIds.length, sent: [], errors: [] };
  for (const ticketId of candidateIds) {
    try {
      const { outcome, stage } = await processCandidate({ zendesk: deps.zendesk, locations: deps.locations }, ticketId);
      if (outcome === "sent" && stage) result.sent.push({ ticketId, stage });
    } catch (err) {
      result.errors.push({ ticketId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
