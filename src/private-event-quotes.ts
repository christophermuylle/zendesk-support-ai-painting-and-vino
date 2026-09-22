// Mechanical (non-AI) private-event quote templates for Painting and Vino.
// Triggered by the "private_event_quote" rule action (config/rules.yaml's
// event_booking_question rule) and rendered in the "private_event_quote"
// branch of src/pipeline.ts - no AI call, deterministic keyword
// classification + a literal template.
//
// REPLACES the AI-drafted approach event_booking_question used from
// 2026-09-18 (action: pending, bypass_draft_mode_for_auto_send: true,
// gated on the AI's own "high" confidence - see git history for
// ai.ts/pipeline.ts's old autoSendEligible logic). Christopher, 2026-09-22:
// "I don't want AI draft pending review. We want you to answer the quotes
// automatically with templates I already provided. Then do the follow up
// emails as trained." The AI-confidence gate was a real reliability gap -
// a quote could silently fall back to an internal note nobody reviewed
// (see ticket #81174) whenever the AI wasn't "highly confident," which
// defeated the whole point of auto-sending. A deterministic template has
// no confidence to be low about, so it always sends.
//
// "already provided" here means the structure, pricing tables, minimums,
// and venue links already written out in config/knowledge-base/shared.md's
// "Private events" section and each location file's own "Private events"
// section, which is itself sourced from the team's real Zendesk macros
// (see shared.md's header). The exact wording of each template below is
// mine, following that structure and the shape described against
// reference ticket #81048 (Tucson, corporate team-building quote) - not a
// verbatim paste, since PV's knowledge base gives a checklist/shape rather
// than word-for-word template text the way Christopher pasted for Wine
// and Canvas. Flag any wording he wants changed once he reviews the
// rendered previews. The follow-up sequence infrastructure this plugs
// into (src/followups.ts, src/followup-templates.ts, src/promo-codes.ts)
// predates this file and is unchanged - only the "how does the initial
// quote get written and sent" step changes here.
//
// Four categories, same as Wine and Canvas: corporate, standard, kids,
// fundraiser. IMPORTANT DIFFERENCE from Wine and Canvas's classifier:
// for Painting and Vino, adult birthdays/bachelorette parties/bridal
// showers are explicitly documented as STANDARD private events (see every
// location file's "Private events" section), while "Kids' events" is a
// separate, distinctly-priced category for children's parties (ages 6+).
// So unlike Wine and Canvas, a bare "birthday" mention does NOT default to
// the kids template here - see KIDS_KEYWORDS below.

import type { TicketContext, PrivateEventCategory } from "./types.js";
import { getTicketMatchText } from "./util.js";

// PrivateEventCategory ("fundraiser" | "kiddos" | "standard" | "corporate")
// lives in types.ts, not here - it predates this file (originally used to
// tag the AI's own drafted-quote category before quotes moved off the AI
// entirely, see rules.yaml's event_booking_question history) and is still
// the type followups.ts/followup-templates.ts key off of, so this file
// imports it rather than declaring a second, parallel definition.

// ---------------------------------------------------------------------------
// Classification - keyword-matched against the ticket subject + latest
// customer message, NOT AI-classified (Christopher, 2026-09-22: "I don't
// want AI draft pending review... answer the quotes automatically").
//
// Priority when more than one set matches: kids > fundraiser > corporate >
// standard - same ordering assumption as Wine and Canvas's classifier,
// not something Christopher specified for this brand either. Confirm with
// him if a real ticket ever gets misclassified because of it.
// ---------------------------------------------------------------------------

// Matches shared.md's own wording for what reads as a company/work event:
// "mentions a company name, 'team', 'corporate', 'work', 'coworkers', etc."
const CORPORATE_KEYWORDS = [
  "corporate",
  "company",
  "team building",
  "team bonding",
  "coworkers",
  "co-workers",
  "staff",
  "office",
  "employees",
  "work event",
  "work party",
];

const FUNDRAISER_KEYWORDS = ["fundraiser", "charity", "nonprofit", "non-profit", "rescue", "donate", "donation", "cause"];

