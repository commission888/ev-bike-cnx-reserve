import crypto from "node:crypto";
import { readRange, appendRow, updateCell } from "@/lib/sheets";

const OTP_TTL_MINUTES = 5;
const MAX_VERIFY_ATTEMPTS = 5;

const SMSOK_BASE_URL = process.env.SMSOK_BASE_URL || "https://api.smsok.co";
const SMSOK_API_KEY = process.env.SMSOK_API_KEY || "";
const SMSOK_API_SECRET = process.env.SMSOK_API_SECRET || "";
const SMSOK_SENDER_ID = process.env.SMSOK_SENDER_ID || "";

const isMockMode = !SMSOK_API_KEY || !SMSOK_API_SECRET;

// OtpVerifications sheet columns (1-indexed letter for updateCell, 0-indexed for array access)
const OTP_SHEET = "OtpVerifications";
const OTP_COL = {
  id: { idx: 0, letter: "A" },
  phone: { idx: 1, letter: "B" },
  codeHash: { idx: 2, letter: "C" },
  status: { idx: 3, letter: "D" },
  attempts: { idx: 4, letter: "E" },
  createdAt: { idx: 5, letter: "F" },
  expiresAt: { idx: 6, letter: "G" },
  verifiedAt: { idx: 7, letter: "H" },
  providerRef: { idx: 8, letter: "I" },
} as const;

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

// SMSOK (https://developer.smsok.co) only exposes a generic "send SMS"
// endpoint (POST /s, HTTP Basic Auth) — there is no hosted OTP send/verify
// API. The OTP code is always generated and checked locally (see
// requestOtp/verifyOtp below); SMSOK is used purely as the SMS transport.
async function smsokSendSms(phone: string, text: string): Promise<void> {
  const auth = Buffer.from(`${SMSOK_API_KEY}:${SMSOK_API_SECRET}`).toString("base64");
  const res = await fetch(`${SMSOK_BASE_URL}/s`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      sender: SMSOK_SENDER_ID,
      text,
      destinations: [{ destination: phone }],
    }),
  });
  if (!res.ok) {
    const raw = await res.text();
    let detail = raw;
    try {
      detail = JSON.parse(raw)?.error?.description || raw;
    } catch {
      // raw body wasn't JSON — fall back to the raw text as-is
    }
    throw new Error(`SMSOK send SMS failed: ${res.status} ${detail}`);
  }
}

export async function requestOtp(phone: string) {
  const id = crypto.randomUUID();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  const now = new Date().toISOString();

  await appendRow(OTP_SHEET, [
    id, phone, hashCode(code), "PENDING", 0,
    now, expiresAt.toISOString(), "", "",
  ]);

  if (isMockMode) {
    console.log(`[otp mock] OTP for ${phone}: ${code} (expires ${expiresAt.toISOString()})`);
    return { verificationId: id, mock: true as const, devCode: code };
  }

  await smsokSendSms(phone, `รหัสยืนยัน EV-Bike CNX: ${code} (หมดอายุใน ${OTP_TTL_MINUTES} นาที)`);
  return { verificationId: id, mock: false as const };
}

export async function verifyOtp(verificationId: string, phone: string, code: string) {
  // rows[0] is the header row; data rows start at rows[1]
  const rows = await readRange(`${OTP_SHEET}!A:I`);

  let sheetRow = -1;
  let row: string[] | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][OTP_COL.id.idx] === verificationId) {
      sheetRow = i + 1; // 1-indexed: rows[0] = sheet row 1, rows[1] = sheet row 2, etc.
      row = rows[i];
      break;
    }
  }

  if (!row || row[OTP_COL.phone.idx] !== phone) {
    return { ok: false, reason: "not_found" as const };
  }

  const status = row[OTP_COL.status.idx];
  const attempts = parseInt(row[OTP_COL.attempts.idx] || "0", 10);
  const expiresAt = new Date(row[OTP_COL.expiresAt.idx]);

  if (status === "CONSUMED") return { ok: false, reason: "already_used" as const };
  if (status === "VERIFIED") return { ok: true as const };

  if (expiresAt < new Date()) {
    await updateCell(OTP_SHEET, sheetRow, OTP_COL.status.letter, "EXPIRED");
    return { ok: false, reason: "expired" as const };
  }
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" as const };
  }

  const correct = row[OTP_COL.codeHash.idx] === hashCode(code);

  if (!correct) {
    await updateCell(OTP_SHEET, sheetRow, OTP_COL.attempts.letter, String(attempts + 1));
    return { ok: false, reason: "incorrect_code" as const };
  }

  await updateCell(OTP_SHEET, sheetRow, OTP_COL.status.letter, "VERIFIED");
  await updateCell(OTP_SHEET, sheetRow, OTP_COL.verifiedAt.letter, new Date().toISOString());
  return { ok: true as const };
}
