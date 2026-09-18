// Minimal Google Sheets client for the private-event follow-up promo code
// pool (email 3 of the 24h/72h/120h no-response sequence - see
// src/followups.ts). Deliberately implemented with plain `fetch` + a
// hand-signed service-account JWT rather than pulling in the full
// `googleapis` package, matching this codebase's existing style
// (src/zendesk.ts and src/ai.ts are both thin fetch-based clients, no heavy
// SDKs beyond the Anthropic one this project's whole purpose needs).
//
// SOURCE OF TRUTH: the "private event 5 day macro codes" Google Sheet
// (shared by Jessica, linked by Christopher 2026-09-18) - codes live one
// per row starting at cell A1, no header row. Claiming a code deletes it
// from the sheet (by rewriting the column with that row removed), so the
// sheet itself is always the live, authoritative remaining pool - anyone
// can see exactly what's left just by opening it, and a code Bonnie hands
// out manually by editing the sheet directly is automatically respected
// (this code always reads current sheet state, never caches the pool).
//
// SETUP REQUIRED before this can actually run (Christopher, not something
// Claude can do without Google Cloud Console access):
//   1. Create a Google Cloud project (or reuse an existing one) and a
//      service account in it, with a JSON key downloaded.
//   2. Enable the Google Sheets API for that project.
//   3. Share the promo code Google Sheet with the service account's email
//      (it looks like `...@...iam.gserviceaccount.com`), Editor access -
//      it needs to be able to delete/rewrite rows, not just read.
//   4. Set two env vars on the live server: GOOGLE_SERVICE_ACCOUNT_EMAIL
//      (the service account's email) and
//      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (the `private_key` field from
//      the downloaded JSON key, with literal `\n` sequences preserved -
//      this file unescapes them at load time, see loadPromoCodeConfig
//      below).
// Until those are set, claimNextCode() returns null and followups.ts logs
// a clear error + tags the ticket for a human to send email 3 by hand
// rather than crashing the poller.

import crypto from "node:crypto";

export interface PromoCodeConfig {
  spreadsheetId: string;
  sheetName: string;
  serviceAccountEmail: string;
  privateKey: string;
}

/** Returns null (not throws) if the required env vars aren't set yet - see the setup note above. */
export function loadPromoCodeConfig(): PromoCodeConfig | null {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!serviceAccountEmail || !rawPrivateKey) return null;
  return {
    // Confirmed sheet, shared by Jessica, linked by Christopher 2026-09-18 -
    // overridable via env if the codes ever move to a different sheet.
    spreadsheetId: process.env.GOOGLE_SHEETS_PROMO_SPREADSHEET_ID ?? "1AixKYtV9Zo2mr-p559yK0tViesPSPIFBHbZv9P0xggE",
    sheetName: process.env.GOOGLE_SHEETS_PROMO_SHEET_NAME ?? "Sheet1",
    serviceAccountEmail,
    // Env vars can't hold real newlines cleanly - the downloaded JSON key's
    // private_key has embedded `\n`, which becomes the literal two
    // characters `\` and `n` once pasted into most .env / host env-var
    // UIs. Unescape them back into real newlines, which is what the RSA
    // PEM parser needs.
    privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
  };
}

interface CachedToken {
  token: string;
  expiresAt: number; // unix seconds
}

let cachedToken: CachedToken | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(cfg: PromoCodeConfig): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > nowSec + 60) return cachedToken.token;

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: cfg.serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), cfg.privateKey);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google OAuth token request failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: nowSec + data.expires_in };
  return data.access_token;
}

async function sheetsRequest<T>(cfg: PromoCodeConfig, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(cfg);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Google Sheets API ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as T;
}

/** Reads the current pool (column A, no header row), top to bottom, blanks filtered out. */
async function readCodes(cfg: PromoCodeConfig): Promise<string[]> {
  const range = encodeURIComponent(`${cfg.sheetName}!A:A`);
  const data = await sheetsRequest<{ values?: string[][] }>(cfg, `/values/${range}`);
  return (data.values ?? []).map((row) => row[0]?.trim()).filter((v): v is string => Boolean(v));
}

/**
 * Claims (removes) the next unused code and returns it, or null if the pool
 * is empty. Rewrites the whole column rather than using a batchUpdate
 * deleteDimension call, since that needs the sheet's numeric gid and this
 * is simpler and plenty fast for a ~50-row pool: read everything, drop the
 * first code, write the remainder back starting at A1, and blank the one
 * now-unused trailing cell so no stale value is left behind.
 */
export async function claimNextCode(cfg: PromoCodeConfig): Promise<string | null> {
  const codes = await readCodes(cfg);
  if (codes.length === 0) return null;

  const [claimed, ...remaining] = codes;
  const range = encodeURIComponent(`${cfg.sheetName}!A1:A${codes.length}`);
  const values = [...remaining.map((c) => [c]), [""]]; // pad with one blank row to overwrite the old last cell
  await sheetsRequest(cfg, `/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ range: `${cfg.sheetName}!A1:A${codes.length}`, majorDimension: "ROWS", values }),
  });
  return claimed;
}

/** How many codes are left - used for logging; the actual low-stock alert to Christopher is a separate Cowork scheduled task that reads this same sheet directly. */
export async function getRemainingCount(cfg: PromoCodeConfig): Promise<number> {
  return (await readCodes(cfg)).length;
}