// Deliberately NOT including a bare "birthday" - see the file header note.
// PV's "Kids' events" are ages 6+ children's parties, distinct from adult
// birthdays (which are a standard private event here). Needs an explicit
// child signal or a young-age mention.
const KIDS_KEYWORDS = [
  "kids party",
  "kid's party",
  "kids' party",
  "children's party",
  "childrens party",
  "kids birthday",
  "kid's birthday",
  "children's birthday",
  "childrens birthday",
  "my son",
  "my daughter",
  "for my kids",
  "for the kids",
];

// Catches "turning 8", "8th birthday", "8 year old" for ages 4-12, the
// practical range for a children's party (PV's kids pricing note says
// "ages 6+, adults welcome too" - I'm starting the pattern a little below
// 6 to also catch a slightly-early "turning 5" party inquiry, and capping
// at 12 so a teen/adult milestone birthday isn't miscategorized). Flagging
// this range as my own reasonable default, same as Wine and Canvas's
// analogous age pattern.
const KIDS_AGE_PATTERN = /\b(?:turning\s+)?([4-9]|1[0-2])(?:st|nd|rd|th)?\s*[- ]?(?:years?|yrs?)?[- ]?(?:old\b|birthday\b)/i;

export function classifyPrivateEvent(ctx: TicketContext): PrivateEventCategory {
  const text = getTicketMatchText(ctx);

  if (KIDS_KEYWORDS.some((k) => text.includes(k)) || KIDS_AGE_PATTERN.test(text)) {
    return "kiddos";
  }
  if (FUNDRAISER_KEYWORDS.some((k) => text.includes(k))) {
    return "fundraiser";
  }
  if (CORPORATE_KEYWORDS.some((k) => text.includes(k))) {
    return "corporate";
  }
  return "standard";
}

// ---------------------------------------------------------------------------
// Location/pricing resolution.
//
// Unlike Wine and Canvas, this maps 1:1 to locations.yaml's slugs - no
// further splitting needed, since every PV location that has private-event
// data is already its own slug. Phoenix and Chattanooga are excluded (not
// launched yet - shared.md/locations.yaml both say not to guess pricing or
// venues for them), so a private-event inquiry for those two falls back to
// a human-review internal note instead of auto-sending, same as an
// unmatched location.
// ---------------------------------------------------------------------------

export type PrivateEventLocationKey =
  | "tucson"
  | "los-angeles"
  | "orange-county"
  | "sacramento"
  | "san-diego"
  | "san-francisco-bay"
  | "riverside-county"
  | "kansas-city";

const LAUNCHED_LOCATION_KEYS: ReadonlySet<string> = new Set<PrivateEventLocationKey>([
  "tucson",
  "los-angeles",
  "orange-county",
  "sacramento",
  "san-diego",
  "san-francisco-bay",
  "riverside-county",
  "kansas-city",
]);

/** Returns the location key if this brand's private-event system has pricing for it (the 8 launched locations), or null (Phoenix, Chattanooga, or anything unmatched) - fails safe to human review rather than guessing. */
export function resolvePrivateEventLocationKey(matchedSlug: string): PrivateEventLocationKey | null {
  return LAUNCHED_LOCATION_KEYS.has(matchedSlug) ? (matchedSlug as PrivateEventLocationKey) : null;
}

// ---------------------------------------------------------------------------
// Pricing - from config/knowledge-base/shared.md's "Private events" table
// (confirmed against the team's real Zendesk macros) plus each location's
// own "Private events" section for minimum group size and venue links.
// ---------------------------------------------------------------------------

export interface PricingTierRow {
  range: string; // "8-29", "30-49", "50+"
  pricePerPerson: number;
}

export interface PrivateEventPricing {
  corporateTiers: PricingTierRow[];
  standardTiers: PricingTierRow[];
  /** Per-person rate customers/ticket-buyers pay at a fundraiser event; Painting and Vino keeps fundraiserRetail - 5, the $5 difference goes to the cause (the group can raise the retail rate above this to raise more). */
  fundraiserRetail: number;
  /** Flat per-person rate for the Kids' events template (no group-size tiers given for kids - shared.md states one flat rate per market). */
  kidsPricePerPerson: number;
}

