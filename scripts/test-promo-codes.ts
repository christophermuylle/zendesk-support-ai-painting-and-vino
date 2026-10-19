// Regression test for src/promo-codes.ts range building.
//
// The bug this exists to prevent: the sheet name was hardcoded to "Sheet1"
// (overridable only by an env var nobody remembered to set), but Painting
// and Vino's code sheet has its tab named "Painting and Vino Codes". Every
// request therefore asked Google for the range `Sheet1!A:A`, got back
// 400 "Unable to parse range", threw out of claimNextCode, and - because
// the sweep catches per-ticket errors into result.errors and writes nothing
// to the ticket - email 3 silently stopped going out after 2026-10-12.
// Five customers (PV #81753, #81756, #81788, #81874, #81880) never got it.
//
// claimNextCode now asks the spreadsheet what its tabs are called, so these
// tests drive it through a stubbed fetch and assert on the URLs it builds.
//
// Usage: npm run test:promo

import crypto from "node:crypto";
import { loadPromoCodeConfig, claimNextCode } from "../src/promo-codes.js";

let failures = 0;
function assert(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

// A throwaway RSA key so the real JWT signing path runs (not stubbed) -
// getAccessToken calls crypto.sign before it ever reaches fetch.
const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

interface Captured {
  url: string;
  method: string;
  body?: string;
}

/**
 * Installs a fetch stub that answers the OAuth call, reports `tabName` as
 * the spreadsheet's only tab, returns `codes` from column A, and accepts
 * the write. Returns the list of requests it saw.
 */
let sheetCounter = 0;
function stubGoogle(tabName: string, codes: string[]): Captured[] {
  // A distinct spreadsheet id per scenario, so the module's tab-name cache
  // (keyed by spreadsheet id) doesn't answer one scenario out of another's.
  sheetCounter += 1;
  process.env.GOOGLE_SHEETS_PROMO_SPREADSHEET_ID = `stub-sheet-${sheetCounter}`;
  const seen: Captured[] = [];
  (globalThis as { fetch: unknown }).fetch = async (input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    seen.push({ url, method: init.method ?? "GET", body: init.body as string | undefined });
    const json = (payload: unknown) =>
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });

    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return json({ access_token: "stub-token", expires_in: 3600 });
    }
    if (url.includes("fields=sheets.properties.title")) {
      return json({ sheets: [{ properties: { title: tabName } }] });
    }
    if (url.includes("/values/") && (init.method ?? "GET") === "GET") {
      return json({ values: codes.map((c) => [c]) });
    }
    if (url.includes("/values/") && init.method === "PUT") {
      return json({ updatedCells: codes.length });
    }
    return new Response("unexpected request", { status: 500 });
  };
  return seen;
}

async function main(): Promise<void> {
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "stub@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");
  delete process.env.GOOGLE_SHEETS_PROMO_SHEET_NAME;

  const realFetch = globalThis.fetch;
  try {
    // --- 1. The actual PV sheet: tab is NOT "Sheet1". ---
    console.log('\nTab named "Painting and Vino Codes" (the real sheet):');
    const seen1 = stubGoogle("Painting and Vino Codes", ["codeA", "codeB", "codeC"]);
    const cfg1 = loadPromoCodeConfig();
    assert(cfg1 !== null, "config loads when the service-account env vars are set");
    const claimed1 = await claimNextCode(cfg1!);
    assert(claimed1 === "codeA", "claims the first code in the column");

    const valueCalls1 = seen1.filter((c) => c.url.includes("/values/"));
    assert(valueCalls1.length === 2, "makes exactly one read and one write of column A");
    assert(
      valueCalls1.every((c) => c.url.includes(encodeURIComponent("Painting and Vino Codes!"))),
      "every range names the sheet's real tab, not a guess"
    );
    assert(
      !valueCalls1.some((c) => c.url.includes("Sheet1")),
      'no request asks for "Sheet1" - this is the 400 "Unable to parse range" that silently killed email 3'
    );
    const write1 = valueCalls1.find((c) => c.method === "PUT");
    assert(
      write1?.body?.includes('"Painting and Vino Codes!A1:A3"') === true,
      "the PUT body's range field names the real tab too (Sheets rejects a mismatch)"
    );
    assert(
      JSON.parse(write1!.body!).values.map((r: string[]) => r[0]).join(",") === "codeB,codeC,",
      "writes the remaining codes back, blank-padding the vacated last cell"
    );

    // --- 2. Wine & Canvas's shape: tab really is "Sheet1". Must still work. ---
    console.log('\nTab named "Sheet1" (how the Wine & Canvas sheets are set up):');
    const seen2 = stubGoogle("Sheet1", ["only"]);
    const claimed2 = await claimNextCode(loadPromoCodeConfig()!);
    assert(claimed2 === "only", 'still claims correctly when the tab genuinely is "Sheet1"');
    assert(
      seen2.filter((c) => c.url.includes("/values/")).every((c) => c.url.includes("Sheet1!")),
      "resolves to Sheet1 without needing the env var"
    );

    // --- 3. An empty pool is null, not a throw - followups.ts tags for a human. ---
    console.log("\nEmpty pool:");
    stubGoogle("Painting and Vino Codes", []);
    const claimed3 = await claimNextCode(loadPromoCodeConfig()!);
    assert(claimed3 === null, "an empty column returns null rather than throwing");

    // --- 4. A stale env override must not reintroduce a bad range. ---
    console.log("\nGOOGLE_SHEETS_PROMO_SHEET_NAME set to a tab that does not exist:");
    process.env.GOOGLE_SHEETS_PROMO_SHEET_NAME = "Sheet1";
    const seen4 = stubGoogle("Painting and Vino Codes", ["x"]);
    const claimed4 = await claimNextCode(loadPromoCodeConfig()!);
    assert(claimed4 === "x", "a wrong env override no longer breaks the claim");
    assert(
      !seen4.some((c) => c.url.includes("/values/") && c.url.includes("Sheet1")),
      "falls back to the sheet's real tab and warns, instead of sending a range Google will reject"
    );
    delete process.env.GOOGLE_SHEETS_PROMO_SHEET_NAME;
  } finally {
    globalThis.fetch = realFetch;
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
