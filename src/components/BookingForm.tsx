"use client";

import { useState } from "react";
import { EVENT_DATES, slotEndTime } from "@/lib/event";
import SummaryModal, { BookingSummary } from "@/components/SummaryModal";

type SlotInfo = { id: string; time: string; capacity: number; available: number };
type Purpose = "DAILY" | "DELIVERY";

const PHONE_RE = /^0\d{8,9}$/;

const THAI_WEEKDAYS_SHORT = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function dateButtonParts(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = THAI_WEEKDAYS_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const monthShort = THAI_MONTHS_SHORT[month - 1];
  const yearShort = ((year + 543) % 100).toString().padStart(2, "0");
  return { weekday, day, monthShort, yearShort };
}

export default function BookingForm() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [lineId, setLineId] = useState("");
  const [hasLicense, setHasLicense] = useState<boolean | null>(null);
  const [purpose, setPurpose] = useState<Purpose | null>(null);

  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingSummary | null>(null);

  function selectDate(date: string) {
    setSelectedDate(date);
    setSlots(null);
    setSelectedSlotId(null);
    setSlotsLoading(true);
    fetch(`/api/slots?date=${date}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots))
      .finally(() => setSlotsLoading(false));
  }

  function changePhone(value: string) {
    setPhone(value);
    if (otpSentTo && value !== otpSentTo) {
      setVerificationId(null);
      setOtpSentTo(null);
      setOtpVerified(false);
      setOtpCode("");
      setDevCode(null);
      setOtpError(null);
    }
  }

  async function sendOtp() {
    setOtpError(null);
    if (!PHONE_RE.test(phone)) {
      setOtpError("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง");
      return;
    }
    setOtpSending(true);
    try {
      const res = await fetch("/api/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "send_failed");
      setVerificationId(data.verificationId);
      setOtpSentTo(phone);
      setOtpVerified(false);
      setOtpCode("");
      setDevCode(data.mock ? data.devCode : null);
    } catch {
      setOtpError("ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setOtpSending(false);
    }
  }

  async function verifyOtp() {
    if (!verificationId) return;
    setOtpError(null);
    setOtpVerifying(true);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId, phone, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const messages: Record<string, string> = {
          incorrect_code: "รหัส OTP ไม่ถูกต้อง",
          expired: "รหัส OTP หมดอายุ กรุณาขอรหัสใหม่",
          too_many_attempts: "กรอกผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่",
          already_used: "รหัสนี้ถูกใช้ไปแล้ว กรุณาขอรหัสใหม่",
        };
        setOtpError(messages[data.reason] || "ยืนยัน OTP ไม่สำเร็จ");
        return;
      }
      setOtpVerified(true);
    } catch {
      setOtpError("ยืนยัน OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setOtpVerifying(false);
    }
  }

  const formComplete =
    selectedSlotId &&
    fullName.trim().length >= 2 &&
    PHONE_RE.test(phone) &&
    lineId.trim().length >= 1 &&
    hasLicense !== null &&
    purpose !== null;

  const canSubmit = formComplete && otpVerified && verificationId && !submitting;

  async function submitBooking() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlotId,
          fullName: fullName.trim(),
          phone,
          lineId: lineId.trim(),
          hasLicense,
          purpose,
          verificationId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "slot_full") {
          setSubmitError("รอบเวลานี้เต็มแล้ว กรุณาเลือกรอบอื่น");
          if (selectedDate) {
            fetch(`/api/slots?date=${selectedDate}`)
              .then((r) => r.json())
              .then((d) => setSlots(d.slots));
          }
          setSelectedSlotId(null);
        } else if (data.error === "otp_not_verified") {
          setSubmitError("กรุณายืนยัน OTP ก่อนทำการจอง");
          setOtpVerified(false);
        } else {
          setSubmitError("จองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        }
        return;
      }
      setResult(data);
    } catch {
      setSubmitError("จองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNextBooking() {
    setResult(null);
    setSelectedDate(null);
    setSlots(null);
    setSelectedSlotId(null);
    setFullName("");
    setPhone("");
    setLineId("");
    setHasLicense(null);
    setPurpose(null);
    setVerificationId(null);
    setOtpSentTo(null);
    setOtpCode("");
    setOtpVerified(false);
    setDevCode(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-16">
      <Section step={1} icon={<CalendarIcon />} title="เลือกวันที่ต้องการทดลองขับ" description="กรุณาเลือกวันที่ต้องการจองคิวระหว่างวันที่ 1–7 ก.ค. 2569">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {EVENT_DATES.map((date) => {
            const { weekday, day, monthShort, yearShort } = dateButtonParts(date);
            const selected = selectedDate === date;
            return (
              <button
                key={date}
                onClick={() => selectDate(date)}
                className={`rounded-xl border py-2 text-center text-xs transition ${
                  selected
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-emerald-400"
                }`}
              >
                <div className={`text-[10px] font-medium ${selected ? "text-emerald-100" : "text-gray-500"}`}>วัน{weekday}</div>
                <div className="text-lg font-bold leading-tight">{day}</div>
                <div className={`text-[10px] ${selected ? "text-emerald-100" : "text-gray-400"}`}>{monthShort} {yearShort}</div>
              </button>
            );
          })}
        </div>
      </Section>

      {selectedDate && (
        <Section step={2} icon={<ClockIcon />} title="เลือกรอบเวลาที่ต้องการ" description="จำกัดรอบละ 2 คัน (ทดลองขับ 1 ชม. พักตรวจเช็คร 30 นาที)">
          {slotsLoading && <p className="text-sm text-gray-400">กำลังโหลดรอบเวลา...</p>}
          {slots && (
            <div className="space-y-2">
              {slots.map((slot, i) => {
                const full = slot.available <= 0;
                const selected = selectedSlotId === slot.id;
                return (
                  <button
                    key={slot.id}
                    disabled={full}
                    onClick={() => setSelectedSlotId(slot.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      full
                        ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60"
                        : selected
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-gray-200 bg-white hover:border-emerald-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`text-sm font-semibold ${selected ? "text-emerald-700" : "text-gray-800"}`}>
                          รอบที่ {i + 1}
                        </div>
                        <div className="text-xs text-gray-500">
                          {slot.time} – {slotEndTime(slot.time)} น.
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          full
                            ? "bg-gray-100 text-gray-400"
                            : selected
                              ? "bg-emerald-600 text-white"
                              : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {full ? "เต็มแล้ว" : `ว่าง ${slot.available} คัน`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {selectedSlotId && (
        <Section step={3} icon={<PersonIcon />} title="ข้อมูลผู้ลงทะเบียน">
          <div className="space-y-4">
            <Field label="ชื่อ-นามสกุล">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="เช่น สมชาย ใจดี"
                className="input"
              />
            </Field>
            <Field label="เบอร์โทรศัพท์">
              <input
                value={phone}
                onChange={(e) => changePhone(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0812345678"
                inputMode="numeric"
                className="input"
              />
            </Field>
            <Field label="LINE ID">
              <input
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
                placeholder="line_id"
                className="input"
              />
            </Field>
            <Field label="ใบอนุญาตขับขี่รถจักรยานยนต์">
              <div className="flex gap-3">
                <RadioPill
                  active={hasLicense === true}
                  onClick={() => setHasLicense(true)}
                  label="ฉันมีใบอนุญาตขับขี่"
                />
                <RadioPill
                  active={hasLicense === false}
                  onClick={() => setHasLicense(false)}
                  label="ไม่มีใบอนุญาตขับขี่"
                />
              </div>
            </Field>
            <Field label="วัตถุประสงค์ในการใช้งานมอเตอร์ไซค์">
              <div className="flex flex-wrap gap-3">
                <RadioPill
                  active={purpose === "DAILY"}
                  onClick={() => setPurpose("DAILY")}
                  label="ใช้งานประจำวัน"
                />
                <RadioPill
                  active={purpose === "DELIVERY"}
                  onClick={() => setPurpose("DELIVERY")}
                  label="ใช้งานธุรกิจ เดลิเวอรี่"
                />
              </div>
            </Field>
          </div>
        </Section>
      )}

      {formComplete && (
        <Section step={4} icon={<PhoneIcon />} title="ยืนยันตัวตนด้วย OTP">
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={sendOtp}
                disabled={otpSending || otpVerified}
                className="rounded-xl bg-gray-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-40"
              >
                {otpSending ? "กำลังส่ง..." : otpSentTo === phone && verificationId ? "ส่งรหัสอีกครั้ง" : "ส่ง OTP ไปที่เบอร์นี้"}
              </button>
              {otpVerified && (
                <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                  ✓ ยืนยันเบอร์โทรศัพท์แล้ว
                </span>
              )}
            </div>

            {devCode && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                [โหมดทดสอบ] รหัส OTP ของคุณคือ <span className="font-bold">{devCode}</span>{" "}
                (ยังไม่ได้เชื่อมต่อ SMSOK จริง)
              </p>
            )}

            {otpSentTo === phone && verificationId && !otpVerified && (
              <div className="flex gap-2">
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="กรอกรหัส OTP 6 หลัก"
                  inputMode="numeric"
                  maxLength={6}
                  className="input max-w-[180px]"
                />
                <button
                  onClick={verifyOtp}
                  disabled={otpVerifying || otpCode.length < 4}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
                >
                  {otpVerifying ? "กำลังตรวจสอบ..." : "ยืนยันรหัส"}
                </button>
              </div>
            )}

            {otpError && <p className="text-sm text-red-500">{otpError}</p>}
          </div>
        </Section>
      )}

      {formComplete && (
        <div>
          {submitError && <p className="mb-2 text-sm text-red-500">{submitError}</p>}
          <button
            onClick={submitBooking}
            disabled={!canSubmit}
            className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "กำลังจอง..." : otpVerified ? "ยืนยันการจอง" : "กรุณายืนยัน OTP ก่อนทำการจอง"}
          </button>
        </div>
      )}

      {result && <SummaryModal booking={result} onClose={resetForNextBooking} />}
    </div>
  );
}

function Section({
  step,
  icon,
  title,
  description,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <span className="h-4 w-4">{icon}</span>
        </span>
        <span>{step}. {title}</span>
      </h2>
      {description && <p className="mb-3 ml-8 text-xs text-gray-400">{description}</p>}
      {!description && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function RadioPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
      }`}
    >
      {label}
    </button>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z"/>
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.029 10 8 10c-2.03 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z"/>
    </svg>
  );
}