// Default tiers - most cities (shared.md's main pricing table).
const DEFAULT_STANDARD_TIERS: PricingTierRow[] = [
  { range: "8-29", pricePerPerson: 45 },
  { range: "30-49", pricePerPerson: 40 },
  { range: "50+", pricePerPerson: 35 },
];
const DEFAULT_CORPORATE_TIERS: PricingTierRow[] = [
  { range: "8-29", pricePerPerson: 50 },
  { range: "30-49", pricePerPerson: 45 },
  { range: "50+", pricePerPerson: 40 },
];
// Kansas City runs its own lower tier (shared.md, confirmed explicitly).
const KANSAS_CITY_STANDARD_TIERS: PricingTierRow[] = [
  { range: "8-29", pricePerPerson: 39 },
  { range: "30-49", pricePerPerson: 35 },
  { range: "50+", pricePerPerson: 30 },
];
const KANSAS_CITY_CORPORATE_TIERS: PricingTierRow[] = [
  { range: "8-29", pricePerPerson: 44 },
  { range: "30-49", pricePerPerson: 40 },
  { range: "50+", pricePerPerson: 35 },
];

// Fundraiser retail = the location's 8-29 standard tier rate (the "retail
// rate" shared.md refers to) - PV keeps retail-5, donates $5/ticket to the
// cause by default. Same simplification Wine and Canvas's build used:
// quote the base tier rather than parsing an exact guest count.
const DEFAULT_FUNDRAISER_RETAIL = DEFAULT_STANDARD_TIERS[0].pricePerPerson; // 45
const KANSAS_CITY_FUNDRAISER_RETAIL = KANSAS_CITY_STANDARD_TIERS[0].pricePerPerson; // 39
const FUNDRAISER_DISCOUNT = 5;

// Kids' events flat per-person rate: "$35/person for most cities, $29/
// person in Kansas City, $40/person in San Francisco" (shared.md).
const KIDS_DEFAULT_PRICE = 35;
const KIDS_KANSAS_CITY_PRICE = 29;
const KIDS_SAN_FRANCISCO_BAY_PRICE = 40;

// Minimum group size: 8 default, 10 for Tucson/Sacramento/San Francisco Bay
// (each confirmed in that location's own file). Fundraisers have their own
// company-wide 12-person minimum (shared.md's "Other formats" note) that
// overrides the location's usual minimum - see FUNDRAISER_MINIMUM below.
const DEFAULT_MINIMUM_GROUP_SIZE = 8;
const HIGHER_MINIMUM_LOCATIONS: ReadonlySet<PrivateEventLocationKey> = new Set(["tucson", "sacramento", "san-francisco-bay"]);
const HIGHER_MINIMUM_GROUP_SIZE = 10;
const FUNDRAISER_MINIMUM_GROUP_SIZE = 12;

export interface VenueLink {
  label: string;
  url: string;
}

export interface PrivateEventLocationInfo {
  displayName: string;
  /** Venue/restaurant partner list link(s) for this city - Tucson has two (a restaurant list and a separate pricing/project list); Orange County and San Diego have none on file. Rendered as real hyperlinks with a descriptive label, never a raw URL. */
  venueLinks: VenueLink[];
  pricing: PrivateEventPricing;
  minimumGroupSize: number;
}

// Real links, from each location's own knowledge-base file (config/
// knowledge-base/locations/*.md's "Venues"/"Private events" sections).
const KANSAS_CITY_VENUE_LIST = "https://drive.google.com/file/d/18KzW9OAIjSl9xBfU9HNxa94BkYVfcAbU/view?usp=sharing";
const LOS_ANGELES_VENUE_LIST = "https://drive.google.com/file/d/1doScHbxiC546AQsrZoD5L3h2S2Nwo2Xy/view?usp=sharing";
const RIVERSIDE_COUNTY_VENUE_LIST = "https://drive.google.com/file/d/1VzVqrKgYp0RuGr-hEm3fsFRCt4JNK0Zr/view?usp=sharing";
const SACRAMENTO_VENUE_LIST = "https://drive.google.com/file/d/150NGoWBPzLopJ89S0SQKpOWkFEisYixb/view?usp=sharing";
const SAN_FRANCISCO_BAY_VENUE_LIST = "https://drive.google.com/file/d/1hw8ah1CYraxxCEsVWSLwuuGoUb5pyKIU/view?usp=sharing";
const TUCSON_RESTAURANT_LIST = "https://drive.google.com/file/d/1YDn5lf_T0NpqyzToFZU5em7SOKjqa1mF/view?usp=sharing";
const TUCSON_PRICING_PROJECT_LIST = "https://drive.google.com/file/d/1bNQ26jfKvNsl8kQuSJWrg0jv6qTp6iJr/view?usp=sharing";

