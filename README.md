# EV-Bike Chiangmai — ระบบจองคิวทดลองขับมอเตอร์ไซค์ไฟฟ้า

ระบบจองคิวทดลองขับ EV motorcycle วันที่ 1-7 กรกฎาคม 2569 เวลา 10.00-17.00 น.
(5 รอบ/วัน, รอบละ 2 คัน, ทดลองขับ 1 ชม. + พักตรวจเช็ครถ 30 นาที) พร้อมยืนยันเบอร์โทรศัพท์ด้วย OTP ก่อนกดจอง

Stack: Next.js (App Router, TypeScript) + Tailwind + Prisma + PostgreSQL.

## เริ่มต้นใช้งาน (local dev)

```bash
docker compose up -d        # ตั้ง PostgreSQL
npx prisma migrate dev      # สร้างตาราง (รันครั้งแรกครั้งเดียว ถ้ายังไม่เคยรัน)
npm run db:seed             # สร้าง 35 รอบเวลา (7 วัน x 5 รอบ)
npm run dev                 # http://localhost:3000
```

## โหมดทดสอบ OTP (Mock mode)

ตราบใดที่ยังไม่ได้ใส่ `SMSOK_API_KEY` ใน `.env` ระบบจะรันในโหมด mock:
ขอ OTP เบอร์ไหนก็ได้ รหัสจะถูก log ออกที่ console ของ server **และ** ส่งกลับมาใน
response field `devCode` (และโชว์ในหน้าเว็บเป็นกล่องสีเหลือง) เพื่อให้ทดสอบ flow
การจองทั้งหมดได้โดยไม่ต้องรอเชื่อมต่อ SMSOK จริง

## การเชื่อมต่อ SMSOK OTP จริง

SMSOK (https://developer.smsok.co) เป็นเอกสารแบบ JavaScript SPA ที่ไม่สามารถอ่าน
เนื้อหาผ่าน fetch อัตโนมัติได้ และตามที่แจ้งไว้ การสร้าง API key/secret ต้อง**มี
webhook URL พร้อมใช้งานก่อน** ขั้นตอนที่แนะนำ:

1. **เปิด webhook ให้เข้าถึงจากอินเทอร์เน็ตได้ก่อน** (ระหว่างรัน `npm run dev`):
   ```bash
   ngrok http 3000
   ```
   จะได้ URL แบบ `https://xxxx.ngrok-free.app` — webhook URL ที่ใช้สมัครคือ
   `https://xxxx.ngrok-free.app/api/webhook/smsok`

2. **สมัคร/สร้าง API key บนหน้า dashboard ของ SMSOK** โดยกรอก webhook URL ด้านบน
   จะได้ `API key` และ `API secret`

3. **ลองยิงเทส** ขอ/ยืนยัน OTP จริงจากหน้า dashboard ของ SMSOK (หรือเอกสารที่เขาให้มา
   หลังสมัคร) แล้วดู log ที่ terminal (`[smsok webhook] ...`) หรือเปิดดูตาราง
   `WebhookLog` ด้วย `npx prisma studio` — จะเห็นว่า callback ที่ส่งมาเป็น GET หรือ
   POST จริง และ payload หน้าตาเป็นอย่างไร (route นี้รับทั้งสองแบบไว้แล้วที่
   `src/app/api/webhook/smsok/route.ts`)

4. **ใส่ค่าใน `.env`:**
   ```
   SMSOK_BASE_URL="https://api.smsok.co"      # base URL จริงจากเอกสาร/dashboard
   SMSOK_API_KEY="..."
   SMSOK_API_SECRET="..."
   SMSOK_SEND_OTP_PATH="/otp/request"          # ปรับตาม endpoint จริง
   SMSOK_VERIFY_OTP_PATH="/otp/verify"         # ปรับตาม endpoint จริง
   ```
   เมื่อ `SMSOK_API_KEY` ไม่ว่าง ระบบจะสลับจาก mock mode ไปเรียก API จริงทันที
   (ดูที่ `src/lib/otp.ts` — ฟังก์ชัน `smsokSend` / `smsokVerify` เป็นจุดเดียวที่ต้อง
   แก้ให้ตรงกับ request/response shape จริงของ SMSOK ถ้าไม่ตรงกับที่เดาไว้)

## โครงสร้างหลัก

- `src/lib/event.ts` — วันที่/รอบเวลาของงาน (1-7 ก.ค. 2569, 5 รอบ/วัน)
- `src/lib/otp.ts` — OTP adapter (mock mode + SMSOK client)
- `src/app/api/slots` — ดูจำนวนที่ว่างต่อรอบ
- `src/app/api/otp/request`, `src/app/api/otp/verify` — ขอ/ยืนยัน OTP
- `src/app/api/bookings` — สร้างการจอง (ตรวจ OTP verified + กันรอบเต็มแบบ atomic)
- `src/app/api/webhook/smsok` — รับ callback จาก SMSOK (GET/POST) และบันทึกลง `WebhookLog`
- `src/components/BookingForm.tsx` — หน้าจองทั้งหมด (เลือกวัน → รอบ → กรอกข้อมูล → OTP → จอง)
- `src/components/SummaryModal.tsx` — modal สรุปการจองหลังกดจองสำเร็จ

## คำสั่งที่ใช้บ่อย

```bash
npx prisma studio   # เปิดดู/แก้ข้อมูลในฐานข้อมูลผ่าน UI
npm run lint         # ESLint
npx tsc --noEmit     # type-check
```
