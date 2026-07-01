# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

EV-Bike Chiangmai test-ride booking site: pick a date (1-7 July 2026), pick a
time slot (5 rounds/day, 2 bikes/round, 1hr ride + 30min maintenance buffer),
fill in registration info, verify phone via OTP, then book. Booking submission
is gated on a verified OTP and shows a summary modal on success.

Stack: Next.js 16 (App Router, TypeScript, Turbopack) + Tailwind v4. No
database — all data lives in a Google Sheet, read/written via the
`googleapis` service-account client (`src/lib/sheets.ts`) and, for booking
creation specifically, a separate Google Apps Script (GAS) Web App
(`gas/Code.gs`). There is no Prisma/PostgreSQL/Docker Compose in this
project despite what stray `prisma/` or `docker-compose.yml` files in the
working tree might suggest — those are not wired into the app (check
`package.json`: no `prisma` dependency) and should not be relied on or
resurrected without checking with the user first.

## Commands

```bash
npm run dev                  # dev server at localhost:3000
npm run build                # production build
npm run lint                 # eslint
npx tsc --noEmit             # type-check
```

There is no test suite and no seed script configured. The 7 dates x 5
slot-times aren't stored anywhere — they're computed on the fly from the
`EVENT_DATES` / `SLOT_TIMES` constants in `src/lib/event.ts`.

The Google Sheet itself (tabs: `OtpVerifications`, `Bookings`, `WebhookLogs`)
and the GAS Web App deployment are external state this repo doesn't manage —
there's no migration/seed command for them. Use `GOOGLE_SHEETS_SPREADSHEET_ID`
+ a browser to inspect sheet contents directly.

## Architecture

**Two separate paths write to the same Google Sheet, for different reasons.**
`src/lib/sheets.ts` (a thin `googleapis` wrapper: `readRange`/`appendRow`/
`updateCell`) is used directly by Next.js API routes for everything that
doesn't need atomicity: `src/lib/otp.ts` (OTP request/verify) and
`src/app/api/webhook/smsok/route.ts` (logging). Booking creation instead
goes through `gas/Code.gs`, a Google Apps Script Web App reached via
`fetch(process.env.GAS_WEB_APP_URL, ...)` from
`src/app/api/bookings/route.ts` — because that's the only place capacity
enforcement needs a real mutex, and the Sheets API itself has no atomic
UPDATE primitive.

**Capacity enforcement lives entirely inside `gas/Code.gs`'s `createBooking`,
guarded by `LockService.getScriptLock()`.** Under the lock it: (1) checks the
`OtpVerifications` row for the given `verificationId`/`phone` is `VERIFIED`
(not `CONSUMED`/expired), (2) counts existing `Bookings` rows for that
`slotId` and rejects if `>= CAPACITY` (2), (3) only then flips the OTP row to
`CONSUMED` and appends the booking row. This check-then-act is a manual
critical section, not a DB-level atomic UPDATE — it's only race-free because
the lock wraps the *entire* read-count-then-write sequence. Do not "optimize"
this into separate read/write calls or move it off the Apps Script side;
that reintroduces the race the lock exists to prevent. `src/app/api/bookings/
route.ts` is a thin proxy: it forwards the request with a shared secret
(`GAS_SECRET`) and translates GAS's `{error: "slot_full" | "otp_not_verified"}`
responses into HTTP status codes.

**OTP codes are always generated and verified locally — SMSOK is a plain SMS
transport, not a hosted OTP service.** See `src/lib/otp.ts`. There is no
mode where a third party validates the code; `requestOtp` always generates
a 6-digit code and stores its SHA-256 hash in `OtpVerifications`, and
`verifyOtp` always compares against that hash. The only thing that toggles
on `SMSOK_API_KEY`/`SMSOK_API_SECRET` being set is *delivery*: unset, the
code is logged and returned as `devCode` in the API response (rendered in an
amber box in the UI) instead of being sent; set, `smsokSendSms` calls
`POST https://api.smsok.co/s` with HTTP Basic Auth
(`base64(SMSOK_API_KEY:SMSOK_API_SECRET)`). This mirrors SMSOK's real,
confirmed OpenAPI spec (fetched from `developer.smsok.co/merged-api.ref.json`
— the doc site itself is a JS SPA that can't be scraped directly, but that
underlying spec file can) — there is no `/otp/request` or `/otp/verify`
endpoint on SMSOK's side, only generic SMS send/status/balance endpoints.
Note: SMSOK trial accounts silently override both `sender` and `text` with a
fixed default message server-side — if a real send returns 200 but the
recipient gets a generic message instead of the code, that's account tier
(needs top-up + an approved Sender ID), not a bug in this code.

**SMSOK requires a public webhook URL to exist before it will issue an API
key.** `src/app/api/webhook/smsok/route.ts` exists for this purpose: it
accepts both GET and POST, persists every field (method/headers/query/body)
to the `WebhookLogs` sheet tab via `appendRow`, and always returns 200. It's
intentionally unopinionated since SMSOK's actual callback payload shape is
still unconfirmed — inspect the `WebhookLogs` tab directly in the Google
Sheet once a real callback arrives, rather than guessing further.

**Slot identity is a plain date string, not a `Date` object, in
application code.** `src/lib/event.ts` defines `EVENT_DATES` as 7 literal
`"YYYY-MM-DD"` strings and `formatThaiDate` parses them with
`Date.UTC(year, month-1, day)` rather than any local/offset-based parsing —
an earlier version that built a `Date` from `${isoDate}T00:00:00+07:00` and
then read back `getUTCDate()` silently shifted the displayed date by one day.
Keep date handling string-based/UTC-anchored; avoid introducing local-timezone
`Date` parsing for these event dates.

**Data flow for one booking:**
`POST /api/otp/request` (appends an `OtpVerifications` row, status
`PENDING`) → `POST /api/otp/verify` (status → `VERIFIED`, max 5 attempts,
single-use) → `POST /api/bookings` (proxies to the GAS Web App, which
atomically consumes the verification and reserves the slot under
`LockService` — see above) → response includes `bookingRef` and
Thai-formatted date/time for the summary modal
(`src/components/SummaryModal.tsx`).

`GET /api/slots?date=YYYY-MM-DD` is the read path for availability; it reads
every `Bookings` row for that date, tallies a live count per `slotId`, and
subtracts from `SEATS_PER_SLOT` (`src/lib/event.ts`) — it's a real-time
count against the same sheet the GAS lock writes to, not a cached/stored
counter, so it can't drift out of sync with actual bookings.
