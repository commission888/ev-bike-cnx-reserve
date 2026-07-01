import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/otp";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { verificationId, phone, code } = body ?? {};

  if (
    typeof verificationId !== "string" ||
    typeof phone !== "string" ||
    typeof code !== "string"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await verifyOtp(verificationId, phone, code);
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[otp/verify] error:", err);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
