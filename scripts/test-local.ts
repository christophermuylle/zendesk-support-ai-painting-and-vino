// Runs a handful of mock tickets through the real rules engine, location
// resolver, and knowledge base (and the real AI if ANTHROPIC_API_KEY is
// set) WITHOUT touching a real Zendesk account. Use this to sanity-check
// config/rules.yaml, config/locations.yaml, and config/knowledge-base/**
// before pointing the webhook at production.
//
// Usage:
//   npm run test:mock                 (rules engine only, fake canned drafts)
//   ANTHROPIC_API_KEY=sk-... npm run test:mock   (also exercises the real AI)

import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import yaml from "js-yaml";
import { RulesEngine } from "../src/rules.js";
import { LocationResolver } from "../src/locations.js";
import { AiDrafter, type IAiDrafter } from "../src/ai.js";
import type { IZendeskClient } from "../src/zendesk.js";
import { processTicket } from "../src/pipeline.js";
import type { ActionType, DraftResult, RuleDecision, TicketContext, ZendeskComment } from "../src/types.js";

const CONFIG_DIR = path.resolve(process.cwd(), "config");
const sharedKnowledgeBase = fs.readFileSync(path.join(CONFIG_DIR, "knowledge-base", "shared.md"), "utf-8");
const LOCATION_KB_DIR = path.join(CONFIG_DIR, "knowledge-base", "locations");
function loadLocationSnippet(file: string): string | null {
  const p = path.join(LOCATION_KB_DIR, file);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
}
const rules = new RulesEngine(path.join(CONFIG_DIR, "rules.yaml"));
const locations = new LocationResolver(path.join(CONFIG_DIR, "locations.yaml"));

// --- Mock Zendesk: records what would have been posted instead of calling the API ---
class MockZendeskClient implements IZendeskClient {
  constructor(private ctx: TicketContext) {}
  async getTicketContext(): Promise<TicketContext> {
    return this.ctx;
  }
  async postComment(
    ticketId: number,
    body: string,
    opts: {
      isPublic: boolean;
      status?: ActionType;
      addTags?: string[];
      fields?: Array<{ id: number; value: string | null }>;
      htmlBody?: string;
    }
  ): Promise<void> {
    const nl = String.fromCharCode(10);
    const shown = opts.htmlBody ? `[htmlBody] ${opts.htmlBody}` : body;
    console.log(nl + `  -> would post comment (public=${opts.isPublic}, status=${opts.status ?? "unchanged"}, tags=${opts.addTags?.join(",") ?? "-"}, fields=${JSON.stringify(opts.fields ?? [])}):`);
    console.log(`     "${shown.split(nl).join(nl + "     ")}"`);
  }
  async updateTicket(ticketId: number, opts: { status?: string; addTags?: string[]; fields?: Array<{ id: number; value: string | null }> }): Promise<void> {
    console.log(String.fromCharCode(10) + `  -> would set status=${opts.status ?? "unchanged"}, tags+=${opts.addTags?.join(",") ?? "-"}, fields=${JSON.stringify(opts.fields ?? [])}, no reply (out of scope)`);
  }
  async searchTicketIds(): Promise<number[]> {
    // Not exercised by this per-scenario harness (see src/followups.ts for
    // the follow-up poller this backs) - no real Zendesk to search here.
    return [];
  }
}

