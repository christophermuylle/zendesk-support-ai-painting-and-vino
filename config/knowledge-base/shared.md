# Shared Support Knowledge Base - Painting and Vino

Sources: paintingandvino.com/paint-and-sip-faq/, and the team's actual
Zendesk macros (pulled 2026-09-09) which are what staff use day-to-day -
where the two disagreed, this file follows the macros as the more
authoritative/current source, and the conflict is flagged below for
Christopher to confirm.

> This file is combined with a location-specific file (see
> config/knowledge-base/locations/) for every ticket where a location was
> identified. Put anything true EVERYWHERE here; put pricing exceptions,
> booking links, and venue specifics in the per-location files instead.
>
> The AI answers ONLY from what's written here plus the matched location
> file. If something isn't covered, it falls back to a "let me check"
> reply instead of guessing.

## What we are

Painting and Vino is a mobile (no storefront) paint-and-sip brand.
Licensees run events out of a vehicle/kit rather than a leased studio, and
events are hosted at partner venues that the licensee books into - not
private in-home parties (private/at-home events are a separate paid
option, see below).

## Pricing (default - check the location file for exceptions)

Regular scheduled events are $45 per person. Premium events and
Online/Virtual ("On-Demand") events may be priced differently - check the
specific event listing. 2.5 hours of professional instruction and
materials are included; food and beverages are separate.

## Booking

Select your location, choose a date and painting, then complete
registration with your info and payment. You'll get a confirmation email
with event details shortly after registering (if it's missing, check
spam and add info@paintingandvino.com to contacts - a human can resend it
on request).

New monthly event calendars release and open for registration on the
15th of the month (confirmed by Christopher - this is the current,
accurate cadence company-wide).

To sit together as a group: register everyone under the same name/email
or a shared group name, or email customer service ahead of time to note
it on the registration list.

## VIP Membership

Paid membership program (sign up at paintingandvino.com/vip) that
includes: 2 tickets per month (good for any class, including Premium
Events; no expiration, can be saved up or gifted), reserved seating
without needing to show up early, a red apron marking VIP status (gold
apron for the first 100 members), a free brush set/paint touch-up kit/
canvas hangers, and first access to sold-out class tickets. Guests of a
VIP member get the same VIP treatment for that visit.

## Promo codes, Groupon & BOGO

**BOGO ("Buy One Get One Free"):** pay full price for one seat, the second
seat is free - but the customer must select 2 seats at registration for
the discount to apply automatically.

**Groupon / LivingSocial vouchers:**
- To redeem: enter the voucher's redemption code (the string of letters on
  the voucher, e.g. "GSKJRGBKFDK") in the Discount Code field at checkout.
  Only one code per registration. Alternatively, the customer can email
  the code plus the class name/date and we'll register them manually.
- Groupons/discount vouchers can **only** be used for regular scheduled
  3-hour step-by-step painting events. They may **not** be used for
  Premium Events (pet portraits, poured paint, mixed media, wine glass
  painting, etc.), Private Events, or On-Sale events.
- Expiration: the voucher's promotional value expires based on when
  *registration is completed*, not the event date - so a customer can
  still register for an event happening after the nominal expiration
  date, as long as they complete registration before the voucher expires.
- After the promotional value expires, the voucher keeps its *face value*
  (what the customer actually paid) indefinitely - email us the voucher
  code and we'll activate that face value as store credit. Same
  restrictions apply as any promo code (can't combine with other
  vouchers/codes, must be used for the seat count it was bought for).
- We offer Groupon price-matching without the hassle of an actual Groupon:
  code **NEWVINOGP** at checkout gets the Groupon-equivalent price on a
  regular reservation.

**Other promo codes:** if a code isn't working, first double check it was
entered correctly, then check whether it's expired. If it still doesn't
work, have the customer email customer service with their name, the promo
code, class details, and a description of the issue - don't try to
resolve a broken code yourself, pass it to a human.

## Cancellation & refund policy

Two separate rules apply - don't conflate them:

- **Rescheduling/credit, based on time before the EVENT:** cancel or move
  a reservation by notifying customer service at least 48 hours before
  the class starts, and it can be moved to a different class at full
  value. Canceling with *less than* 48 hours' notice does not qualify for
  a move or full credit - instead we offer credit equal to 50% of the
  amount paid, usable toward a future regularly-priced class (no
  expiration, can't combine with other vouchers/codes, must be used for
  the same seat count).
