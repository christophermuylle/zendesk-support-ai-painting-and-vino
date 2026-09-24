// Exercises the follow-up poller's state machine (src/followups.ts)
// directly - stage progression, the 24h/72h/120h thresholds, idempotency
// (never re-sending a stage), the Corporate vs Standard email 2 branch,
// and the "promo codes not configured yet" fallback for stage 3. This is a
// different code path from scripts/test-local.ts (which exercises
// processTicket per-ticket, not the periodic sweep), so it gets its own
// mock Zendesk client with a real in-memory ticket store and searchTicketIds.
//
// Usage: npm run test:followups

import { runFollowUpSweep } from "../src/followups.js";
import { LocationResolver } from "../src/locations.js";
import type { IZendeskClient } from "../src/zendesk.js";
import type { ActionType, TicketContext, ZendeskComment, ZendeskTicket } from "../src/types.js";
import path from "node:path";

const CONFIG_DIR = path.resolve(process.cwd(), "config");
const locations = new LocationResolver(path.join(CONFIG_DIR, "locations.yaml"));

const AGENT_ID = 999; // the Zendesk agent/bot account that posts our replies
const CUSTOMER_ID = 1001;

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function comment(body: string, authorId: number, hoursAgoVal: number, isPublic = true): ZendeskComment {
  return { id: Math.floor(Math.random() * 1e6), author_id: authorId, body, public: isPublic, created_at: hoursAgo(hoursAgoVal) };
}

interface StoredTicket {
  ticket: ZendeskTicket;
  requester: { id: number; name: string; email: string };
  comments: ZendeskComment[];
}

class InMemoryZendesk implements IZendeskClient {
  constructor(private store: Map<number, StoredTicket>) {}

  async getTicketContext(ticketId: number): Promise<TicketContext> {
    const t = this.store.get(ticketId);
    if (!t) throw new Error(`unknown ticket ${ticketId}`);
    return { ticket: t.ticket, requester: t.requester, comments: t.comments, brand: "painting_and_vino" };
  }

  async postComment(
    ticketId: number,
    body: string,
    opts: { isPublic: boolean; status?: ActionType; addTags?: string[]; fields?: Array<{ id: number; value: string | null }>; htmlBody?: string }
  ): Promise<void> {
    const t = this.store.get(ticketId)!;
    const statusMap: Record<string, ZendeskTicket["status"]> = { solve: "solved", pending: "pending", escalate: "open" };
    if (opts.status && statusMap[opts.status]) t.ticket.status = statusMap[opts.status];
    if (opts.addTags?.length) t.ticket.tags = [...new Set([...t.ticket.tags, ...opts.addTags])];
    t.comments.push(comment(opts.htmlBody ?? body, AGENT_ID, 0, opts.isPublic));
    console.log(
      `  [ticket ${ticketId}] postComment public=${opts.isPublic} status=${opts.status ?? "unchanged"} tags+=${opts.addTags?.join(",") ?? "-"}`
    );
    console.log(`    body: ${(opts.htmlBody ?? body).slice(0, 120).replace(/\n/g, " ")}...`);
  }

  async updateTicket(
    ticketId: number,
    opts: { status?: string; addTags?: string[]; fields?: Array<{ id: number; value: string | null }> }
  ): Promise<void> {
    const t = this.store.get(ticketId)!;
    if (opts.addTags?.length) t.ticket.tags = [...new Set([...t.ticket.tags, ...opts.addTags])];
    console.log(`  [ticket ${ticketId}] updateTicket tags+=${opts.addTags?.join(",") ?? "-"}`);
  }

  async searchTicketIds(query: string): Promise<number[]> {
    // Mirrors the real query shape (status:pending tags:private_event_quote_sent)
    // closely enough for this test: just return every pending ticket tagged
    // private_event_quote_sent, same as the real Zendesk search would.
    return [...this.store.values()]
      .filter((t) => t.ticket.status === "pending" && t.ticket.tags.includes("private_event_quote_sent"))
      .map((t) => t.ticket.id);
  }
}

function makeTicket(
  id: number,
  quoteAgeHours: number,
  extraTags: string[] = [],
  requesterName = "Test Customer"
): StoredTicket {
  return {
    ticket: {
      id,
      subject: "Private event quote",
      description: "...",
      status: "pending",
      requester_id: CUSTOMER_ID,
      tags: ["booking_question", "private_event_quote_sent", ...extraTags],
      created_at: hoursAgo(quoteAgeHours + 1),
      updated_at: hoursAgo(0),
    },
    requester: { id: CUSTOMER_ID, name: requesterName, email: "test@example.com" },
    comments: [
      comment("Hi, I'd like a quote for a private event.", CUSTOMER_ID, quoteAgeHours + 1),
      comment("Here's your quote...", AGENT_ID, quoteAgeHours), // the "quote sent" anchor
    ],
  };
}

