// Clarifying first responses for private-event inquiries whose FOCUS or
// LOCATION we can't determine from the inquiry itself.
//
// Christopher, 2026-09-25: "When someone sends the inquiry, but you are
// unsure what the focus of the event is (Corporate team building,
// Birthday, Community, etc) you should send a followup asking what the
// focus of the event is. Same with location. If you are unsure there
// should be an initial response asking and then once you find that out you
// can send the appropriate inquiry response. I noticed a couple Corporate
// Team building parties were sent the general response because it was not
// clear what the focus of the party was."
//
// Real tickets behind this: #81236 (body says "company holiday party",
// quoted as standard), #81211 ("Family birthday party", ages 9 to 69 -
// genuinely ambiguous), #81301 (no location match, quoted as standard).
// The cause was classifyPrivateEvent falling through to "standard"
// whenever nothing matched, so ambiguous and genuinely-standard inquiries
// were indistinguishable. It now returns null for "unclear" and this is
// what we send instead.
//
// Copy approved verbatim by Christopher, 2026-09-25 - do not reword
// without asking.

import { getFirstName } from "./private-event-quotes.js";
import type { TicketContext } from "./types.js";

export type ClarifierKind = "focus" | "location" | "both";

const SERVED_CITIES = [
  "Tucson, AZ",
  "Los Angeles, CA",
  "Orange County, CA",
  "Riverside County, CA",
  "San Diego County, CA",
  "Sacramento, CA",
  "San Francisco Bay Area, CA",
  "Kansas City, MO",
].join(" \u00b7 ");

const FOCUS_OPTIONS = [
  "Corporate or team building \u2014 staff, office, or company event",
  "Birthday or celebration \u2014 bachelorette, bridal shower, anniversary, or a get-together",
  "Kids party \u2014 a younger group",
  "Fundraiser \u2014 school, nonprofit, or charity",
];

const SIGN_OFF = ["Cheers,", "", "Bonnie Davila", "Private Event Coordinator, Painting & Vino"];

const OPENING = (first: string) => [
  `Hi ${first},`,
  "",
  "Thanks so much for reaching out about a private paint party with Painting and Vino \u2014 we'd love to host your group!",
  "",
];

const LOCATION_TAIL = [
  SERVED_CITIES,
  "",
  "If your desired location sits a little outside one of those, just tell me the city and I'll check what we can do \u2014 we do travel, and a travel fee may apply.",
  "",
];

export interface RenderedClarifier {
  kind: ClarifierKind;
  plainBody: string;
  htmlBody: string;
}

function focusLines(): string[] {
  return [
    "Before I put your quote together, one quick question: what's the occasion? We tailor the event a little differently depending on the focus, so it helps to know whether you're thinking:",
    "",
    ...FOCUS_OPTIONS.map((o) => `- ${o}`),
    "",
    "Just reply with whichever fits best, along with anything else you'd like us to know, and I'll send over exact pricing and next steps right away.",
    "",
  ];
}

function locationLines(): string[] {
  return [
    "One quick thing before I send your quote: what city will your event be in? Pricing and artist availability vary by region, so I want to be sure I send you the right numbers. We currently serve:",
    "",
    ...LOCATION_TAIL,
    "Reply with the city (and the venue if you have one in mind) and I'll get your quote right over.",
    "",
  ];
}

function bothLines(): string[] {
  return [
    "Before I put your quote together, two quick questions:",
    "",
    "1. What's the occasion? We tailor the event a little differently depending on the focus:",
    "",
    ...FOCUS_OPTIONS.map((o) => `- ${o}`),
    "",
    "2. What city will your event be in? We currently serve:",
    "",
    ...LOCATION_TAIL,
    "Reply with both, along with anything else you'd like us to know, and I'll send over exact pricing and next steps right away.",
    "",
  ];
}

/** Renders the clarifying first response. No links, so the plain and HTML bodies carry the same words. */
export function renderClarifier(ctx: TicketContext, kind: ClarifierKind): RenderedClarifier {
  const first = getFirstName(ctx);
  const body = kind === "focus" ? focusLines() : kind === "location" ? locationLines() : bothLines();
  const lines = [...OPENING(first), ...body, ...SIGN_OFF];
  return { kind, plainBody: lines.join("\n"), htmlBody: toHtml(lines) };
}

/** Bullet runs become a <ul>; everything else becomes a <p>. Blank lines are separators. */
function toHtml(lines: string[]): string {
  const out: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(`<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`);
      bullets = [];
    }
  };
  for (const line of lines) {
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (line.trim() !== "") out.push(`<p>${escapeHtml(line)}</p>`);
  }
  flush();
  return out.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
