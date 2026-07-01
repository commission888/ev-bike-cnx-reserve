import { NextRequest, NextResponse } from "next/server";
import { readRange } from "@/lib/sheets";
import { isValidEventDate, SLOT_TIMES, SEATS_PER_SLOT } from "@/lib/event";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");

  if (!date || !isValidEventDate(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  // Count confirmed bookings per slot for this date
  // Bookings sheet columns: bookingRef(A), slotId(B), date(C), ...
  const rows = await readRange("Bookings!A:C");
  const bookingCounts: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[2] === date) {
      const slotId = row[1];
      bookingCounts[slotId] = (bookingCounts[slotId] || 0) + 1;
    }
  }

  const slots = SLOT_TIMES.map((time) => {
    const id = `${date}_${time}`;
    const booked = bookingCounts[id] || 0;
    return {
      id,
      time,
      capacity: SEATS_PER_SLOT,
      available: Math.max(0, SEATS_PER_SLOT - booked),
    };
  });

  return NextResponse.json({ date, slots });
}
