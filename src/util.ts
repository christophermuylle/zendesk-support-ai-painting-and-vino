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
  const latestBody = stripQuotedReply(latestCustomerMessage?.body ?? ctx.ticket.description ?? "");
  const text = `${ctx.ticket.subject ?? ""}\n${latestBody}`.toLowerCase();
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
  brandDomains: readonly string[] = [],
  knownStaffAddresses: readonly string[] = []
): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  const [localPart, domain] = normalised.split("@");

  // Named staff addresses that neither rule below would catch.
  if (knownStaffAddresses.some((a) => a.toLowerCase() === normalised)) return true;

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


// Markers that begin the quoted copy of an earlier email. Kept narrow on
// purpose: the Outlook form requires a "From:" line IMMEDIATELY followed by
// Sent:/To:/Date:, so a customer writing "From: our office we'd like..."
// is not mistaken for a quote header.
const QUOTED_REPLY_MARKERS: RegExp[] = [
  /^[ \t>]*from:[ \t].+\r?\n[ \t>]*(sent|to|date):/im,
  /^[ \t>]*-{2,}\s*original message\s*-{2,}/im,
  /^[ \t>]*on\s.{0,160}\bwrote:\s*$/im,
  /^[ \t>]*_{10,}\s*$/m,
];

/**
 * Drops the quoted history from an email reply, keeping only what the
 * person actually typed this time.
 *
 * Ticket #81500 (Maribeth Grandpre, 2026-09-30) is why this exists. She was
 * already booked and paid, and replied to her own ticket-confirmation email
 * with one line: "Is it possible to change the time to 3:00- 4:30 pm?"
 * Quoted underneath was OUR confirmation, containing "Private painting
 * event with Erin" - and "painting event" is one of
 * event_booking_question's keywords. So our own marketing copy, quoted back
 * to us, was read as a fresh private-event inquiry, and she was asked what
 * the occasion of her event was.
 *
 * Every customer replying to any of our emails carries our words in their
 * quote trail, so this was never going to be a one-off.
 *
 * If there is nothing substantial above the marker the whole text is kept -
 * some people reply underneath the quote, and half a message is worse than
 * a stray keyword.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return text;
  let cut = text.length;
  for (const re of QUOTED_REPLY_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  const head = text.slice(0, cut);
  const kept = head.replace(/^[ \t]*>.*$/gm, "");
  return kept.trim().length >= 20 ? kept : text;
}

/**
 * True when this ticket began as a real private-event form submission.
 *
 * Deliberately reads the ORIGINAL message - the ticket description and the
 * customer's first comment - not the latest one. A customer answering a
 * clarifying question does not repeat the form, and their reply is still
 * part of a form-originated conversation.
 */
