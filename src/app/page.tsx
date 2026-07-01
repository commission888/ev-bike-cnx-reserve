import BookingForm from "@/components/BookingForm";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-gradient-to-br from-green-950 via-green-800 to-green-600 pb-10 pt-8 text-white">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12V8a8 8 0 0 1 14.93-3.93" />
              <path d="M20 12v4a8 8 0 0 1-14.93 3.93" />
              <polyline points="20 4 20 8 16 8" />
              <polyline points="4 20 4 16 8 16" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-wide">EV-Bike Chiangmai</h1>
          <p className="mt-1 text-sm text-green-100">ระบบจองคิวทดลองขับมอเตอร์ไซค์ไฟฟ้า</p>
          <div className="mt-4 inline-block rounded-full bg-amber-400 px-6 py-2 text-sm font-bold text-amber-900 shadow">
            เปิดบริการทดลองขับ 1 - 7 กรกฎาคม 2569
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <BookingForm />
      </main>
    </div>
  );
}
