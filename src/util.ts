import type { TicketContext, ZendeskComment } from "./types.js";

/**
 * Text used for keyword matching across rules.ts and locations.ts: the
 * ticket subject plus the latest customer message (falling back to the
 * ticket description if there's no comment yet), lowercased.
 *
 * Subject is included because location-specific contact forms often carry
 * the location in the ticket's subject/title rather than the message body.
 */
export function getTicketMatchText(ctx: TicketContext): string {
  const latestCustomerMessage = [...ctx.comments]
    .reverse()
    .find((c) => c.author_id === ctx.ticket.requester_id);
  return `${ctx.ticket.subject ?? ""}\n${latestCustomerMessage?.body ?? ctx.ticket.description ?? ""}`.toLowerCase();
}

/**
 * Extracts the dollar amount from a "Total: $NN.NN" line, as found in the
 * storefront's automated "New order" notification tickets (e.g. Painting
 * and Vino's order-confirmation rule - see src/pipeline.ts). Deliberately
 * matches the standalone word "Total" so it does NOT match "Subtotal:" -
 * `\b` doesn't break between the "b" and "t" of "Subtotal" since both are
 * word characters, so only a line that starts with "Total" matches.
 * The separator between "Total:" and the dollar amount is matched loosely
 * ([\s|]*) since some brands' order emails render this as a markdown
 * table (e.g. "| Total: | $76.00 |"), not just whitespace. Returns null if
 * no such line is found or it doesn't parse as a number.
 */
export function extractOrderTotal(text: string): number | null {
  const match = (text ?? "").match(/\btotal:[\s|]*\$?[\s|]*([\d,]+\.\d{2})/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isNaN(value) ? null : value;
}

/** The most recent comment on a ticket, or null if there are none (shouldn't happen in practice). */
export function getLatestComment(ctx: TicketContext): ZendeskComment | null {
  return ctx.comments.length ? ctx.comments[ctx.comments.length - 1] : null;
}

/**
 * True if a comment's body is basically just a "RECEIVED" confirmation -
 * used by pipeline.ts's licensee_initial_response branch (Christopher,
 * 2026-09-18) to auto-close a licensee application ticket once the
 * applicant confirms our deliverability-check message landed, instead of
 * leaving every one of these for a human to close by hand.
 *
 * Deliberately narrow: the word "received" has to be present AND the whole
 * message has to be short (<= 40 characters after stripping punctuation) -
 * this catches "Received", "received.", "RECEIVED!", "received, thanks"
 * etc., but NOT a longer message that happens to mention "received" in
 * passing (e.g. "I received your email but I actually have a question
 * about my territory") - that should still go to a human, not auto-close.
 */
export function looksLikeReceivedConfirmation(body: string): boolean {
  const cleaned = (body ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.!,;:]/g, "");
  return cleaned.includes("received") && cleaned.length <= 40;
}
