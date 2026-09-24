// The core pipeline: fetch ticket -> run rules -> draft with AI -> act.
// Shared by the live webhook server (src/index.ts) and the local mock test
// (scripts/test-local.ts) so both exercise identical logic.

import type { IAiDrafter } from "./ai.js";
import type { RulesEngine } from "./rules.js";
import type { LocationResolver } from "./locations.js";
import type { IZendeskClient, ZendeskStatus } from "./zendesk.js";
import type { Mode } from "./config.js";
import {
  ORDER_CONFIRMATION_FIELD_ID,
  ORDER_CONFIRMATION_FIELD_VALUE,
  PAYPAL_RECEIPT_FIELD_VALUE,
  LICENSEE_INITIAL_RESPONSE_FIELD_VALUE,
  LICENSEE_INITIAL_RESPONSE_TEXT,
  PRIVATE_EVENT_QUOTE_SENT_TAG,
  PRIVATE_EVENT_LOCATION_TAG_PREFIX,
  PRIVATE_EVENT_INTERNAL_SENDER_PREFIX,
} from "./config.js";
import type { DraftResult, RuleDecision, TicketContext } from "./types.js";
import { extractOrderTotal, getLatestComment, looksLikeReceivedConfirmation, isInternalBrandSender } from "./util.js";
import { classifyPrivateEvent, renderPrivateEventQuote, resolvePrivateEventLocationKey } from "./private-event-quotes.js";

export interface PipelineResult {
  ticketId: number;
  ruleDecision: RuleDecision;
  matchedLocation: string | null;
  // Absent when the rules engine short-circuited to "no_action",
  // "order_confirmation", "licensee_initial_response", or
  // "private_event_quote" (e.g. an out-of-scope-location ticket, an
  // automated new-order notification, an automated licensee-application
  // notification, or a mechanically-quoted private event) - the AI is
  // never called for those, so there's nothing to draft and no cost
  // incurred.
  draft?: DraftResult;
  finalAction:
    | "posted_public_reply"
    | "posted_internal_note"
    | "skipped_out_of_scope"
    | "order_confirmation_solved"
    | "paypal_receipt_solved_and_closed"
    | "order_confirmation_left_open"
    | "licensee_initial_response_sent"
    | "licensee_initial_response_already_sent"
    | "licensee_received_confirmed_resolved"
    | "private_event_needs_location"
    | "no_op";
  mode: Mode;
}

export interface PipelineDeps {
  zendesk: IZendeskClient;
  rules: RulesEngine;
  locations: LocationResolver;
  ai: IAiDrafter;
  sharedKnowledgeBase: string;
  loadLocationSnippet: (file: string) => string | null;
  mode: Mode;
}

/**
 * Combines the shared knowledge base with the matched location's snippet
 * (if any), so the AI gets location-specific pricing/booking/venue info
 * instead of a generic answer. If no location was identified, the shared
 * doc already instructs the AI to ask rather than guess.
 */
function buildKnowledgeBase(
  deps: PipelineDeps,
  ctx: TicketContext
): { text: string; locationDisplayName: string | null; locationSlug: string | null } {
  const match = deps.locations.resolve(ctx);
  if (!match) {
    return { text: deps.sharedKnowledgeBase, locationDisplayName: null, locationSlug: null };
  }
  const snippet = deps.loadLocationSnippet(match.file);
  if (!snippet) {
    // Location matched but has no file yet (e.g. Adrian/Cadillac MI) - fall
    // back to shared-only rather than erroring the whole ticket.
    return { text: deps.sharedKnowledgeBase, locationDisplayName: match.displayName, locationSlug: match.slug };
  }
  const text = [deps.sharedKnowledgeBase, "---", `# Matched location: ${match.displayName}`, snippet].join(
    String.fromCharCode(10, 10)
  );
  return { text, locationDisplayName: match.displayName, locationSlug: match.slug };
}

