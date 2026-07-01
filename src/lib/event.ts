// EV-Bike Chiangmai test-ride event: 1-7 July 2026 (2569 BE), 5 rounds/day,
// each round is a 1hr test ride followed by a 30min maintenance check.
export const EVENT_DATES = [
  "2026-07-01",
  "2026-07-02",
  "2026-07-03",
  "2026-07-04",
  "2026-07-05",
  "2026-07-06",
  "2026-07-07",
] as const;

export const SLOT_TIMES = ["10:00", "11:30", "13:00", "14:30", "16:00"] as const;

export const SEATS_PER_SLOT = 2;

export function slotEndTime(startTime: string): string {
  const [h, m] = startTime.split(":").map(Number);
  const totalMinutes = h * 60 + m + 60; // 1hr ride
  const endH = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const endM = (totalMinutes % 60).toString().padStart(2, "0");
  return `${endH}:${endM}`;
}

const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function formatThaiDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Treat isoDate as a plain calendar date (no timezone conversion) by
  // anchoring it at UTC midnight purely to look up the weekday.
  const weekday = THAI_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const buddhistYear = year + 543;
  return `วัน${weekday}ที่ ${day} ${THAI_MONTHS[month - 1]} ${buddhistYear}`;
}

export function isValidEventDate(date: string): boolean {
  return (EVENT_DATES as readonly string[]).includes(date);
}

export function isValidSlotTime(time: string): boolean {
  return (SLOT_TIMES as readonly string[]).includes(time);
}