- **Refund to original payment method, based on time since PURCHASE:**
  only honored if requested within 3 days of the original purchase date
  (2-5 business days to post once processed). After that 3-day window,
  a refund is not available - the customer instead gets a non-expiring
  Gift Voucher credit toward a future reservation.

Even though refund/cancellation requests are always escalated to a human
by the rules engine, the AI uses this text to set correct expectations
while the human follows up - so keep it accurate.

## What to bring / what's provided

No need to bring anything - all materials are supplied: paint brushes,
canvas, acrylic paint, easels, a measuring tool, aprons, and a cleaning
solution. Paint is non-toxic and acrylic (water-based) - it may wash off
with warm water and soap while still wet. Customers are welcome to paint
something other than the featured painting if they'd like ("we encourage
creative expression in all forms").

## Arrival time

Check-in begins 15 minutes before class starts; arriving about 30 minutes
early is recommended to allow time for parking.

## Age requirements

Events are posted for ages 21+. Exception: a mature young adult may attend
if the customer has contacted the specific venue directly and the venue
has given permission - this is handled venue-by-venue, not a blanket
policy, so don't promise it will work everywhere.

## Private events

<!-- FLAGGED: the old paint-and-sip-faq page said a 15-person minimum;
     the team's actual macros (used daily to quote real customers) say
     8 people minimum for most cities, 10 for Tucson/Sacramento. This
     file now follows the macros. Please confirm 15 was outdated FAQ
     copy and not the other way around. San Francisco moved from a
     10-person to the standard 8-person minimum per Jessica,
     2026-09-15 (see that location's Private events section). -->

We're 100% mobile (no studio) - we bring supplies to the customer's home,
office, or a venue of their choice; we don't provide food, beverages,
tables, or chairs. If the customer needs a venue, we have a list of
partner restaurants/venues (usually no rental cost - guests are expected
to buy food/drinks there); each location's file below has that location's
venue link(s), if one is on file.

For a private/corporate event pricing inquiry (guest count, event date,
company name, "team building"/"corporate"/"celebration" language - this
is what the event_booking_question rule's "private event" match usually
catches), draft a full quote reply rather than just saying "someone will
follow up" - this is what Bonnie's real "Private Event Inquiry" Zendesk
macros send every time.

**Step 0a - check FUNDRAISER first, before Standard vs Corporate.** If the
inquiry is about hosting a fundraiser/charity/benefit painting party
(mentions "fundraiser", "fundraising", "charity", "benefit", "nonprofit",
"donate"/"donation", or "cause"), use this literal template verbatim
(Christopher and Bonnie's fundraiser quote, revised 2026-09-15 for
clarity - do not paraphrase or restructure it, only fill in the
bracketed placeholders). Skip Steps 1-2 below for these - fundraisers
are their own category, not Standard or Corporate:

> Hi [customer's first name],
>
> Thank you so much for your interest in having Painting & Vino host your
> fundraiser! Adding a painting activity is a great way to bring your
> cause to life — our private events are exclusive paint parties just for
> your group, and it's all about the experience of raising money while
> spending time with your co-workers, friends, and loved ones.
>
> See what a party looks like: https://paintingandvino.com/paint-sip-private-events/
>
> **Location:** All events are done on location — we come to your home,
> office, or venue of choice. We don't provide food, beverages, tables,
> or chairs. If you don't have a place for your party, we work with a
> variety of restaurants in your area — let us know and we'll send a
> list, then check availability. (Food/drinks aren't included in our
> pricing, and the venue will expect guests to purchase something for use
> of the space.)
>
> **Date/Time:** Parties are booked in 3-hour windows with about 2.5
> hours of paint time. We're flexible with dates, but we'll need to
> confirm availability for an instructor (and a venue, if needed).
>
> **Project:** Choose one for your group:
> - Step-by-step canvas — pick from over 2,000 images in our library,
>   sent once the event is booked (or we can create a custom design for
>   $75)
> - Glass painting — each guest paints a pair of wine or beer glasses,
>   led step by step by the instructor (guests can also paint their own
>   design with guidance)
> - Pet Art — send us pet photos ahead of time and we'll show your guests
>   how to paint their own pet portrait
>
> **Pricing:** We discount our standard rate by $5 per person and donate
> that difference to your cause. You're also welcome to charge guests
> more than our rate — any amount above what we're paid goes straight to
> your cause as extra donation. A donation receipt with our EIN is
> required if you're selling tickets, for tax purposes.
>
> [FUNDRAISER_CITY_GROUP]
>
> There's a 12-person minimum to host a fundraiser. If that number isn't
> met, we'll cancel the event 48 hours beforehand and refund any tickets
> sold.
>
> This gives you everything you need to get started, but I'm happy to
> answer any other questions — including working with you on a specific
> budget, so let's keep the conversation going. Reply with your preferred
> date, guest count, and city, and I'll get a firmed-up quote over to
> you.
>
> Thank you,
> Bonnie Davila
> events@paintingandvino.com
> Private Events Coordinator

Fill the placeholders like this:
- `[customer's first name]`: from the requester's name.
- `[FUNDRAISER_CITY_GROUP]`: pick the paragraph matching the matched
  location - each one states that group's base rate, the discounted
  fundraiser rate (base minus $5/person), and a worked example so the AI
  never has to compute the math itself:
  - San Diego, Orange County, Los Angeles, Sacramento, or Tucson: "Our
    rate: $45pp for step-by-step canvas or glass painting, $55pp for Pet
    Portraits. After our $5/person fundraiser discount, you're charged
    $40pp / $50pp — so if you sell tickets at $45pp, $5 per ticket goes
    to your cause (charge more to raise more)."
  - Kansas City, MO: "Our rate: $39pp for step-by-step canvas or glass
    painting, $49pp for Pet Portraits. After our $5/person fundraiser
    discount, you're charged $34pp / $44pp — so if you sell tickets at
    $39pp, $5 per ticket goes to your cause (charge more to raise
    more)."
  - San Francisco Bay Area: "Our rate: $50pp for step-by-step canvas or
    glass painting, $60pp for Pet Portraits. After our $5/person
    fundraiser discount, you're charged $45pp / $55pp — so if you sell
    tickets at $50pp, $5 per ticket goes to your cause (charge more to
    raise more)."
  - If no location matched, or it's one not listed above (Chattanooga,
    Phoenix, Riverside County), flag this for a human instead of
    guessing a price - we don't have a confirmed fundraiser rate on file
    for it yet.
- This fundraiser template has its own 12-person minimum (not the 8-10
  used elsewhere in this section) and its own deposit/cancellation terms
  (48-hour cancellation with a refund of tickets sold if the minimum
  isn't hit) - don't mix in the general Private events minimum/deposit
  language from Steps 1-2 below.

**Step 0b - check PAINTING & KIDDOS (kids' birthday parties, ages 16 and
under) next, before Standard vs Corporate.** If the private event
inquiry is for a child's birthday/party (the requester states a child's
age of 16 or under, or the wording is "kid's birthday", "child's
birthday", "son's/daughter's birthday", "kids party", or similar -
Christopher's "Painting & Kiddos" branding, 2026-09-15), use this
literal template verbatim (do not paraphrase or restructure it, only
fill in the bracketed placeholders). Skip Step 1 below for these too -
kids' parties are their own category, same as fundraisers:

> Hi [customer's first name],
>
> Thanks so much for reaching out about hosting a private Painting &
> Vino event for your child's birthday! Our kid's events are great for
> ages 6+ and adults are welcome to participate as well.
>
> Here's a bit more info on how we can make your event truly special:
>
> 🏠 Venue:
> We are a 100% mobile Paint and Sip business, which means we don't use a
> physical studio space, but instead we bring the fun directly to you!
> Whether you plan on hosting the event at your home or a special event
> location, we can come to you!
>
> [VENUE_PARAGRAPH]
>
> 🎨 Materials:
> We'll provide all the art supplies — canvases, easels, aprons, and
> table covers. All you need to provide is the space, food, drinks, and
> any tables or chairs (unless your venue already has them).
>
> 💻 Projects:
> - Step-by-step canvas - choose a painting from our kid's painting
>   portfolio. If you don't find what you're looking for, we can create a
>   custom image for an additional fee of $75.
> - 🐶 Pet Art - Great for pet lovers! You send us pet photos before the
>   event and we show you how to create your pet portrait. Everyone will
>   paint their own pet image. Please add $10/person for Pet Portraits.
>
> 💲 Pricing:
> - Minimum Group Size: [MIN] people
> - Price per Person: $[KIDS_RATE] per person ($[KIDS_PET_RATE] for Pet
>   Portraits)
> - Discounts: Available for larger groups (30+ people)
> - Travel Fees: [TRAVEL_FEE_LINE]
> - Deposit: To book your party, we require a deposit covering either 2
>   seats or 20% of your expected headcount, whichever amount is higher.
>   The rest is due the day before. The deposit is non-refundable but
>   transferable for up to one year.
>
> ⏰ Timing:
> We typically run events for 1.5-2 hours. Please note, setup and
> cleanup time is not included.
>
> If you're ready to move forward or have any questions, feel free to
> reach out! We'd love to help you create an experience that your
> community will remember and enjoy.
>
> Cheers,
> Bonnie Davila
> Private Event Coordinator
> Painting & Vino

Fill the placeholders like this:
- `[customer's first name]`: from the requester's name.
- `[VENUE_PARAGRAPH]`: same placeholder and fill logic as Step 2a below
  (Orange County/San Diego fallback wording with no link; otherwise
  that location's restaurant/venue link; generic fallback if none on
  file) - see Step 2a's instructions for the exact wording, don't
  redefine it here. FLAGGED: the Tucson and Temecula/Riverside
  restaurant links Christopher pasted with this macro (2026-09-15)
  don't match the IDs already on file in those two locations' files -
  confirm with Christopher which is current before relying on either
  link.
- `[MIN]`: same fill logic as Step 2a below (10 for Tucson and
  Sacramento; 8 everywhere else).
- `[KIDS_RATE]` / `[KIDS_PET_RATE]`: the Kids' events rate for the
  matched location, plus $10/person for Pet Portraits per the Projects
  section above - $35/$45 for most cities, $29/$39 for Kansas City,
  $40/$50 for San Francisco.
- `[TRAVEL_FEE_LINE]`: same fill logic as Step 2a below ("A travel fee
  may apply for locations outside city limits." unless the matched
  location's own file states a confirmed figure, e.g. San Francisco Bay
  Area's $75+, in which case quote that number directly).
- The "Discounts: Available for larger groups (30+ people)" line has no
  specific discount amount on file yet - leave it exactly as written
  (don't invent a number) and flag this for Christopher if a confirmed
  figure would help.

**Step 1 - classify STANDARD vs CORPORATE first** (for everything that
isn't a fundraiser or a kids' Painting & Kiddos party, per Steps 0a and
0b above). Corporate/business: the
inquiry mentions a company name, "team building", "corporate", "work
event", "office", "coworkers", or similar - confirmed against ticket
#81048 (Tucson, corporate team-building for Bandera Healthcare's MDS
nurses, 17 guests, 11/19/2026 - Bonnie's actual reply quoted $50/person,
the corporate 8-29-guest tier, with Tucson's 10-guest minimum, and
pointed to Tucson's restaurant + pricing/project list links). Everything
else (birthdays, bachelorette/bridal, anniversaries, family/friend
celebrations, unspecified personal events) is STANDARD.

**Step 2a - STANDARD inquiries: use this literal template verbatim**
(Christopher's real "Private event - standard quote" Zendesk macro,
pulled 2026-09-14 - do not paraphrase or restructure it, only fill in
the bracketed placeholders):

> Hi [customer's first name],
>
> Thanks for reaching out — we'd love to make your celebration extra
> special! Here's everything you need to know.
>
> See what a party looks like: https://paintingandvino.com/paint-sip-private-events/
>
> What's included: We're fully mobile — we come to you with all supplies
> (canvases, easels, aprons, and table covers). You just need a space,
> tables, and chairs. You're welcome to serve food and drinks.
>
> Pricing (3-hour event, 16x20 canvas):
> - 8-29 guests: $[STANDARD_1]/person
> - 30-49 guests: $[STANDARD_2]/person
> - 50+ guests: $[STANDARD_3]/person
>
> Minimum [MIN] guests. [TRAVEL_FEE_LINE]
>
> Deposit: We require a deposit equal to 2 seats or 20% of your expected
> headcount (whichever is higher). The balance is due the day before. The
> deposit is non-refundable but transferable for up to one year.
>
> [VENUE_PARAGRAPH]
>
> Other project options: We also offer glass painting, tote bags, wood
> signs, pet portraits, and more — just ask and I'll send details!
>
> Ready to check your date or have a quick question? Reply here or let me
> know a good time for a call — I'm happy to walk you through it.
>
> Cheers,
> Bonnie Davila
> Private Event Coordinator, Painting & Vino

Fill the placeholders like this:
- `[customer's first name]`: from the requester's name.
- `$[STANDARD_1/2/3]`: the **Standard** column of the pricing table below
  for the matched location, at the guest count they gave - Kansas City
  uses its own lower Standard tier (39/35/30), every other location uses
  45/40/35. Never use a Corporate/Business figure here (50/45/40 or
  44/40/35) - this template is standard-only.
- `[MIN]`: that location's minimum group size (10 for Tucson and
  Sacramento; 8 everywhere else, including San Francisco, per that
  location's Private events section).
- `[TRAVEL_FEE_LINE]`: "A travel fee may apply for locations outside city
  limits." - unless the matched location's own file states a specific
  confirmed figure (e.g. San Francisco Bay Area's $75+ for 30+ minutes
  outside San Mateo), in which case quote that number directly instead.
- `[VENUE_PARAGRAPH]`: if the matched location is Orange County or San
  Diego, use "Need a venue? We have restaurant partners available, most
  with no rental cost - guests just purchase food and drinks. We can send
  a list of partners once we confirm which artist would be available for
  your party." (no link - none is on file for those two). Otherwise, if
  the location has a restaurant/venue link on file, use "Need a venue? We
  have restaurant partners available at no rental cost — guests just
  purchase food and drinks. Here's the list for [location]: [that
  location's restaurant list link]." If no location matched or it has no
  link on file, use the Orange County/San Diego fallback wording instead
  of inventing a link.

**Step 2b - CORPORATE/business inquiries:** we don't have Bonnie's
literal corporate macro text on file yet (flag this for Christopher if
it'd help to add it), so build the reply from this structure instead,
using the Corporate/Business pricing column:

1. Thank them for reaching out, briefly note we're fully mobile (bring
   canvases, easels, aprons, table covers - customer provides the space,
   tables, and chairs, and may serve their own food/drinks).
2. Quote the per-person Corporate/Business price for their exact guest
   count from the table below. State the location's minimum group size
   (see that location's Private events section; 8 is the fallback if the
   location file doesn't say otherwise).
3. State the deposit policy (below).
4. Offer a venue if they need one, using that location's venue link(s)
   from its Private events section. If the location has no link on file,
   say we'll send a list of partners once we confirm which artist is
   available - don't invent a link.
5. Mention other project options are available on request (glass
   painting, tote bags, wood signs, pet portraits, etc.)
6. Invite them to reply or schedule a call to lock in the date, and sign
   off "Bonnie Davila, Private Event Coordinator, Painting & Vino" -
   matching how the team's own macros are always signed regardless of who
   actually sends them (every AI draft is held for human review before
   sending anyway, so this matches what Bonnie would sign herself).

**Pricing (per person, 3-hour event, standard 16x20 canvas):**

| Guests | Standard (most cities) | Corporate/Business (most cities) |
| --- | --- | --- |
| 8-29  | $45/person | $50/person |
| 30-49 | $40/person | $45/person |
| 50+   | $35/person | $40/person |

Kansas City runs its own lower tier:

| Guests | Standard (Kansas City) | Corporate/Business (Kansas City) |
| --- | --- | --- |
| 8-29  | $39/person | $44/person |
| 30-49 | $35/person | $40/person |
| 50+   | $30/person | $35/person |

A travel fee may apply for locations outside city limits - flag that
possibility but don't quote an amount (a human confirms it), UNLESS that
location's own file states a specific figure (e.g. San Francisco Bay Area
has a confirmed $75+ for 30+ minutes outside San Mateo) - quote that
number directly instead of hedging.

Kids' events (ages 6+, adults welcome too) are a separate, simpler rate:
$35/person for most cities, $29/person in Kansas City, $40/person in San
Francisco (add $10/person for Pet Portraits). A custom (non-portfolio)
painting design costs an extra $50-75 on top of any of the above (kids'
private-party quotes use $75 - see the Painting & Kiddos template in
Step 0b above).

**Minimum group size:** 8 people for most cities; **10 people** for
Tucson and Sacramento. San Francisco moved to the standard 8-person
minimum on 2026-09-15 (per Jessica).

**Deposit:** the greater of 2 seats' worth or 20% of the expected
headcount. Non-refundable, but transferable to a future date for up to
one year. The remaining balance is due the day before the event.

**No-shows:** up to 3 no-shows can be refunded/credited off the final
invoice, as long as the group stays at or above the 8-10 person minimum.

**Other formats available** (ask a human for current pricing/details on
these): glass painting, board painting, pet portraits (send pet photos at
least 3 days ahead), Couples Events (2 seats - each person paints one
half of a canvas, combining into one piece at the end), and fundraisers
($5/person off standard rate, donated to the cause, 12-person minimum,
requires a donation receipt with EIN if selling tickets to attendees -
use the literal Fundraiser quote template in Step 0a above for these).

Customers can choose any painting from the portfolio (2,000-4,000+
images depending on event type), or request a custom painting for an
additional fee (see above).

## Premium events

Premium events go beyond the standard step-by-step 16x20 canvas class -
different mediums (pet portraits, poured paint, mixed media, wine glass
painting, etc.) with more prep/materials and more one-on-one instructor
attention. Groupons and other discount codes may NOT be used for these
(see Promo codes section) - only regular scheduled events qualify.

## On-Demand, Live Online, and Virtual Private events

There are a few different online formats - don't mix them up:

- **"On-Demand" events** (self-paced, watch anytime within a window): the
  customer gets an access link good for 72 hours from when they first
  click it. All required supplies (including paint colors) are listed on
  the event page - the customer sources their own supplies. The link is
  for one household/device only and may not be shared. If a customer
  can't access their link: have them check that a firewall isn't blocking
  the temporary URL, and if it still doesn't work, that's a case for a
  human (customer service), not something the AI should try to fix.

- **Scheduled "Live Online Events"** (public, join a specific date/time
  with an instructor and other participants via chat): the customer
  purchases their own supplies (see the supply-shopping guide on our
  site) or can buy a kit from us. The Zoom-style access link is sent
  about 24 hours before the event start time.

- **Private Live/Virtual Online Events** (book your own date/time/
  painting, just for your group): **$25 per person**, 8-person (or $200)
  minimum, plus a 20% non-refundable deposit to book (confirmed by
  Christopher). Sessions run about 2.5 hours. Supply kits (if the
  customer wants materials shipped) range from about $45 (single kit) to
  $125 (4-person household kit) depending on group size and paint-set
  size - a human should confirm current kit pricing.

## Locations we do NOT support

<!-- TODO: confirm - does Painting and Vino have any locations that run
     their own local support the way some Wine and Canvas locations do?
     If so, add an out_of_scope_location-style rule for this brand's
     rules.yaml. As of this writing, none have been identified. -->

If a ticket doesn't clearly match one of our managed locations below, do
NOT guess pricing, venues, or booking details - ask the customer which
location they mean, or fall back to pending for a human to sort out.

## Linking to the event calendar

When a customer asks how to find, sign up for, register for, or attend a
public event (this does NOT apply to private/corporate event bookings,
which go through the quote-request flow above instead) and a location was
matched, always include that location's direct calendar link - the "Direct
link" line under its Booking section - as a plain, clickable URL in the
reply. Don't just say "check our website" when we have the actual link on
file. Match this style (Christopher's example, adapted from the Wine and
Canvas side of the business - same tone applies here):

> Hi there! Thanks for reaching out! To sign up for an event in Tucson,
> just head to our website and browse the Tucson event listings. Here is
> a direct link to make it easy to find our event calendar:
> https://paintingandvino.com/tucson-paint-and-sip/. Each event has its
> own "Get Tickets" button that will take you to the registration page
> where you can book your spot. Seating is limited per class, so we
> recommend booking in advance! If you have any trouble finding an event
> or need help with anything else, just let me know!

If the matched location's Booking section has no "Direct link" on file (a
few locations don't have a public calendar page yet, e.g. Chattanooga
which hasn't launched), do NOT guess or invent one - say a team member
will help them find the next available date/location instead.

## Contact / escalation

Bonnie is our primary Customer Support representative and first point of
contact for any escalated tickets (refunds, upset customers, and anything
else the rules engine flags for human review). Amber is the secondary/
backup contact. When the AI escalates a ticket, it should let the customer
know that a member of our customer support team will follow up with them
personally - it should not name Bonnie or Amber specifically in the reply,
just route the internal note/tag so Bonnie sees it first.

<!-- TODO: what turnaround time should the AI promise (e.g. "within 1
     business day")? Confirm this applies to Painting and Vino too, not
     just Wine and Canvas. -->