export const PRIVATE_EVENT_LOCATIONS: Record<PrivateEventLocationKey, PrivateEventLocationInfo> = {
  tucson: {
    displayName: "Tucson, AZ",
    venueLinks: [
      { label: "Tucson Restaurant List Link", url: TUCSON_RESTAURANT_LIST },
      { label: "Tucson Pricing/Project List Link", url: TUCSON_PRICING_PROJECT_LIST },
    ],
    pricing: {
      corporateTiers: DEFAULT_CORPORATE_TIERS,
      standardTiers: DEFAULT_STANDARD_TIERS,
      fundraiserRetail: DEFAULT_FUNDRAISER_RETAIL,
      kidsPricePerPerson: KIDS_DEFAULT_PRICE,
    },
    minimumGroupSize: HIGHER_MINIMUM_GROUP_SIZE,
  },
  "los-angeles": {
    displayName: "Los Angeles, CA",
    venueLinks: [{ label: "Los Angeles Venue List Link", url: LOS_ANGELES_VENUE_LIST }],
    pricing: {
      corporateTiers: DEFAULT_CORPORATE_TIERS,
      standardTiers: DEFAULT_STANDARD_TIERS,
      fundraiserRetail: DEFAULT_FUNDRAISER_RETAIL,
      kidsPricePerPerson: KIDS_DEFAULT_PRICE,
    },
    minimumGroupSize: DEFAULT_MINIMUM_GROUP_SIZE,
  },
  "orange-county": {
    displayName: "Orange County, CA",
    // No dedicated venue list on file (orange-county.md: "if the customer
    // needs a venue, say we'll send a list of partners once we confirm
    // which artist is available" - the fallback line is in the render
    // function, not invented here as a link).
    venueLinks: [],
    pricing: {
      corporateTiers: DEFAULT_CORPORATE_TIERS,
      standardTiers: DEFAULT_STANDARD_TIERS,
      fundraiserRetail: DEFAULT_FUNDRAISER_RETAIL,
      kidsPricePerPerson: KIDS_DEFAULT_PRICE,
    },
    minimumGroupSize: DEFAULT_MINIMUM_GROUP_SIZE,
  },
  sacramento: {
    displayName: "Sacramento, CA",
    venueLinks: [{ label: "Sacramento Venue List Link", url: SACRAMENTO_VENUE_LIST }],
    pricing: {
      corporateTiers: DEFAULT_CORPORATE_TIERS,
      standardTiers: DEFAULT_STANDARD_TIERS,
      fundraiserRetail: DEFAULT_FUNDRAISER_RETAIL,
      kidsPricePerPerson: KIDS_DEFAULT_PRICE,
    },
    minimumGroupSize: HIGHER_MINIMUM_GROUP_SIZE,
  },
  "san-diego": {
    displayName: "San Diego, CA",
    // No dedicated venue list on file (san-diego.md - same fallback-line
    // treatment as Orange County).
    venueLinks: [],
    pricing: {
      corporateTiers: DEFAULT_CORPORATE_TIERS,
      standardTiers: DEFAULT_STANDARD_TIERS,
      fundraiserRetail: DEFAULT_FUNDRAISER_RETAIL,
      kidsPricePerPerson: KIDS_DEFAULT_PRICE,
    },
    minimumGroupSize: DEFAULT_MINIMUM_GROUP_SIZE,
  },
  "san-francisco-bay": {
    displayName: "San Francisco Bay Area, CA",
    venueLinks: [{ label: "San Francisco Bay Area Venue List Link", url: SAN_FRANCISCO_BAY_VENUE_LIST }],
    pricing: {
      corporateTiers: DEFAULT_CORPORATE_TIERS,
      standardTiers: DEFAULT_STANDARD_TIERS,
      fundraiserRetail: DEFAULT_FUNDRAISER_RETAIL,
      kidsPricePerPerson: KIDS_SAN_FRANCISCO_BAY_PRICE,
    },
    minimumGroupSize: HIGHER_MINIMUM_GROUP_SIZE,
  },
  "riverside-county": {
    displayName: "Riverside County, CA",
    venueLinks: [{ label: "Riverside County Venue List Link", url: RIVERSIDE_COUNTY_VENUE_LIST }],
    pricing: {
      corporateTiers: DEFAULT_CORPORATE_TIERS,
      standardTiers: DEFAULT_STANDARD_TIERS,
      fundraiserRetail: DEFAULT_FUNDRAISER_RETAIL,
      kidsPricePerPerson: KIDS_DEFAULT_PRICE,
    },
    minimumGroupSize: DEFAULT_MINIMUM_GROUP_SIZE,
  },
  "kansas-city": {
    displayName: "Kansas City, MO",
    venueLinks: [{ label: "Kansas City Venue List Link", url: KANSAS_CITY_VENUE_LIST }],
    pricing: {
      corporateTiers: KANSAS_CITY_CORPORATE_TIERS,
      standardTiers: KANSAS_CITY_STANDARD_TIERS,
      fundraiserRetail: KANSAS_CITY_FUNDRAISER_RETAIL,
      kidsPricePerPerson: KIDS_KANSAS_CITY_PRICE,
    },
    minimumGroupSize: DEFAULT_MINIMUM_GROUP_SIZE,
  },
};

