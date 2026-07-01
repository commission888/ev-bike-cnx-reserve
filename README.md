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

## การเชื่อมต่อ SMSOK จริง

SMSOK (https://developer.smsok.co) เป็น API ส่ง SMS ธรรมดา **ไม่มี** endpoint
สำหรับสร้าง/ยืนยัน OTP ฝั่งเขา — รหัส OTP ถูกสร้างและตรวจสอบในระบบเราเองเสมอ
(ทั้ง mock mode และโหมดจริง), SMSOK ใช้แค่เป็นช่องทางส่งข้อความ SMS

Endpoint จริงที่มี: `POST /s` (ส่ง SMS), `GET /s/{message_id}` (เช็คสถานะ),
`GET /m/balance` (เช็คเครดิต) — ยืนยันตัวตนด้วย HTTP Basic Auth
(`base64(API_KEY:API_SECRET)`), base URL คือ `https://api.smsok.co`

ขั้นตอนที่แนะนำ:

1. **เปิด webhook ให้เข้าถึงจากอินเทอร์เน็ตได้ก่อน** (SMSOK บังคับต้องมี webhook URL
   ก่อนถึงจะสร้าง API key ได้ แม้ webhook นี้จะใช้แค่รับ delivery report ไม่ได้ใช้
   ยืนยัน OTP) — ตอน dev ใช้ ngrok: `ngrok http 3000` แล้วใช้
   `https://xxxx.ngrok-free.app/api/webhook/smsok`, หรือถ้า deploy แล้วใช้
   `https://<โดเมนจริง>/api/webhook/smsok`

2. **สร้าง API Key บนหน้า dashboard ของ SMSOK** — เลือก API Type เป็น **SMS**
   (ไม่ใช่ OTP เพราะไม่มีจริง) กรอก webhook URL ด้านบน จะได้ `API key` และ
   `API secret`

3. **ตรวจ 2 เรื่องนี้ในบัญชี SMSOK ก่อนทดสอบ** ไม่งั้นข้อความจะไม่ถึงมือผู้ใช้แม้ API
   จะตอบสำเร็จ:
   - **บัญชีทดลอง (trial) จะเปลี่ยนเนื้อหาข้อความเป็นข้อความเริ่มต้นเสมอ** — รหัส OTP
     ที่ใส่ไปจะไม่ถูกส่งจริง ต้องอัปเกรดบัญชีก่อน
   - **Sender ID (ชื่อผู้ส่ง) ต้องลงทะเบียนและได้รับอนุมัติล่วงหน้า** ถ้ายังไม่มีให้เว้น
     `SMSOK_SENDER_ID` ว่างไว้ก่อนได้ (จะยังทดสอบ endpoint ได้ แต่ sender ที่แสดงจะ
     เป็นค่า default)
   - ถ้าเปิด **IP Whitelist** ไว้ในหน้า dashboard ต้องปิดหรือเว้นว่าง เพราะ
     serverless function ของ Netlify ไม่มี IP ขาออกที่ตายตัวให้ whitelist ได้

4. **ใส่ค่าใน `.env` (และใน environment variables ของ Netlify ด้วย):**
   ```
   SMSOK_BASE_URL="https://api.smsok.co"
   SMSOK_API_KEY="..."
   SMSOK_API_SECRET="..."
   SMSOK_SENDER_ID="..."   # ชื่อผู้ส่งที่ลงทะเบียนไว้กับ SMSOK
   ```
   เมื่อ `SMSOK_API_KEY` และ `SMSOK_API_SECRET` ไม่ว่างทั้งคู่ ระบบจะสลับจาก mock
   mode ไปยิง SMS จริงทันที (ดูที่ `src/lib/otp.ts` — ฟังก์ชัน `smsokSendSms`)
   ถ้าเจอ 401 ตอนยิงจริง ให้สงสัยลำดับ key/secret ใน Basic Auth เป็นอันดับแรก
   (สเปคไม่ได้ระบุชัดว่าตัวไหนคือ username/password)

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