export function looksLikePrivateEventFormSubmission(ctx: TicketContext, markers: readonly string[]): boolean {
  if (!markers.length) return false;
  const firstCustomerComment = ctx.comments.find((c) => c.author_id === ctx.ticket.requester_id)?.body ?? "";
  // Whitespace-insensitive on purpose. Zendesk hands us the same form
  // submission two ways - ticket.description keeps the raw "Party Request
  // from  Wine & Canvas" with its DOUBLE space, while the comment body is
  // markdown-normalised to a single one. A plain substring test passes on
  // one and fails on the other, which is exactly the sort of difference
  // that makes a safeguard silently stop safeguarding.
  const text = collapseWhitespace(
    `${ctx.ticket.subject ?? ""} ${ctx.ticket.description ?? ""} ${firstCustomerComment}`
  );
  return markers.every((m) => text.includes(collapseWhitespace(m)));
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The name the customer actually typed on the private-event form.
 *
 * The contact form emails Zendesk from a shared address with the person's
 * real name only in the BODY ("Name: Wendy Fortune"), so Zendesk invents
 * the end-user's name from the email address instead. That is why real
 * quotes went out addressed "Hi Trosand," (#29509, Taylor Rosand) and "Hi
 * Sstinson131313," (#29453, Sandy Madsen) - of 19 private-event tickets
 * audited 2026-09-30, 14 had a user record that disagreed with the name on
 * the form.
 *
 * Returns null when there is no trustworthy name rather than guessing.
 * Deliberately strict about what it accepts: an unrendered form
 * placeholder ("[name]" - the same WordPress bug that keeps sending us
 * "[preferredtime]"), an address, a URL or an implausible length all fall
 * back to the Zendesk record, because greeting someone with junk is worse
 * than greeting them with a clumsy-but-real handle.
 */
export function extractFormContactName(ctx: TicketContext): string | null {
  const firstCustomerComment = ctx.comments.find((c) => c.author_id === ctx.ticket.requester_id)?.body ?? "";
  // Description first: it is the raw form email. The comment body is the
  // markdown-normalised copy of the same thing and is only a fallback.
  for (const source of [ctx.ticket.description ?? "", firstCustomerComment]) {
    const found = extractFormContactNameFromText(source);
    if (found) return found;
  }
  return null;
}

/**
 * The same parse against one blob of text. Split out so the daily digest
 * can name people from a ticket's description alone - search results carry
 * the description but not the requester, and both brands' form subjects are
 * identical on every ticket ("New Private Event Inquiry"), which makes a
 * subject-keyed digest unreadable.
 */
export function extractFormContactNameFromText(source: string): string | null {
  // Shape 1 - Wine and Canvas: "Name: Wendy Fortune" on one line.
  const inline = source.match(/^[ \t>*]*Name[ \t]*:[ \t]*(.+)$/im);
  if (inline) {
    const cleaned = cleanPersonName(inline[1]);
    if (cleaned) return cleaned;
  }
  // Shape 2 - Painting and Vino: the label sits alone on its line and the
  // value follows several blank/tab-only lines later (#81249 "Brenda
  // Nieto" on file as "Bnieto1"; #81445 "Chanel Richardson" as
  // "Crichardson"). Verified against live PV form submissions 2026-09-30;
  // the two shapes are disjoint, so both parsers can run.
  const lines = source.split(/\r?\n/);
  const labelIndex = lines.findIndex((l) => /^[ \t>*]*Name[ \t>*]*$/i.test(l));
  if (labelIndex !== -1) {
    for (let i = labelIndex + 1; i < Math.min(labelIndex + 10, lines.length); i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      // An empty Name field would otherwise hand us "Company Name".
      if (looksLikeFormLabel(raw)) break;
      const cleaned = cleanPersonName(raw);
      if (cleaned) return cleaned;
      break;
    }
  }
  return null;
}

function cleanPersonName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().replace(/[*_,;.]+$/, "").trim();
  return isPlausiblePersonName(name) ? name : null;
}

const FORM_LABELS: ReadonlySet<string> = new Set([
  "name", "company name", "email", "email address", "phone", "phone number", "address",
  "date of event", "time of event", "number of expected guests", "guests", "source page",
  "referral", "preferred date", "preferred time", "additional info", "map it", "location",
]);

function looksLikeFormLabel(line: string): boolean {
  const l = line.replace(/\s+/g, " ").trim().toLowerCase().replace(/[:?]+$/, "");
  if (FORM_LABELS.has(l)) return true;
  // PV's longer questions ("What location do you want to host the event
  // in...?", "How'd you hear about us?") all end in a question mark.
  return line.trim().endsWith("?") || line.trim().endsWith(":");
}

function isPlausiblePersonName(name: string): boolean {
  if (name.length < 2 || name.length > 70) return false;
  if (/^\[.*\]$/.test(name)) return false; // unrendered form placeholder
  if (name.includes("@") || /https?:\/\//i.test(name)) return false;
  if (/[?/|]/.test(name)) return false;
  if (!/\p{L}/u.test(name)) return false;
  if (looksLikeFormLabel(name)) return false;
  return true;
}

/**
 * First name for a "Hi {first}," greeting. Handles the "Last, First"
 * spelling Zendesk sometimes stores (#29218 was on file as "Halpin,
 * Elisa", which a naive split greets as "Hi Halpin,").
 */
export function firstNameFromFullName(full: string | null | undefined): string | null {
  const name = (full ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  const inverted = name.match(/^([^,]+),\s*(.+)$/);
  const ordered = inverted ? inverted[2] : name;
  const first = ordered.trim().split(" ")[0]?.replace(/[^\p{L}\p{M}'-]/gu, "");
  return first && first.length >= 2 ? first : null;
}

/**
 * True when a Zendesk user's name looks like something Zendesk derived
 * from their email address rather than something a person entered - the
 * test for whether it is safe to overwrite with the form name.
 *
 * Conservative on purpose: #28930 is on file as "Hanadya Ale" but signed
 * the form "Hanny Ale". That is a real full name against a nickname, so
 * the greeting uses what she typed while the record keeps the fuller name.
 */
export function looksMachineDerivedName(name: string | null | undefined, email: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  // "Trosand", "Jamkay24", "Mollycaulfield", "Philandlauraturner" - a
  // single run of characters is never how someone types their own name.
  if (!n.includes(" ")) return true;
  const localPart = (email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!localPart) return false;
  return n.toLowerCase().replace(/[^a-z0-9]/g, "") === localPart;
}

const keywordRegexCache = new Map<string, RegExp>();

/**
 * Does `text` contain `keyword` as a whole token, rather than as a fragment
 * of a longer word?
 *
 * Location matching used to be a plain `includes`, which is how the
 * comma-less state variants backfired: "lakeside ca" matched "lakeside
 * cabin", "orange ca" would have matched "orange canvas", and "westfield in"
 * would have matched "westfield inn". Each of those mis-routes a real quote
 * to the wrong market, which for the two-key markets means the wrong PRICE.
 *
 * Boundaries are defined on alphanumerics rather than \b so that keywords
 * carrying punctuation behave predictably - "l.a. county", "opa-locka",
 * "st. johns, mi", "lauderdale-by-the-sea".
 *
 * Note this is deliberately NOT used by the rules engine (src/rules.ts).
 * Rule keywords legitimately rely on substring behaviour - "cancel" is meant
 * to catch "cancellation" - so that matcher needs its own audit before it
 * changes.
 */
export function keywordMatches(text: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  let re = keywordRegexCache.get(k);
  if (!re) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
    keywordRegexCache.set(k, re);
  }
  return re.test(text);
}