export async function processTicket(deps: PipelineDeps, ticketId: number): Promise<PipelineResult> {
  const ctx: TicketContext = await deps.zendesk.getTicketContext(ticketId);

  const ruleDecision = deps.rules.evaluate(ctx);

  // "no_action" means this ticket is out of scope entirely (e.g. a location
  // we don't provide support for) - never reply to it or answer on its
  // behalf. No AI call, no comment. Only tags are applied.
  //
  // Status: a brand-new ticket gets moved from "new" to "open" so it
  // surfaces in the queue for Bonnie to notice and forward to whoever
  // actually owns it. It must NOT force status on every reprocess, though -
  // this webhook re-fires on ANY ticket update, including an agent marking
  // the ticket Solved themselves, which re-matches the same rule. Forcing
  // status:"open" unconditionally here was silently reopening tickets
  // agents had just solved seconds earlier - confirmed as the cause of
  // Painting and Vino tickets refusing to stay Solved, 2026-09-13. Once a
  // human has moved it off "new" (solved it, left it pending, whatever),
  // leave status alone from then on.
  if (ruleDecision.action === "no_action") {
    const statusUpdate: { status?: ZendeskStatus } = ctx.ticket.status === "new" ? { status: "open" } : {};
    await deps.zendesk.updateTicket(ticketId, { ...statusUpdate, addTags: ruleDecision.addTags });
    return { ticketId, ruleDecision, matchedLocation: null, finalAction: "skipped_out_of_scope", mode: deps.mode };
  }

  // "order_confirmation" is a purely mechanical rule for automated "New
  // order" notification tickets from the storefront - it's not a real
  // support question, so no AI draft and no reply/comment of any kind, in
  // draft mode or auto mode alike. We just categorize the ticket (which
  // also auto-applies Zendesk's "order_confirmation" tag via the tagger
  // field) and close it - UNLESS the order total is $0 or unparseable, in
  // which case it's left Open for Bonnie to check by hand.
  if (ruleDecision.action === "order_confirmation") {
    const total = extractOrderTotal(ctx.ticket.description ?? "");
    const status: ZendeskStatus = total !== null && total > 0 ? "solved" : "open";
    await deps.zendesk.updateTicket(ticketId, {
      status,
      addTags: ruleDecision.addTags,
      fields: [{ id: ORDER_CONFIRMATION_FIELD_ID, value: ORDER_CONFIRMATION_FIELD_VALUE }],
    });
    return {
      ticketId,
      ruleDecision,
      matchedLocation: null,
      finalAction: status === "solved" ? "order_confirmation_solved" : "order_confirmation_left_open",
      mode: deps.mode,
    };
  }

  // "paypal_receipt" - PayPal's own "Notification of payment received"
  // emails, which land in the support inbox because payments go to
  // info@paintingandvino.com. Not a customer question at all: nobody is
  // writing in, PayPal is. No AI call and no reply of any kind, draft or
  // auto mode alike.
  //
  // Christopher, 2026-09-24: "Notification of payment received - these
  // type of tickets are closed like orders but the reason for contact is
  // PayPal Receipt. I closed this one for a sample." The sample is ticket
  // #81322. Solved and Closed are applied as two sequential updates so the
  // ticket passes through Solved on the way to Closed, matching Zendesk's
  // normal status flow (verified working over the API on Wine and Canvas's
  // newsletter tickets, e.g. #29280: solved(api) -> closed(api)).
  //
  // Before this rule existed these fell through to general_faq - the
  // PayPal receipt body contains "Unit price", which hits that rule's
  // "price" keyword - and sat Open tagged faq_auto_answered.
  if (ruleDecision.action === "paypal_receipt") {
    await deps.zendesk.updateTicket(ticketId, {
      status: "solved",
      addTags: ruleDecision.addTags,
      fields: [{ id: ORDER_CONFIRMATION_FIELD_ID, value: PAYPAL_RECEIPT_FIELD_VALUE }],
    });
    await deps.zendesk.updateTicket(ticketId, { status: "closed" });
    return {
      ticketId,
      ruleDecision,
      matchedLocation: null,
      finalAction: "paypal_receipt_solved_and_closed",
      mode: deps.mode,
    };
  }

  // "licensee_initial_response" is a purely mechanical rule for automated
  // "New submission from Licensee Application" notification tickets from
  // the storefront's licensee application form - it's not a real support
  // question, so no AI draft. Unlike order_confirmation, this DOES send an
  // actual public reply, because that's the whole point: it's a fixed
  // deliverability-check message ("please respond RECEIVED") that Christopher
  // already sends by hand via Zendesk's own "Licensee Initial Response"
  // macro for every single one of these tickets, with zero variation - see
  // config.ts for the source. Categorizes the ticket (auto-applies the
  // "Artist, Licensee or Venue" reason/tag) and solves it, matching exactly
  // what that macro does. Runs in both draft and auto mode alike, same as
  // order_confirmation - this bypasses the usual MODE=draft human-review
  // hold because it's a fixed template, not an AI judgment call.
  if (ruleDecision.action === "licensee_initial_response") {
    // IDEMPOTENCY GUARD (added 2026-09-14 after ticket #81117): Zendesk's
    // "Support AI" trigger fires on ANY ticket update matching "Ticket
    // Created" OR "Comment is Public" - with no restriction on the
    // comment's author. The public reply posted just below satisfies that
    // second condition itself, so it was re-triggering this same webhook,
    // which re-evaluated this same rule (nothing about the match text
    // changes) and posted ANOTHER public reply - a tight loop, confirmed as
    // ~30 duplicate "please respond RECEIVED" emails to one real licensee
    // applicant in under 3 minutes before it stopped. Christopher is
    // tightening the Zendesk trigger condition itself (should stop the
    // re-trigger at the source), but this guard is a required backstop
    // regardless - it makes this branch safe to re-run no matter how many
    // times the webhook fires for the same ticket. Once handled, Zendesk's
    // tagger field auto-applies LICENSEE_INITIAL_RESPONSE_FIELD_VALUE
    // ("artist__licensee_or_venue") to the ticket - its presence means "the
    // fixed reply already went out," so skip rather than send it again.
    if (ctx.ticket.tags.includes(LICENSEE_INITIAL_RESPONSE_FIELD_VALUE)) {
      // AUTO-RESOLVE ON "RECEIVED" (added 2026-09-18 per Christopher): the
      // fixed reply above solves the ticket the moment it sends, so when
      // the applicant's "RECEIVED" reply lands, Zendesk auto-reopens the
      // ticket (its normal behavior for any reply to a solved ticket) and
      // this webhook fires again. Before this, that re-trigger was a pure
      // no-op (see the idempotency guard note above) - correct for
      // preventing a duplicate "please respond RECEIVED" send, but it also
      // meant every single one of these sat reopened in the queue for a
      // human to close by hand, even a clean, simple confirmation. Now: if
      // the ticket isn't already solved AND the latest reply is basically
      // just "RECEIVED" (see looksLikeReceivedConfirmation - deliberately
      // narrow, so a longer message that happens to mention "received" in
      // passing still goes to a human instead of being silently closed),
      // close it again with no further reply needed - matching what a
      // human would do by hand for a clean confirmation. Anything else
      // (a real question, an unrelated reply, silence) still falls through
      // to the plain no-op below, same as before.
      const latest = getLatestComment(ctx);
      const isReceivedConfirmation =
        ctx.ticket.status !== "solved" &&
        latest?.public &&
        latest.author_id === ctx.ticket.requester_id &&
        looksLikeReceivedConfirmation(latest.body);

      if (isReceivedConfirmation) {
        await deps.zendesk.updateTicket(ticketId, {
          status: "solved",
          addTags: ["licensee_received_confirmed"],
        });
        return {
          ticketId,
          ruleDecision,
          matchedLocation: null,
          finalAction: "licensee_received_confirmed_resolved",
          mode: deps.mode,
        };
      }

      return {
        ticketId,
        ruleDecision,
        matchedLocation: null,
        finalAction: "licensee_initial_response_already_sent",
        mode: deps.mode,
      };
    }
    await deps.zendesk.postComment(ticketId, LICENSEE_INITIAL_RESPONSE_TEXT, {
      isPublic: true,
      status: "solve",
      addTags: ruleDecision.addTags,
      fields: [{ id: ORDER_CONFIRMATION_FIELD_ID, value: LICENSEE_INITIAL_RESPONSE_FIELD_VALUE }],
    });
    return {
      ticketId,
      ruleDecision,
      matchedLocation: null,
      finalAction: "licensee_initial_response_sent",
      mode: deps.mode,
    };
  }

  // "private_event_quote" is a purely mechanical rule (config/rules.yaml's
  // event_booking_question) for private-event pricing inquiries - no AI
  // call. Christopher, 2026-09-22: "I don't want AI draft pending review.
  // We want you to answer the quotes automatically with templates I
  // already provided. Then do the follow up emails as trained." Replaces
  // the AI-drafted-with-confidence-gate approach this rule used from
  // 2026-09-18 (see git history) - that gate was a real reliability gap
  // (see ticket #81174: a quote could silently fall back to an unreviewed
  // internal note whenever the AI wasn't "highly confident"). Classifies
  // the inquiry (corporate/standard/kiddos/fundraiser) and location purely
  // by keyword (src/private-event-quotes.ts), and ALWAYS auto-sends - no
  // human review hold, unlike every other category on this brand. Tags the
  // ticket so the follow-up poller (src/followups.ts) picks it up for the
  // 24h/72h/120h no-response sequence - same tag scheme the old AI-drafted
  // path already used, so followups.ts needed no changes.
  if (ruleDecision.action === "private_event_quote") {
    // Idempotency guard: send the automated quote once per ticket, never
    // again. Without this, ANY later webhook call for this ticket -
    // including the customer's own reply, since this branch re-runs on
    // every ticket update, not just the first message - can re-match
    // event_booking_question's broad keyword list (people keep saying
    // "party"/"event"/"birthday" while confirming details) and re-send the
    // exact same quote email. Reported by Bonnie 2026-09-22 (ticket
    // #29199): "the same email is sending out over and over." Once
    // PRIVATE_EVENT_QUOTE_SENT_TAG is already on the ticket, any further
    // message is a real reply that needs a human, not another copy of the
    // template.
    if (ctx.ticket.tags.includes(PRIVATE_EVENT_QUOTE_SENT_TAG)) {
      const note = [
        `[PRIVATE EVENT - customer replied after the quote was already sent]`,
        `Matched rule: ${ruleDecision.matchedRule}`,
        `A private-event quote was already sent on this ticket, so this looks like the customer's reply rather than a fresh inquiry - needs a human, not another copy of the same quote.`,
      ].join(String.fromCharCode(10));
      await deps.zendesk.postComment(ticketId, note, {
        isPublic: false,
        addTags: ["needs_human", "private_event_reply_after_quote"],
      });
      return {
        ticketId,
        ruleDecision,
        matchedLocation: null,
        finalAction: "posted_internal_note",
        mode: deps.mode,
      };
    }

    // Internal-sender guard: skip the automatic quote when the requester
    // is one of Painting and Vino's own internal/staff mailboxes, not a
    // real customer - see PRIVATE_EVENT_INTERNAL_SENDER_PREFIX in
    // src/config.ts for the real ticket (#81236, Morgan Palla) that
    // motivated this: an Event Coordinator proactively following up with
    // a past customer on a closed ticket becomes the REQUESTER on the new
    // ticket, so her own outreach message was read as the "latest
    // customer message" and auto-quoted. Checked before location
    // resolution since there's no point resolving a location for a
    // message that was never a real inquiry in the first place.
    if (isInternalBrandSender(ctx.requester?.email, PRIVATE_EVENT_INTERNAL_SENDER_PREFIX)) {
      const note = [
        `[PRIVATE EVENT - sender looks internal, not a customer]`,
        `Matched rule: ${ruleDecision.matchedRule}`,
        `Requester email (${ctx.requester?.email ?? "unknown"}) matches this brand's own internal/staff mailbox pattern, not a real customer's address - skipping the automatic quote so a human can check who this is actually from and reply appropriately.`,
      ].join(String.fromCharCode(10));
      await deps.zendesk.postComment(ticketId, note, {
        isPublic: false,
        addTags: ["needs_human", "private_event_internal_sender"],
      });
      return {
        ticketId,
        ruleDecision,
        matchedLocation: null,
        finalAction: "posted_internal_note",
        mode: deps.mode,
      };
    }

    const location = deps.locations.resolve(ctx);
    const locationKey = location ? resolvePrivateEventLocationKey(location.slug) : null;

    if (!location || !locationKey) {
      // No location, or a location without private-event pricing on file
      // yet - fails safe to a human rather than guessing pricing or a
      // venue link.
      const note = [
        `[PRIVATE EVENT QUOTE - needs human]`,
        `Matched rule: ${ruleDecision.matchedRule}`,
        location
          ? `Location matched (${location.displayName}) but this brand's private-event pricing isn't set up for it yet - please confirm the location and send a quote by hand.`
          : `No specific location could be identified from the ticket text - please confirm the location and send a quote by hand.`,
      ].join(String.fromCharCode(10));
      await deps.zendesk.postComment(ticketId, note, {
        isPublic: false,
        addTags: [...(ruleDecision.addTags ?? []), "private_event_needs_location"],
      });
      return {
        ticketId,
        ruleDecision,
        matchedLocation: location?.displayName ?? null,
        finalAction: "private_event_needs_location",
        mode: deps.mode,
      };
    }

    const category = classifyPrivateEvent(ctx);
    const quote = renderPrivateEventQuote(ctx, category, locationKey);

    await deps.zendesk.postComment(ticketId, quote.plainBody, {
      isPublic: true,
      status: "pending", // waiting on the customer, not "solved" - lets the follow-up sequence pick it up
      htmlBody: quote.htmlBody,
      addTags: [
        ...(ruleDecision.addTags ?? []),
        PRIVATE_EVENT_QUOTE_SENT_TAG,
        `${PRIVATE_EVENT_QUOTE_SENT_TAG}_${category}`,
        `${PRIVATE_EVENT_LOCATION_TAG_PREFIX}${locationKey}`,
      ],
    });
    return {
      ticketId,
      ruleDecision,
      matchedLocation: location.displayName,
      finalAction: "posted_public_reply",
      mode: deps.mode,
    };
  }

  const { text: knowledgeBase, locationDisplayName, locationSlug } = buildKnowledgeBase(deps, ctx);
  const draft = await deps.ai.draftReply(ctx, knowledgeBase, ruleDecision);

  // The rules engine can force human review (e.g. refunds, angry customers)
  // regardless of MODE - that always wins. Otherwise MODE=draft normally
  // holds everything for review too, EXCEPT a rule explicitly marked
  // bypassDraftModeForAutoSend (currently only event_booking_question, per
  // Christopher 2026-09-18: private event quotes should send automatically
  // without waiting for a human, so the follow-up sequence below has a real
  // "quote sent" moment to count from) - and even then, only when the AI's
  // own confidence is "high". A medium/low-confidence quote still gets held
  // for review like everything else, since this sends real priced quotes
  // straight to a customer with no human in the loop.
  const autoSendEligible = ruleDecision.bypassDraftModeForAutoSend && draft.confidence === "high";
  const mustHoldForHuman = ruleDecision.forceHumanReview || (deps.mode === "draft" && !autoSendEligible);

  let finalAction: PipelineResult["finalAction"] = "no_op";

  if (mustHoldForHuman) {
    const note = formatInternalNote(ruleDecision, draft);
    await deps.zendesk.postComment(ticketId, note, {
      isPublic: false,
      addTags: [...(ruleDecision.addTags ?? []), "ai_draft_pending_review"],
    });
    finalAction = "posted_internal_note";
  } else {
    // If this was a private event quote (see ai.ts's eventCategory field),
    // tag it for the follow-up poller (src/followups.ts) to find later:
    // one shared "quote sent, no follow-up sent yet" tag plus a
    // category-specific tag so the poller can pick the right email 2
    // variant (Corporate vs Standard) without re-deriving it from the
    // ticket text. The poller adds its own followup_1_sent/2_sent/3_sent
    // tags as each stage fires - see that file for the full state machine.
    const followUpTags = draft.eventCategory
      ? [
          PRIVATE_EVENT_QUOTE_SENT_TAG,
          `${PRIVATE_EVENT_QUOTE_SENT_TAG}_${draft.eventCategory}`,
          ...(locationSlug ? [`${PRIVATE_EVENT_LOCATION_TAG_PREFIX}${locationSlug}`] : []),
        ]
      : [];
    await deps.zendesk.postComment(ticketId, draft.replyBody, {
      isPublic: true,
      status: draft.suggestedAction,
      addTags: [...(ruleDecision.addTags ?? []), ...followUpTags],
    });
    finalAction = "posted_public_reply";
  }

  return { ticketId, ruleDecision, matchedLocation: locationDisplayName, draft, finalAction, mode: deps.mode };
}

function formatInternalNote(rule: RuleDecision, draft: DraftResult): string {
  return [
    `[AI DRAFT - awaiting human review]`,
    `Matched rule: ${rule.matchedRule} | Suggested action: ${draft.suggestedAction} | Confidence: ${draft.confidence}`,
    ``,
    `Suggested reply:`,
    draft.replyBody,
    ``,
    `Reasoning: ${draft.reasoning}`,
  ].join(String.fromCharCode(10));
}
