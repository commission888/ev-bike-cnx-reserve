import { NextRequest, NextResponse } from "next/server";
import { formatThaiDate } from "@/lib/event";

const PHONE_RE = /^0\d{8,9}$/;
const PURPOSES = ["DAILY", "DELIVERY"] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { slotId, fullName, phone, lineId, hasLicense, purpose, verificationId } = body ?? {};

  if (
    typeof slotId !== "string" ||
    typeof fullName !== "string" ||
    fullName.trim().length < 2 ||
    typeof phone !== "string" ||
    !PHONE_RE.test(phone) ||
    typeof lineId !== "string" ||
    lineId.trim().length < 1 ||
    typeof hasLicense !== "boolean" ||
    !PURPOSES.includes(purpose) ||
    typeof verificationId !== "string"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const gasUrl = process.env.GAS_WEB_APP_URL;
  if (!gasUrl) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  let data: Record<string, unknown>;
  try {
    const res = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createBooking",
        secret: process.env.GAS_SECRET ?? "",
        verificationId,
        phone,
        slotId,
        fullName: fullName.trim(),
        lineId: lineId.trim(),
        hasLicense,
        purpose,
      }),
    });
    data = await res.json();
  } catch (err) {
    console.error("GAS call failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (data.error === "slot_full") {
    return NextResponse.json({ error: "slot_full" }, { status: 409 });
  }
  if (data.error === "otp_not_verified") {
    return NextResponse.json({ error: "otp_not_verified" }, { status: 400 });
  }
  if (data.error) {
    console.error("GAS booking error", data);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const date = String(data.date);
  return NextResponse.json({
    bookingRef: data.bookingRef,
    fullName: data.fullName,
    phone: data.phone,
    lineId: data.lineId,
    hasLicense: data.hasLicense,
    purpose: data.purpose,
    date,
    dateThai: formatThaiDate(date),
    time: data.time,
  });
}