async function main() {
  const store = new Map<number, StoredTicket>();

  // 1: quote sent 30h ago, no follow-up yet -> due for stage 1 (>24h).
  store.set(1, makeTicket(1, 30, ["private_event_quote_sent_standard", "private_event_location_tucson"], "Priya Stage1"));
  // 2: quote sent 10h ago -> NOT due for stage 1 yet (<24h).
  store.set(2, makeTicket(2, 10, ["private_event_quote_sent_standard"], "Jamie TooSoon"));
  // 3: quote sent 80h ago, stage 1 already sent -> due for stage 2 Corporate.
  const t3 = makeTicket(3, 80, ["private_event_quote_sent_corporate", "private_event_location_kansas-city"], "Sam Corporate");
  t3.ticket.tags.push("private_event_followup_1_sent");
  store.set(3, t3);
  // 4: quote sent 130h ago, stage 2 already sent -> due for stage 3 (needs promo code - none configured in this test env).
  const t4 = makeTicket(4, 130, ["private_event_quote_sent_standard", "private_event_location_san-diego"], "Robin Stage3");
  t4.ticket.tags.push("private_event_followup_1_sent", "private_event_followup_2_sent");
  store.set(4, t4);
  // 5: all three stages already sent -> should be skipped entirely (no re-send).
  const t5 = makeTicket(5, 200, ["private_event_quote_sent_standard"], "Done Already");
  t5.ticket.tags.push("private_event_followup_1_sent", "private_event_followup_2_sent", "private_event_followup_3_sent");
  store.set(5, t5);
  // 6: quote sent 30h ago but customer already replied (status back to "open") -> should be skipped.
  const t6 = makeTicket(6, 30, ["private_event_quote_sent_standard"], "Replied Already");
  t6.ticket.status = "open";
  store.set(6, t6);

  const zendesk = new InMemoryZendesk(store);
  console.log("Running follow-up sweep against 6 mock tickets...\n");
  const result = await runFollowUpSweep({ zendesk, locations });

  console.log(`\nSweep result: checked=${result.checked} sent=${result.sent.length} errors=${result.errors.length}`);
  console.log("Sent:", JSON.stringify(result.sent));
  console.log("Errors:", JSON.stringify(result.errors));

  console.log("\nFinal ticket states:");
  for (const [id, t] of store) {
    console.log(`  ticket ${id} (${t.requester.name}): status=${t.ticket.status} tags=[${t.ticket.tags.join(", ")}]`);
  }

  // --- Sanity checks (throws on failure, matching this repo's "visually
  // inspect + assert the important invariants" test style) ---
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  };
  const sentStages = (id: number) => result.sent.filter((s) => s.ticketId === id).map((s) => s.stage);

  assert(sentStages(1).length === 1 && sentStages(1)[0] === 1, "ticket 1 should get exactly stage 1");
  assert(sentStages(2).length === 0, "ticket 2 (10h old) should get nothing yet");
  assert(sentStages(3).length === 1 && sentStages(3)[0] === 2, "ticket 3 should get exactly stage 2 (corporate)");
  assert(store.get(3)!.ticket.status === "pending", "ticket 3 should stay pending after stage 2 (not solved)");
  assert(sentStages(4).length === 0, "ticket 4 (stage 3 due, no promo config) should NOT auto-send - falls back to needs_human");
  assert(store.get(4)!.ticket.tags.includes("needs_human"), "ticket 4 should be tagged needs_human when promo codes aren't configured");
  assert(sentStages(5).length === 0, "ticket 5 (all stages already sent) should get nothing - no re-send");
  assert(sentStages(6).length === 0, "ticket 6 (customer already replied, status=open) should get nothing");

  assert(
    store.get(5)!.ticket.status === "pending",
    "ticket 5 (all three follow-ups already sent) should REST in pending, not solved - the stage-3 tag ends the sequence, not the status (Christopher, 2026-09-24)"
  );

  // Blanket invariant: this sweep must never leave a private-event ticket
  // Solved. Christopher, 2026-09-24: "You should never close Private Event
  // tickets as closed. Only pending. Let the human solve and close them."
  // Email 3 used to Solve the ticket, which is how a batch of private-event
  // tickets ended up Solved without a human ever seeing them.
  for (const [id, t] of store) {
    assert(
      t.ticket.status !== "solved",
      `ticket ${id} was left Solved by the follow-up sweep - private-event tickets must stay Pending for a human to solve and close`
    );
  }

  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