export function getLocationInfo(key: PrivateEventLocationKey): PrivateEventLocationInfo {
  return PRIVATE_EVENT_LOCATIONS[key];
}

/** The minimum group size to quote for a given category at this location - fundraisers use the company-wide 12-person minimum regardless of location. */
export function minimumGroupSizeFor(loc: PrivateEventLocationInfo, category: PrivateEventCategory): number {
  return category === "fundraiser" ? FUNDRAISER_MINIMUM_GROUP_SIZE : loc.minimumGroupSize;
}

// ---------------------------------------------------------------------------
// Template rendering.
// ---------------------------------------------------------------------------

/** First name for the "Hi [First Name]," greeting - falls back to "there" if we only have a full name or nothing. */
export function getFirstName(ctx: TicketContext): string {
  const name = ctx.requester?.name?.trim();
  if (!name) return "there";
  return name.split(/\s+/)[0];
}

export interface RenderedQuote {
  category: PrivateEventCategory;
  locationKey: PrivateEventLocationKey;
  /** Plain-text version (used for the internal-review note, and as Zendesk's non-HTML comment.body fallback). */
  plainBody: string;
  /** HTML version with real <a href> hyperlinks. */
  htmlBody: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function joinLines(lines: Array<string | null | undefined>): string {
  return lines.filter((l): l is string => l !== null && l !== undefined).join("\n");
}

/** "Here's our partner venue list for Tucson, AZ — most don't charge extra beyond food and beverage costs per person." or the no-list-on-file fallback (never an invented link) - shared across all four templates. */
function venueOfferLines(loc: PrivateEventLocationInfo): Array<string | null> {
  if (loc.venueLinks.length === 0) {
    return [
      `Need a space? We'll send a list of partner venues once we confirm which artist is available for your date, rather than guessing at one now.`,
    ];
  }
  return [
    `Need a space? Here's our partner venue list for ${loc.displayName} — most don't charge for use of the space, but they do expect everyone to order food and drinks during the event.`,
    ...loc.venueLinks.map((l) => `${l.label}: ${l.url}`),
  ];
}

function venueLinksFor(loc: PrivateEventLocationInfo): VenueLink[] {
  return loc.venueLinks;
}

function toHtml(plainBody: string, links: VenueLink[]): string {
  const escaped = escapeHtml(plainBody);
  let html = escaped.replace(/\n/g, "<br>\n");
  for (const { label, url } of links) {
    const escapedLabel = escapeHtml(label);
    const escapedUrl = escapeHtml(url);
    const pattern = `${escapedLabel}: ${escapedUrl}`;
    html = html.split(pattern).join(`<a href="${escapedUrl}">${escapedLabel}</a>`);
  }
  return `<p>${html}</p>`;
}

const SIGN_OFF = ["Cheers,", "", "Bonnie Davila", "Private Event Coordinator, Painting & Vino"];

export function renderPrivateEventQuote(
  ctx: TicketContext,
  category: PrivateEventCategory,
  locationKey: PrivateEventLocationKey
): RenderedQuote {
  const loc = getLocationInfo(locationKey);
  const firstName = getFirstName(ctx);

  switch (category) {
    case "corporate":
      return renderCorporateOrStandard(loc, locationKey, firstName, "corporate");
    case "fundraiser":
      return renderFundraiser(loc, locationKey, firstName);
    case "kiddos":
      return renderKids(loc, locationKey, firstName);
    case "standard":
    default:
      return renderCorporateOrStandard(loc, locationKey, firstName, "standard");
  }
}

// Corporate and standard share the same shape (shared.md's numbered
// checklist), differing only in which pricing tier and opening line are
// used - matching how the real macros are described as picking between
// "Private Event Inquiry - Corporate/Business Quote" vs "...Standard
// Quote" based on the same underlying info.
function renderCorporateOrStandard(
  loc: PrivateEventLocationInfo,
  locationKey: PrivateEventLocationKey,
  firstName: string,
  category: "corporate" | "standard"
): RenderedQuote {
  const tiers = category === "corporate" ? loc.pricing.corporateTiers : loc.pricing.standardTiers;
  const minimum = minimumGroupSizeFor(loc, category);
  const opener =
    category === "corporate"
      ? `Thank you for reaching out about a corporate event with Painting and Vino — we'd love to help make it a memorable one for your team!`
      : `What a fun occasion to plan for — thank you for reaching out about a private Painting and Vino event!`;

  const plainBody = joinLines([
    `Hi ${firstName},`,
    ``,
    opener,
    ``,
    `We're 100% mobile — we bring everything needed to paint (canvases, easels, aprons, table covers) right to your home, office, or a venue of your choice. You (or your venue) provide the space, tables, and chairs, and you're welcome to serve your own food and drinks.`,
    ``,
    ...venueOfferLines(loc),
    ``,
    `Pricing for ${loc.displayName} (per person, 3-hour event, standard 16x20 canvas):`,
    `Minimum group size: ${minimum} guests`,
    `${tiers.map((t) => `$${t.pricePerPerson}/person (${t.range} guests)`).join(", ")}`,
    `Please note: a travel fee may apply outside the greater city limits — we'll confirm before your date is locked in.`,
    ``,
    `A deposit locks in your date — it covers 2 seats or 20% of your expected headcount, whichever is higher. It's non-refundable but transferable to a future date for up to one year. The remaining balance is due the day before your event. Up to 3 no-shows can still be refunded or credited off the final invoice, as long as your group stays at or above the ${minimum}-guest minimum.`,
    ``,
    `You can choose any painting from our portfolio (we'll send the link once your deposit is in), or go custom for an extra $50-75 flat fee. We also offer other project formats on request — glass painting, board painting, pet portraits (send us photos at least 3 days ahead), and Couples Events — just ask for current pricing.`,
    ``,
    `Ready to lock in your date? Just reply with your preferred date and approximate headcount and I'll check availability right away — dates go fast, especially on weekends!`,
    ``,
    ...SIGN_OFF,
  ]);

  const htmlBody = toHtml(plainBody, venueLinksFor(loc));
  return { category, locationKey, plainBody, htmlBody };
}

function renderFundraiser(loc: PrivateEventLocationInfo, locationKey: PrivateEventLocationKey, firstName: string): RenderedQuote {
  const retail = loc.pricing.fundraiserRetail;
  const keep = retail - FUNDRAISER_DISCOUNT;
  const minimum = FUNDRAISER_MINIMUM_GROUP_SIZE;

  const plainBody = joinLines([
    `Hi ${firstName},`,
    ``,
    `Thank you for reaching out about hosting a Painting and Vino fundraiser — we'd love to help you raise money for your cause!`,
    ``,
    `We're 100% mobile — we bring everything needed to paint (canvases, easels, aprons, table covers) right to your home, office, or a venue of your choice. You (or your venue) provide the space, tables, and chairs, and you're welcome to serve your own food and drinks.`,
    ``,
    ...venueOfferLines(loc),
    ``,
    `Pricing for ${loc.displayName} (per person, 3-hour event, standard 16x20 canvas):`,
    `The group minimum to host a fundraising event is ${minimum} guests.`,
    `Standard rate: $${retail} per person — we keep $${keep}, and $${FUNDRAISER_DISCOUNT} per ticket goes to your cause by default (you're welcome to raise the ticket price above $${retail} to raise more).`,
    `If you're selling tickets to attendees, we'll need a donation receipt with your organization's EIN.`,
    `Please note: a travel fee may apply outside the greater city limits — we'll confirm before your date is locked in.`,
    ``,
    `A deposit locks in your date — it covers 2 seats or 20% of your expected headcount, whichever is higher. It's non-refundable but transferable to a future date for up to one year. The remaining balance is due the day before your event.`,
    ``,
    `You can choose any painting from our portfolio, or go custom for an extra $50-75 flat fee. We also offer other project formats on request — glass painting, board painting, and pet portraits (send us photos at least 3 days ahead, a great option for animal rescues and shelters) — just ask for current pricing.`,
    ``,
    `Ready to lock in your date? Just reply with your preferred date and approximate headcount and I'll check availability right away — dates go fast, especially on weekends!`,
    ``,
    ...SIGN_OFF,
  ]);

  const htmlBody = toHtml(plainBody, venueLinksFor(loc));
  return { category: "fundraiser", locationKey, plainBody, htmlBody };
}

function renderKids(loc: PrivateEventLocationInfo, locationKey: PrivateEventLocationKey, firstName: string): RenderedQuote {
  const price = loc.pricing.kidsPricePerPerson;
  // shared.md doesn't state a separate minimum for Kids' events - using
  // this location's general private-event minimum as a reasonable
  // default (flagged, same as Wine and Canvas's INFERRED pricing notes).
  const minimum = loc.minimumGroupSize;

  const plainBody = joinLines([
    `Hi ${firstName},`,
    ``,
    `Thank you for reaching out about a Painting and Vino kids' event — we'd love to help make it a fun one! Our kids' events are designed for ages 6 and up (adults are welcome to join in too).`,
    ``,
    `We're 100% mobile — we bring everything needed to paint (canvases, easels, aprons, table covers) right to your home, office, or a venue of your choice. You (or your venue) provide the space, tables, and chairs, and you're welcome to serve your own food and drinks (we don't provide food, drinks, or cookies).`,
    ``,
    ...venueOfferLines(loc),
    ``,
    `Pricing for ${loc.displayName}: $${price} per person, minimum group size ${minimum} guests.`,
    `Please note: a travel fee may apply outside the greater city limits — we'll confirm before your date is locked in.`,
    ``,
    `A deposit locks in your date — it covers 2 seats or 20% of your expected headcount, whichever is higher. It's non-refundable but transferable to a future date for up to one year. The remaining balance is due the day before your event.`,
    ``,
    `You can choose any painting from our portfolio (we'll send the link once your deposit is in), or go custom for an extra $50-75 flat fee.`,
    ``,
    `Ready to lock in your date? Just reply with your preferred date and approximate headcount and I'll check availability right away — dates go fast, especially on weekends!`,
    ``,
    ...SIGN_OFF,
  ]);

  const htmlBody = toHtml(plainBody, venueLinksFor(loc));
  return { category: "kiddos", locationKey, plainBody, htmlBody };
}
