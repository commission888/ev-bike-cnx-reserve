import crypto from "node:crypto";
import { readRange, appendRow, updateCell } from "@/lib/sheets";

const OTP_TTL_MINUTES = 5;
const MAX_VERIFY_ATTEMPTS = 5;

const SMSOK_BASE_URL = process.env.SMSOK_BASE_URL || "";
const SMSOK_API_KEY = process.env.SMSOK_API_KEY || "";
const SMSOK_API_SECRET = process.env.SMSOK_API_SECRET || "";
const SMSOK_SEND_PATH = process.env.SMSOK_SEND_OTP_PATH || "/otp/request";
const SMSOK_VERIFY_PATH = process.env.SMSOK_VERIFY_OTP_PATH || "/otp/verify";

const isMockMode = !SMSOK_API_KEY || !SMSOK_BASE_URL;

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

// Best-effort SMSOK client — isolated here as the single place to patch
// once real credentials/webhook payload confirm the actual contract.
async function smsokSend(phone: string): Promise<{ providerRef: string | null }> {
  const res = await fetch(`${SMSOK_BASE_URL}${SMSOK_SEND_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SMSOK_API_KEY}`,
      "X-Api-Secret": SMSOK_API_SECRET,
    },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    throw new Error(`SMSOK send OTP failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json().catch(() => ({}));
  return { providerRef: data.refId ?? data.requestId ?? data.id ?? null };
}

async function smsokVerify(
  phone: string,
  code: string,
  providerRef: string | null
): Promise<boolean> {
  const res = await fetch(`${SMSOK_BASE_URL}${SMSOK_VERIFY_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SMSOK_API_KEY}`,
      "X-Api-Secret": SMSOK_API_SECRET,
    },
    body: JSON.stringify({ phone, otp: code, refId: providerRef }),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return Boolean(data.success ?? data.verified ?? data.valid);
}

export async function requestOtp(phone: string) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  const now = new Date().toISOString();

  if (isMockMode) {
    const code = generateCode();
    await appendRow(OTP_SHEET, [
      id, phone, hashCode(code), "PENDING", 0,
      now, expiresAt.toISOString(), "", "",
    ]);
    console.log(`[otp mock] OTP for ${phone}: ${code} (expires ${expiresAt.toISOString()})`);
    return { verificationId: id, mock: true as const, devCode: code };
  }

  const { providerRef } = await smsokSend(phone);
  await appendRow(OTP_SHEET, [
    id, phone, "", "PENDING", 0,
    now, expiresAt.toISOString(), "", providerRef ?? "",
  ]);
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

  const providerRef = row[OTP_COL.providerRef.idx] || null;
  const isMockVerify = !providerRef && isMockMode;
  const correct = isMockVerify
    ? row[OTP_COL.codeHash.idx] === hashCode(code)
    : await smsokVerify(phone, code, providerRef);

  if (!correct) {
    await updateCell(OTP_SHEET, sheetRow, OTP_COL.attempts.letter, String(attempts + 1));
    return { ok: false, reason: "incorrect_code" as const };
  }

  await updateCell(OTP_SHEET, sheetRow, OTP_COL.status.letter, "VERIFIED");
  await updateCell(OTP_SHEET, sheetRow, OTP_COL.verifiedAt.letter, new Date().toISOString());
  return { ok: true as const };
}
