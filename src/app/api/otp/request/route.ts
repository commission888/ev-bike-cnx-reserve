import { NextRequest, NextResponse } from "next/server";
import { requestOtp } from "@/lib/otp";

const PHONE_RE = /^0\d{8,9}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phone = body?.phone;

  if (typeof phone !== "string" || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  try {
    const result = await requestOtp(phone);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[otp/request] error:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
}
