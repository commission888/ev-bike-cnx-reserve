"use client";

export type BookingSummary = {
  bookingRef: string;
  fullName: string;
  phone: string;
  lineId: string;
  hasLicense: boolean;
  purpose: "DAILY" | "DELIVERY";
  dateThai: string;
  time: string;
};

const PURPOSE_LABEL: Record<BookingSummary["purpose"], string> = {
  DAILY: "ใช้งานประจำวัน",
  DELIVERY: "ใช้งานธุรกิจ เดลิเวอรี่",
};

export default function SummaryModal({
  booking,
  onClose,
}: {
  booking: BookingSummary;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-7 w-7"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900">จองสำเร็จ!</h2>
          <p className="text-sm text-gray-500">กรุณาแสดงรหัสนี้ที่จุดลงทะเบียนในวันทดลองขับ</p>
        </div>

        <div className="mb-4 rounded-xl bg-emerald-50 py-3 text-center">
          <p className="text-xs text-emerald-700">รหัสการจอง</p>
          <p className="text-2xl font-bold tracking-widest text-emerald-700">
            {booking.bookingRef}
          </p>
        </div>

        <dl className="divide-y divide-gray-100 text-sm">
          <Row label="วันที่" value={booking.dateThai} />
          <Row label="รอบเวลา" value={`${booking.time} น.`} />
          <Row label="ชื่อ-นามสกุล" value={booking.fullName} />
          <Row label="เบอร์โทรศัพท์" value={booking.phone} />
          <Row label="LINE ID" value={booking.lineId} />
          <Row
            label="ใบอนุญาตขับขี่"
            value={booking.hasLicense ? "มีใบอนุญาตขับขี่" : "ไม่มีใบอนุญาตขับขี่"}
          />
          <Row label="วัตถุประสงค์" value={PURPOSE_LABEL[booking.purpose]} />
        </dl>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-emerald-600 py-3 font-medium text-white transition hover:bg-emerald-700"
        >
          ปิด
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
