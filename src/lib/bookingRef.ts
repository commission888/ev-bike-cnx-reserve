import crypto from "node:crypto";

export function generateBookingRef(): string {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `EVB-${random}`;
}
