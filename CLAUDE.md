# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

EV-Bike Chiangmai test-ride booking site: pick a date (1-7 July 2026), pick a
time slot (5 rounds/day, 2 bikes/round, 1hr ride + 30min maintenance buffer),
fill in registration info, verify phone via OTP, then book. Booking submission
is gated on a verified OTP and shows a summary modal on success.

Stack: Next.js 16 (App Router, TypeScript, Turbopack) + Tailwind v4 + Prisma 5
+ PostgreSQL (via Docker Compose locally).

## Commands

```bash
docker compose up -d         # start local Postgres (must be running for any DB command below)
npx prisma migrate dev       # apply schema migrations
npm run db:seed              # (re)seed the 35 slots (7 dates x 5 times) — idempotent upsert
npx prisma studio            # browse/edit DB data in a UI

npm run dev                  # dev server at localhost:3000
npm run build                # production build
npm run lint                 # eslint
npx tsc --noEmit             # type-check
```

There is no test suite configured yet.

After changing `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>`
to create+apply a migration and regenerate the client.

## Architecture

**Capacity enforcement is done with raw atomic UPDATEs inside a single
Prisma transaction, not application-level read-then-write.** See
`src/app/api/bookings/route.ts`: the OTP verification is atomically flipped
from `VERIFIED` to `CONSUMED` (`WHERE status = 'VERIFIED'`), and the slot's
`bookedCount` is atomically incremented (`WHERE bookedCount < capacity`).
Either `UPDATE ... RETURNING` returning zero rows aborts the transaction.
This is what makes "OTP must be verified before booking" and "max 2 bikes
per slot" hold under concurrent requests — don't replace these with
`findUnique` + `create` checks, that reintroduces the race.

**OTP has a mock mode**, controlled entirely by whether `SMSOK_API_KEY` /
`SMSOK_BASE_URL` are set in `.env` (see `src/lib/otp.ts`). With them unset,
`requestOtp` generates and stores a real code but returns it directly in the
API response as `devCode` (and the UI renders it in an amber box) instead of
sending an SMS — this is how the whole booking flow is testable without
SMSOK credentials. The real SMSOK request/response shape was not accessible
(JS-rendered docs at developer.smsok.co could not be fetched), so
`smsokSend`/`smsokVerify` in that file are a best-effort guess isolated
behind the `requestOtp`/`verifyOtp` functions — that's the one place to
patch once real credentials/responses are available.

**SMSOK requires a public webhook URL to exist before it will issue an API
key.** `src/app/api/webhook/smsok/route.ts` exists for this purpose: it
accepts both GET and POST, persists every field (method/headers/query/body)
to the `WebhookLog` table, and always returns 200. It's intentionally
unopinionated since SMSOK's actual callback method/payload shape is still
unconfirmed — inspect `WebhookLog` rows (via `prisma studio`) once a real
callback arrives to find out, rather than guessing further.

**Slot identity is a plain date string, not a `Date` object, in
application code.** `src/lib/event.ts` defines `EVENT_DATES` as 7 literal
`"YYYY-MM-DD"` strings and `formatThaiDate` parses them with
`Date.UTC(year, month-1, day)` rather than any local/offset-based parsing —
an earlier version that built a `Date` from `${isoDate}T00:00:00+07:00` and
then read back `getUTCDate()` silently shifted the displayed date by one day.
Keep date handling string-based/UTC-anchored; avoid introducing local-timezone
`Date` parsing for these event dates.

**Data flow for one booking:**
`POST /api/otp/request` (creates `OtpVerification`, status `PENDING`) →
`POST /api/otp/verify` (status → `VERIFIED`, max 5 attempts, single-use) →
`POST /api/bookings` (consumes the verification, reserves the slot, creates
`Booking` — see transaction above) → response includes `bookingRef` and
Thai-formatted date/time for the summary modal
(`src/components/SummaryModal.tsx`).

`GET /api/slots?date=YYYY-MM-DD` is the only read path for availability;
it derives `available = capacity - bookedCount` per slot rather than
counting bookings, so it stays consistent with the atomic update above.
