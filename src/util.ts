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
  const text = `${ctx.ticket.subject ?? ""}\n${latestCustomerMessage?.body ?? ctx.ticket.description ?? ""}`.toLowerCase();
  // Append a state-normalised copy rather than replacing the original, so
  // both spellings are searchable and nothing already matching can break.
  return `${text}\n${withStateAbbreviations(text)}`;
}

// Spelled-out state names, for the normalisation below.
const STATE_NAME_TO_ABBREVIATION: Record<string, string> = {
  indiana: "in",
  michigan: "mi",
  florida: "fl",
  california: "ca",
  arizona: "az",
  missouri: "mo",
  tennessee: "tn",
  ohio: "oh",
  minnesota: "mn",
  nevada: "nv",
};

/**
 * Rewrites "Westfield indiana" and "Westfield, Indiana" to "westfield, in",
 * the form config/locations.yaml's satellite-city keywords are written in.
 *
 * Ticket #29229 (Molly Caulfield, 2026-09-22) is why this exists: her form
 * said "Location: Westfield indiana", the keyword was "westfield, in", so
 * nothing matched, no quote was generated and the whole thing fell to a
 * human. Christopher had to write an internal note reading "Westfield is
 * Northwest, Indianapolis."
 *
 * It matters just as much for the rules engine: an out-of-scope ticket
 * saying "Lansing Michigan" rather than "Lansing, MI" was slipping past
 * out_of_scope_location the same way.
 *
 * The \b word boundary is load-bearing - without it "indianapolis" would
 * be mangled into ", inpolis". A whole-word "indiana" cannot match inside
 * "indianapolis", so the city name survives untouched.
 */
export function withStateAbbreviations(text: string): string {
  let out = text;
  for (const [name, abbreviation] of Object.entries(STATE_NAME_TO_ABBREVIATION)) {
    out = out.replace(new RegExp(String.raw`,?\s*\b${name}\b`, "gi"), `, ${abbreviation}`);
  }
  return out;
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

/**
 * True when an email address looks like one of the brand's own internal
 * or staff mailboxes (e.g. "paintingandvino.noc@gmail.com") rather than a
 * real customer's personal address - i.e. the local part (before the @)
 * starts with the brand's own name. Used to keep the "private_event_quote"
 * pipeline branch from auto-quoting a staff member's own outreach/internal
 * chatter just because it happens to use private-event vocabulary - see
 * PRIVATE_EVENT_INTERNAL_SENDER_PREFIX in src/config.ts for the real
 * ticket this was confirmed against.
 */
export function isInternalBrandSender(
  email: string | null | undefined,
  brandLocalPartPrefix: string,
  brandDomains: readonly string[] = []
): boolean {
  if (!email) return false;
  const [localPart, domain] = email.trim().toLowerCase().split("@");

  // Named-after-the-brand mailboxes, e.g. "paintingandvino.noc@gmail.com".
  if (brandLocalPartPrefix && localPart?.startsWith(brandLocalPartPrefix.toLowerCase())) return true;

  // The brand's OWN domain, e.g. "tucson@paintingandvino.com". Added
  // 2026-09-29 after ticket #81443: a follow-up sent from the Tucson
  // mailbox became its own ticket with that mailbox as the REQUESTER, so
  // the staff member's payment-reminder to a customer was read as a
  // customer inquiry and auto-quoted - addressed "Hi Painting,". The
  // customer on the thread replied "could this auto-reply be turned off?".
  //
  // The local-part check above could never have caught it: the brand name
  // is on the right of the @, not the left. A real customer does not email
  // from the company's own domain.
  if (domain && brandDomains.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`))) {
    return true;
  }
  return false;
}