// --- Mock AI: used when no ANTHROPIC_API_KEY is set, so the rules engine can be
// tested offline. Produces an obviously-fake reply that echoes the rule decision. ---
class MockAiDrafter implements IAiDrafter {
  async draftReply(ctx: TicketContext, _kb: string, rule: RuleDecision): Promise<DraftResult> {
    // Test-only hook: a ticket tagged "test_force_high_confidence" simulates
    // a confident real AI quote, so the auto-send path (pipeline.ts's
    // autoSendEligible - bypassDraftModeForAutoSend + confidence "high") can
    // be exercised offline without a real Anthropic API key. A second tag,
    // "test_event_category_corporate", picks which eventCategory to
    // simulate (defaults to "standard" if absent). Every other scenario is
    // unaffected - still "medium" confidence, still held for review, same
    // as before this follow-up feature existed.
    const forceHighConfidence = ctx.ticket.tags.includes("test_force_high_confidence");
    return {
      replyBody: `[MOCK DRAFT - no ANTHROPIC_API_KEY set] Hi ${ctx.requester?.name ?? "there"}, thanks for reaching out about "${ctx.ticket.subject}". (rule=${rule.matchedRule})`,
      suggestedAction: rule.action,
      confidence: forceHighConfidence ? "high" : "medium",
      reasoning: "Mock drafter - set ANTHROPIC_API_KEY to test real AI output.",
      eventCategory: forceHighConfidence
        ? ctx.ticket.tags.includes("test_event_category_corporate")
          ? "corporate"
          : "standard"
        : null,
    };
  }
}

function makeComment(body: string, authorId: number, isPublic = true): ZendeskComment {
  return {
    id: Math.floor(Math.random() * 1e6),
    author_id: authorId,
    body,
    public: isPublic,
    created_at: new Date().toISOString(),
  };
}

const CUSTOMER_ID = 1001;

