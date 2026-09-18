// Literal templates for the private event "no response" follow-up
// sequence (see src/followups.ts), verbatim from Christopher 2026-09-18 -
// do not paraphrase or restructure these, only fill in the placeholders,
// same rule as every other literal macro template in this codebase (the
// Fundraiser/Kiddos/Standard templates in config/knowledge-base/shared.md).
//
// Unlike the AI-drafted knowledge base templates, these are NOT run through
// the AI at all - they're fixed text the poller sends directly, the same
// way LICENSEE_INITIAL_RESPONSE_TEXT (config.ts) is a fixed mechanical
// reply. That's deliberate: a "did you get my email" nudge and a
// re-engagement email with a discount code shouldn't vary ticket to ticket.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wraps an array of paragraph strings (may contain inline HTML like <a> or <br>) into a full HTML body. */
function wrapHtml(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${p}</p>`).join("\n");
}

/**
 * Email 1 - sent 24h after the quote if the ticket is still pending with no
 * customer reply. Plain text (no links), sent via postComment's regular
 * `body`, not `htmlBody` - matches the original exactly.
 */
export function renderEmail1(): string {
  return [
    "Greetings,",
    "",
    "I wanted to follow up on the painting party quote I sent yesterday. With so many emails getting caught in spam filters these days, I just wanted to make sure it reached you.",
    "",
    "If you could reply with a quick confirmation that it landed safely, I’d really appreciate it.",
    "",
    "I realize you may still be reviewing the details, so I’ll follow up with you tomorrow in case you have any questions or would like to hop on a call to discuss your party ideas.",
    "",
    "Have a lovely day,",
    "Bonnie Davila",
    "Private Event Coordinator",
    "Painting & Vino",
  ].join("\n");
}

const EVENT_PHOTO_LINK = "https://drive.google.com/file/d/1PkxRYTy2kNuD0c8178QG3kX43kkUrCH4/view?usp=sharing";

/**
 * Email 2 - sent 72h after the quote if still pending with no reply. Two
 * variants picked by the poller from the ticket's eventCategory tag
 * (corporate vs everything else - see renderEmail2 below). Sent as HTML
 * (`htmlBody`) so the "CLICK HERE..." / "HERE IS ANOTHER..." links are
 * actually clickable, which a plain-text Zendesk comment can't do.
 */
function renderEmail2Corporate(firstName: string): string {
  const name = escapeHtml(firstName);
  return wrapHtml([
    `Hi ${name},`,
    "I sent you a text or called if it was a landline/office phone about your party quote. Did you get it? I wanted to follow up on my previous message and see if you might be interested in planning an unforgettable experience with us! Whether it’s for your clients, your team, or your community, we specialize in creating unique events that bring people together in fun, meaningful ways.",
    "We’ve had the pleasure of working with amazing organizations like Facebook, Google, Qualcomm, US Navy, USC, Scripps La Jolla - and many more—helping them elevate everything from team outings to client appreciation events.",
    "Here’s what a few of our happy clients have said:",
    '“We had so much fun. The instructor was great and easy to follow along with. We will be attending another event because we had so much fun.”<br>— Amanda D.',
    '“I had an amazing experience with my co-workers at our private Paint &amp; Sip event. I am not a painter at all, but Nataly was amazing at helping us all become Picasso\'s. I loved every minute of it. Looking forward to booking another session with my family.”<br>— Jodi Chastain',
    "If you are hesitant due to budget restrictions let us know what you are thinking. We do have shorter projects on smaller canvases and will do our best to work with any budget.",
    "We’d love the chance to bring the same energy and creativity to your next event. Do you have 15 minutes this week or next to chat about options?",
    `<a href="${EVENT_PHOTO_LINK}">CLICK HERE TO SEE ANOTHER FUN PIC FROM AN EVENT</a>`,
    "Looking forward to hearing from you!",
    "Warm regards,<br>Bonnie Davila<br>Private Event Coordinator<br>Painting & Vino",
  ]);
}

function renderEmail2Standard(firstName: string): string {
  const name = escapeHtml(firstName);
  return wrapHtml([
    `Hi ${name},`,
    "I sent you a text about your party quote. Did you get it? Just wanted to follow up to lock in plans for your celebration — whether it’s a birthday, bachelorette party, girls’ night, or something else fun you’ve got coming up - let us help make it extra memorable!",
    "Painting and Vino specializes in fun, creative experiences that bring people together. Whether you're toasting a bride-to-be or just getting the gang together for a night out, we make it easy to relax, sip, and get artsy with your favorite people.",
    "Here’s what a few of our guests had to say:",
    '“We had so much fun. The instructor was great and easy to follow along with. We will be attending another event because we had so much fun.”<br>— Amanda D.',
    '“Erin is the absolute best! I have used her for soccer team bonding, volleyball team bonding and birthday parties. She is so good with the kids. Also, she is very good at communication and so pleasant to work with. I would highly recommend her.”<br>— Stacie Wilson',
    "Let us know if you are working with a specific budget — we offer smaller canvas options and shorter sessions, and are happy to work with you so we can create something that fits your needs.",
    "When would be a good time to set up a quick 15-minute chat this week so we can lock in your special occasion?",
    `<a href="${EVENT_PHOTO_LINK}">HERE IS ANOTHER FUN PARTY PIC LINK</a>`,
    "Warm regards,<br>Bonnie Davila<br>Private Event Coordinator<br>Painting & Vino",
  ]);
}

/**
 * `category` is DraftResult.eventCategory as tagged at quote time
 * (fundraiser | kiddos | standard | corporate). Only "corporate" gets the
 * Corporate variant - fundraiser and kiddos use the Standard/personal
 * variant, matching shared.md's own Step 1 classification (a fundraiser or
 * a kids' party is a personal/community event, not a business inquiry) -
 * Christopher only gave two variants (Corporate vs "any other quote"), so
 * this is the natural mapping, but flag it to him if fundraisers/kiddos
 * should ever get their own wording.
 */
export function renderEmail2(firstName: string, category: "fundraiser" | "kiddos" | "standard" | "corporate"): string {
  return category === "corporate" ? renderEmail2Corporate(firstName) : renderEmail2Standard(firstName);
}

/**
 * Email 3 - sent 120h after the quote if still pending with no reply. Also
 * solves the ticket (see followups.ts). Sent as HTML for the calendar
 * link. `locationName`/`locationCalendarLink` come from the location tag
 * applied at quote time (see config.ts's PRIVATE_EVENT_LOCATION_TAG_PREFIX)
 * - if that location has no public calendar link on file (e.g. Phoenix,
 * Chattanooga - see locations.yaml's FLAGGED note) or no location was ever
 * matched, falls back to a generic line rather than guessing a link or
 * dumping all 9 city links (Christopher gave the original all-9-links
 * version; a per-ticket single link is what he asked to switch to
 * 2026-09-18, this is the fallback for when we don't have one).
 */
export function renderEmail3(promoCode: string, locationName: string | null, locationCalendarLink: string | null): string {
  const browseLine =
    locationName && locationCalendarLink
      ? `Browse upcoming events in ${escapeHtml(locationName)} and choose the date that works best for you:<br>🎨 <a href="${locationCalendarLink}">${escapeHtml(locationName)}</a>`
      : "Browse upcoming events and choose the date that works best for you at <a href=\"https://paintingandvino.com/\">paintingandvino.com</a>.";

  return wrapHtml([
    "We know life gets busy, and sometimes plans (or schedules!) don’t line up perfectly. 😊",
    "Since we haven’t connected about your private event, we wanted to send a little something your way — because we’d still love you to experience one of our upcoming Painting & Vino events!",
    `Come experience the fun, creativity, and connection for yourself with $10 off your ticket.<br>Use code: <strong>${escapeHtml(promoCode)}</strong>`,
    browseLine,
    "We’d love for you to join us, relax, sip, create, and see why our guests keep coming back! 🍷🖌️ If you decide to book a private party down the road simply respond to this email.",
    "Your $10 off code is valid for 30 days and can be used for public events (not valid for private parties or fundraisers).<br>Hope to paint with you soon!",
    "Stay Colorful! 🎨<br>Bonnie",
  ]);
}
