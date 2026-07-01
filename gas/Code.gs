/**
 * EV-Bike Chiangmai — Google Apps Script backend
 *
 * Deploy as Web App:
 *   Execute as: Me (your Google account)
 *   Who has access: Anyone
 *
 * Script Properties (Project Settings → Script Properties):
 *   SPREADSHEET_ID  — the Spreadsheet ID from the URL
 *   GAS_SECRET      — a random string, same value as GAS_SECRET in Netlify env vars
 *
 * Spreadsheet must have these tabs (exact names):
 *   Slots | OtpVerifications | Bookings | WebhookLogs
 * See SETUP.md for the column layout of each tab.
 */

var PROPS = PropertiesService.getScriptProperties();
var SPREADSHEET_ID = PROPS.getProperty("SPREADSHEET_ID");
var GAS_SECRET     = PROPS.getProperty("GAS_SECRET");
var CAPACITY       = 2; // bikes per slot

// ─── Entry points ────────────────────────────────────────────────────────────

function doGet(e) {
  return jsonOut({ ok: true, message: "EV-Bike GAS endpoint active" });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");

    // Simple shared-secret guard
    var secret = e.parameter.secret || data.secret || e.messageHeaders && e.messageHeaders["X-GAS-Secret"];
    // Also accept it from the HTTP request headers via X-GAS-Secret (set by Next.js)
    if (GAS_SECRET && secret !== GAS_SECRET) {
      return jsonOut({ error: "unauthorized" });
    }

    if (data.action === "createBooking") {
      return jsonOut(createBooking(data));
    }

    return jsonOut({ error: "unknown_action" });
  } catch (err) {
    return jsonOut({ error: "internal_error", message: String(err) });
  }
}

// ─── Booking (atomic with LockService) ───────────────────────────────────────

function createBooking(params) {
  var lock = LockService.getScriptLock();

  // Wait up to 15 s for the lock — rejects if the lock can't be acquired in time.
  var acquired = lock.tryLock(15000);
  if (!acquired) {
    return { error: "too_busy" };
  }

  try {
    var ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
    var otpSheet    = ss.getSheetByName("OtpVerifications");
    var bookingsSheet = ss.getSheetByName("Bookings");

    var verificationId = params.verificationId;
    var phone          = params.phone;
    var slotId         = params.slotId;
    var fullName       = params.fullName;
    var lineId         = params.lineId;
    var hasLicense     = params.hasLicense;
    var purpose        = params.purpose;

    // ── 1. Find & validate OTP (must be VERIFIED, not CONSUMED) ──────────────
    // OtpVerifications columns: A=id B=phone C=codeHash D=status E=attempts
    //                           F=createdAt G=expiresAt H=verifiedAt I=providerRef
    var otpValues  = otpSheet.getDataRange().getValues();
    var otpSheetRow = -1;

    for (var i = 1; i < otpValues.length; i++) {
      if (String(otpValues[i][0]) === verificationId) {
        otpSheetRow = i + 1; // 1-indexed (row 1 = header)
        break;
      }
    }

    if (
      otpSheetRow < 0 ||
      String(otpValues[otpSheetRow - 1][1]) !== phone ||
      String(otpValues[otpSheetRow - 1][3]) !== "VERIFIED"
    ) {
      return { error: "otp_not_verified" };
    }

    // ── 2. Check slot capacity ────────────────────────────────────────────────
    // Bookings columns: A=bookingRef B=slotId C=date D=time E=fullName
    //                   F=phone G=lineId H=hasLicense I=purpose J=createdAt
    var bookingValues = bookingsSheet.getDataRange().getValues();
    var slotCount = 0;
    for (var j = 1; j < bookingValues.length; j++) {
      if (String(bookingValues[j][1]) === slotId) {
        slotCount++;
      }
    }

    if (slotCount >= CAPACITY) {
      return { error: "slot_full" };
    }

    // ── 3. All good → consume OTP + create booking ────────────────────────────
    otpSheet.getRange(otpSheetRow, 4).setValue("CONSUMED"); // column D = status

    var bookingRef = "EVB-" + generateHex(8).toUpperCase();
    var now        = new Date().toISOString();

    // slotId format: "YYYY-MM-DD_HH:MM"
    var parts = slotId.split("_");
    var date  = parts[0];
    var time  = parts[1];

    bookingsSheet.appendRow([
      bookingRef, slotId, date, time,
      fullName, phone, lineId,
      hasLicense ? "TRUE" : "FALSE",
      purpose, now
    ]);

    return {
      bookingRef: bookingRef,
      fullName:   fullName,
      phone:      phone,
      lineId:     lineId,
      hasLicense: hasLicense,
      purpose:    purpose,
      date:       date,
      time:       time
    };

  } finally {
    lock.releaseLock();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateHex(bytes) {
  var result = "";
  for (var i = 0; i < bytes; i++) {
    result += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return result;
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