const scenarios: { label: string; ctx: TicketContext }[] = [
  {
    label: "Simple FAQ (should solve)",
    ctx: {
      ticket: {
        id: 1,
        subject: "What is Painting & Vino?",
        description: "What is Painting & Vino? How does it work?",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Jamie Customer", email: "jamie@example.com" },
      comments: [makeComment("What is Painting & Vino? How does it work?", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Refund request (should escalate to human)",
    ctx: {
      ticket: {
        id: 2,
        subject: "Need a refund",
        description: "I need a refund for my ticket, I can't make it anymore.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Alex Customer", email: "alex@example.com" },
      comments: [makeComment("I need a refund for my ticket, I can't make it anymore.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Licensee recruitment lead (should go pending, not escalate)",
    ctx: {
      ticket: {
        id: 3,
        subject: "Interested in opening a location",
        description: "How do I become a licensee in Austin, TX?",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Sam Prospect", email: "sam@example.com" },
      comments: [makeComment("How do I become a licensee in Austin, TX?", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Random unclassified message (should fall back to human review)",
    ctx: {
      ticket: {
        id: 4,
        subject: "Question",
        description: "Hey, quick question about last week's event.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Morgan Customer", email: "morgan@example.com" },
      comments: [makeComment("Hey, quick question about last week's event.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Chattanooga - coming soon, not open yet (should not invent pricing/dates)",
    ctx: {
      ticket: {
        id: 5,
        subject: "New message from Chattanooga, TN Contact Form",
        description: "When are you opening in Chattanooga? I want to book a class.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Taylor Customer", email: "taylor@example.com" },
      comments: [makeComment("When are you opening in Chattanooga? I want to book a class.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Managed location - Sacramento pricing question (should resolve location + solve)",
    ctx: {
      ticket: {
        id: 6,
        subject: "New message from Sacramento, CA Contact Form",
        description: "How much does a paint and sip event cost in Sacramento?",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Jordan Customer", email: "jordan@example.com" },
      comments: [makeComment("How much does a paint and sip event cost in Sacramento?", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Licensee application submission (should send fixed RECEIVED reply, no AI)",
    ctx: {
      ticket: {
        id: 8,
        subject: "New submission from Licensee Application",
        description: `Name
Jordan Applicant
Email
jordan@example.com
How did you hear about this opportunity?
Google`,
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Jordan Applicant", email: "jordan@example.com" },
      comments: [
        makeComment(
          `Name
Jordan Applicant
Email
jordan@example.com
How did you hear about this opportunity?
Google`,
          CUSTOMER_ID
        ),
      ],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Licensee application - RE-TRIGGERED webhook after already handled (ticket #81117 regression: must skip, not re-send)",
    ctx: {
      ticket: {
        id: 9,
        subject: "New submission from Licensee Application",
        description: `Name
Jordan Applicant
Email
jordan@example.com
How did you hear about this opportunity?
Google`,
        status: "solved",
        requester_id: CUSTOMER_ID,
        // Already tagged from the first run - simulates the Zendesk "Support
        // AI" trigger re-firing on the public reply the pipeline itself just
        // posted (ticket #81117 sent ~30 duplicate replies this way).
        tags: ["artist__licensee_or_venue"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Jordan Applicant", email: "jordan@example.com" },
      comments: [
        makeComment(
          `Name
Jordan Applicant
Email
jordan@example.com
How did you hear about this opportunity?
Google`,
          CUSTOMER_ID
        ),
      ],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: licensee applicant replies RECEIVED - should auto-resolve, no human needed",
    ctx: {
      ticket: {
        id: 22,
        subject: "New submission from Licensee Application",
        description: `Name
Jordan Applicant
Email
jordan@example.com
How did you hear about this opportunity?
Google`,
        // Zendesk auto-reopens a solved ticket when the requester replies -
        // this simulates that reopened state at the moment our webhook
        // re-fires on the "RECEIVED" reply.
        status: "open",
        requester_id: CUSTOMER_ID,
        tags: ["artist__licensee_or_venue"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Jordan Applicant", email: "jordan@example.com" },
      comments: [
        makeComment(
          `Name
Jordan Applicant
Email
jordan@example.com
How did you hear about this opportunity?
Google`,
          CUSTOMER_ID
        ),
        makeComment('Please respond with "RECEIVED" so we know you are receiving our responses.', 999), // the agent/bot's own initial reply
        makeComment("RECEIVED", CUSTOMER_ID),
      ],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: licensee applicant replies with a real question (mentions 'received' in passing) - should NOT auto-resolve, still needs a human",
    ctx: {
      ticket: {
        id: 23,
        subject: "New submission from Licensee Application",
        description: `Name
Alex Hopeful
Email
alex@example.com
How did you hear about this opportunity?
Instagram`,
        status: "open",
        requester_id: CUSTOMER_ID,
        tags: ["artist__licensee_or_venue"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Alex Hopeful", email: "alex@example.com" },
      comments: [
        makeComment(
          `Name
Alex Hopeful
Email
alex@example.com
How did you hear about this opportunity?
Instagram`,
          CUSTOMER_ID
        ),
        makeComment('Please respond with "RECEIVED" so we know you are receiving our responses.', 999),
        makeComment(
          "I received your email but I actually have a question about territory availability before I confirm anything.",
          CUSTOMER_ID
        ),
      ],
      brand: "painting_and_vino",
    },
  },
  {
    label: "No location identified - pricing question with no city mentioned (should ask, not guess)",
    ctx: {
      ticket: {
        id: 7,
        subject: "Pricing question",
        description: "How much does it cost to book an event?",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Casey Customer", email: "casey@example.com" },
      comments: [makeComment("How much does it cost to book an event?", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: Jean, Tucson corporate team building, party of 10 (should be event_booking_question -> pending, Step 1/2b Corporate)",
    ctx: {
      ticket: {
        id: 10,
        subject: "New message from Tucson, AZ Contact Form",
        description: "Hi, my name is Jean. I'd like to book a corporate team building event in Tucson for a party of 10 people.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Jean", email: "jean@example.com" },
      comments: [makeComment("Hi, my name is Jean. I'd like to book a corporate team building event in Tucson for a party of 10 people.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Regression: Painting & Kiddos - kid's birthday party, should also be event_booking_question -> pending",
    ctx: {
      ticket: {
        id: 11,
        subject: "New message from Sacramento, CA Contact Form",
        description: "Hi, I want to book a kid's birthday party for my daughter who is turning 8, in Sacramento, 12 guests.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Riley Parent", email: "riley@example.com" },
      comments: [makeComment("Hi, I want to book a kid's birthday party for my daughter who is turning 8, in Sacramento, 12 guests.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Regression: Fundraiser - charity event in San Francisco, should also be event_booking_question -> pending",
    ctx: {
      ticket: {
        id: 12,
        subject: "New message from San Francisco Bay Area, CA Contact Form",
        description: "Hi, I'm organizing a fundraiser painting party for our nonprofit's cause in San Francisco, about 20 guests.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Morgan Nonprofit", email: "morgan.nonprofit@example.com" },
      comments: [makeComment("Hi, I'm organizing a fundraiser painting party for our nonprofit's cause in San Francisco, about 20 guests.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: Jessica, group of 6, private party in LA, no stated purpose (should be event_booking_question -> pending, Step 1/2a Standard; below the 8-person minimum)",
    ctx: {
      ticket: {
        id: 13,
        subject: "New message from Los Angeles, CA Contact Form",
        description: "Hi, my name is Jessica and I have a group of 6 people for a private party in Los Angeles.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Jessica", email: "jessica@example.com" },
      comments: [makeComment("Hi, my name is Jessica and I have a group of 6 people for a private party in Los Angeles.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Regression: ticket #81129 - San Francisco Corporate event, 50 employees (should be event_booking_question -> pending, Step 1/2b Corporate, quoting SF's own 55/50/45 table, not the generic 50/45/40 one)",
    ctx: {
      ticket: {
        id: 14,
        subject: "New message from San Francisco Bay Area, CA Contact Form",
        description: "Hi, I'd like to book a private event for 50 of our employees in San Francisco - it's a corporate team building event.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Devon Manager", email: "devon.manager@example.com" },
      comments: [makeComment("Hi, I'd like to book a private event for 50 of our employees in San Francisco - it's a corporate team building event.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: birthday bash, 25 people, Sacramento - no 'party' or 'book an event' wording (should be event_booking_question -> pending, Step 1/2a Standard)",
    ctx: {
      ticket: {
        id: 15,
        subject: "New message from Sacramento, CA Contact Form",
        description: "Hi, I'm planning a birthday bash for 25 people in Sacramento next month. Can you send me pricing?",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Taylor Host", email: "taylor.host@example.com" },
      comments: [makeComment("Hi, I'm planning a birthday bash for 25 people in Sacramento next month. Can you send me pricing?", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: bachelorette party, 15 people, San Diego (Standard category per shared.md's own Step 1, but not covered by any keyword - should be event_booking_question -> pending, Step 1/2a Standard)",
    ctx: {
      ticket: {
        id: 16,
        subject: "New message from San Diego, CA Contact Form",
        description: "Hi, can you host a bachelorette party for 15 of us in San Diego? Looking at a Saturday in October.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Brianna Bride", email: "brianna.bride@example.com" },
      comments: [makeComment("Hi, can you host a bachelorette party for 15 of us in San Diego? Looking at a Saturday in October.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: generic office event, 40 people, Riverside County - no 'corporate'/'team building'/'private event' wording (should be event_booking_question -> pending, Step 1/2b Corporate)",
    ctx: {
      ticket: {
        id: 17,
        subject: "New message from Riverside County, CA Contact Form",
        description: "Hi, I'm looking to set up a painting event for our office of 40 people in Riverside. What would that run us?",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Priya Office Manager", email: "priya.office@example.com" },
      comments: [makeComment("Hi, I'm looking to set up a painting event for our office of 40 people in Riverside. What would that run us?", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: daughter's Sweet 16, 12 people, Phoenix - Kiddos/Standard age-boundary case, no explicit 'kid's birthday' wording (should be event_booking_question -> pending)",
    ctx: {
      ticket: {
        id: 18,
        subject: "New message from Phoenix, AZ Contact Form",
        description: "Hi, I'd like pricing for a 12-person paint night for my daughter's Sweet 16 birthday in Phoenix.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Monica Parent", email: "monica.parent@example.com" },
      comments: [makeComment("Hi, I'd like pricing for a 12-person paint night for my daughter's Sweet 16 birthday in Phoenix.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: HOA community event for residents, 35 people, Orange County - should be event_booking_question -> pending, Step 1/2a STANDARD (not Corporate, despite 'association' wording)",
    ctx: {
      ticket: {
        id: 19,
        subject: "New message from Orange County, CA Contact Form",
        description: "Hi, I'm on the board of our HOA and we'd like to host a private painting event for our residents. We're expecting around 35 people. Can you send pricing?",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Gary Board Member", email: "gary.board@example.com" },
      comments: [makeComment("Hi, I'm on the board of our HOA and we'd like to host a private painting event for our residents. We're expecting around 35 people. Can you send pricing?", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: condo association event, 20 residents, Tucson, no 'private event'/'painting event' wording (should be event_booking_question -> pending, Step 1/2a STANDARD)",
    ctx: {
      ticket: {
        id: 20,
        subject: "New message from Tucson, AZ Contact Form",
        description: "Hello, my condo association wants to plan something fun for our residents - about 20 people. Do you do this kind of thing?",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Linda Association Manager", email: "linda.assoc@example.com" },
      comments: [makeComment("Hello, my condo association wants to plan something fun for our residents - about 20 people. Do you do this kind of thing?", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "Christopher's test: 'my daughter's birthday party' (no explicit 'kids'/'children's' wording) should still classify Kiddos and AUTO-SEND, tagged for follow-up tracking",
    ctx: {
      ticket: {
        id: 21,
        subject: "Birthday party quote request",
        description: "I'd like a quote for my daughter's birthday party in Tucson, about 15 people.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Priya Birthday Mom", email: "priya@example.com" },
      comments: [makeComment("I'd like a quote for my daughter's birthday party in Tucson, about 15 people.", CUSTOMER_ID)],
      brand: "painting_and_vino",
    },
  },
  {
    label: "PRIVATE EVENT QUOTE - Kansas City kids party (should auto-send Kiddos quote at KC's own lower price point, not the default $35)",
    ctx: {
      ticket: {
        id: 22,
        subject: "New message from Kansas City, MO Contact Form",
        description: "Party request from Dana Parent. My son is turning 7 and we want to book a kids party in Kansas City. Guests: about 12 kids.",
        status: "new",
        requester_id: CUSTOMER_ID,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      requester: { id: CUSTOMER_ID, name: "Dana Parent", email: "dana@example.com" },
      comments: [
        makeComment(
          "Party request from Dana Parent. My son is turning 7 and we want to book a kids party in Kansas City. Guests: about 12 kids.",
          CUSTOMER_ID
        ),
      ],
      brand: "painting_and_vino",
    },
  },
];

async function main() {
  const useRealAi = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.ANTHROPIC_API_KEY !== "mock-key-for-local-testing-only";
  const ai: IAiDrafter = useRealAi
    ? new AiDrafter({ apiKey: process.env.ANTHROPIC_API_KEY!, model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5" })
    : new MockAiDrafter();

  console.log(`Running ${scenarios.length} mock tickets through the pipeline (AI: ${useRealAi ? "real Claude API" : "mock, offline"})` + String.fromCharCode(10));
  console.log("Loaded rules:", (yaml.load(fs.readFileSync(path.join(CONFIG_DIR, "rules.yaml"), "utf-8")) as { rules: { name: string }[] }).rules.map((r) => r.name).join(", "));

  for (const scenario of scenarios) {
    console.log(String.fromCharCode(10) + `=== ${scenario.label} ===`);
    const zendesk = new MockZendeskClient(scenario.ctx);
    const result = await processTicket(
      { zendesk, rules, locations, ai, sharedKnowledgeBase, loadLocationSnippet, mode: "draft" },
      scenario.ctx.ticket.id
    );
    console.log(`  matched rule: ${result.ruleDecision.matchedRule}`);
    console.log(`  matched location: ${result.matchedLocation ?? "(none)"}`);
    if (result.draft) {
      console.log(`  suggested action: ${result.draft.suggestedAction} (confidence: ${result.draft.confidence})`);
    } else {
      console.log(`  no draft (AI was never called)`);
    }
    console.log(`  final: ${result.finalAction}`);
  }
}

main().catch((err) => {
  console.error("test-local failed:", err);
  process.exit(1);
});
