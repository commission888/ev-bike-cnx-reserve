import { NextRequest, NextResponse } from "next/server";
import { appendRow } from "@/lib/sheets";
import crypto from "node:crypto";

// SMSOK requires a webhook URL before it will issue an API key. This route
// accepts GET and POST, persists every field to WebhookLogs, and always
// returns 200. Inspect the sheet once a real callback arrives to learn the
// actual method/payload shape before patching smsokVerify in otp.ts.
async function logRequest(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  const headers = Object.fromEntries(req.headers.entries());

  let body: unknown = null;
  const raw = await req.text();
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  await appendRow("WebhookLogs", [
    crypto.randomUUID(),
    req.method,
    JSON.stringify(headers),
    JSON.stringify(query),
    body !== null ? JSON.stringify(body) : "",
    new Date().toISOString(),
  ]);

  console.log(`[smsok webhook] ${req.method}`, { query, body });
}

export async function GET(req: NextRequest) {
  await logRequest(req);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  await logRequest(req);
  return NextResponse.json({ ok: true });
}
