# Roblox Script GetKey System

ระบบ GetKey สำหรับ Roblox Lua Script ที่มีความปลอดภัยสูง พร้อมระบบป้องกันการข้ามหน้าและโฆษณา Linkvertise

## 🚀 คุณสมบัติหลัก

- **ระบบ 3 Checkpoint**: ผู้ใช้ต้องผ่าน 3 หน้าโฆษณา Linkvertise
- **Key ส่วนตัว**: แต่ละคนได้รับ Key ที่แตกต่างกัน
- **Key มีอายุ**: กำหนดได้ (ค่าเริ่มต้น 24 ชั่วโมง)
- **Anti-bypass**: ป้องกันการข้ามหน้าโฆษณา 100%
- **Admin Dashboard**: จัดการระบบผ่านหน้า Admin
- **API Integration**: สำหรับ Lua Script ตรวจสอบ Key

## 🛠️ เทคโนโลยีที่ใช้

- **Backend**: Node.js + Express.js
- **Database**: MongoDB Atlas
- **Template Engine**: EJS
- **Authentication**: Express Session
- **Security**: Helmet, Rate Limiting
- **Deployment**: Railway

## 📋 การติดตั้ง

### 1. Clone Repository
```bash
git clone <repository-url>
cd roblox-getkey-system
```

### 2. ติดตั้ง Dependencies
```bash
npm install
```

### 3. ตั้งค่า Environment Variables
สร้างไฟล์ `.env` และใส่ค่าต่อไปนี้:

```env
PORT=3000
MONGODB_URI=mongodb+srv://Getkeyway:eeUSxcB2qWiDKwVd@cluster0.owt70md.mongodb.net/roblox-getkey?retryWrites=true&w=majority&appName=Cluster0
SESSION_SECRET=your-super-secret-session-key-change-this-in-production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password-here
DEFAULT_KEY_EXPIRY_HOURS=24
DEFAULT_LINKVERTISE_ID1=123456
DEFAULT_LINKVERTISE_ID2=123457
DEFAULT_LINKVERTISE_ID3=123458
```

### 4. รันระบบ
```bash
# Development
npm run dev

# Production
npm start
```

## 🌐 Route Structure

### Frontend Routes
- `GET /` - หน้าหลัก
- `GET /script/:shortId` - Checkpoint 1
- `GET /script/:shortId/checkpoint/2` - Checkpoint 2
- `GET /script/:shortId/checkpoint/3` - Checkpoint 3
- `GET /script/:shortId/download` - หน้ารับ Key

### API Routes
- `POST /api/create-key` - สร้าง Key ใหม่
- `GET /api/validate-key?key=xxx` - ตรวจสอบ Key (สำหรับ Lua)

### Admin Routes
- `GET /admin` - หน้า Login Admin
- `GET /admin/dashboard` - Admin Dashboard
- `POST /admin/settings` - อัพเดทการตั้งค่า

## 🔒 ระบบความปลอดภัย

### Anti-bypass Protection
- ใช้ Session ID จาก IP + User Agent
- ตรวจสอบการเข้าถึงแต่ละ Checkpoint
- ป้องกันการข้าม URL ตรงๆ

### Security Features
- Rate Limiting (100 requests/15 minutes)
- Helmet.js สำหรับ HTTP Security Headers
- Session-based Authentication
- Input Validation & Sanitization
- Auto-cleanup Expired Keys

### Client-side Protection
- ปิดการคลิกขวา (Right-click disabled)
- ปิด Developer Tools
- ปิด Text Selection
- ปิด Drag & Drop
- Console Clearing

## 📊 Admin Dashboard

### Statistics
- จำนวน Key ทั้งหมด
- จำนวน Key ที่ยังใช้งานได้
- จำนวน Key ที่หมดอายุ

### Settings
- ตั้งค่าอายุของ Key (1-168 ชั่วโมง)
- ตั้งค่า Linkvertise IDs ทั้ง 3 Checkpoint
- ลบ Key ที่หมดอายุ

## 🔌 การใช้งานกับ Lua Script

### ตัวอย่าง Lua Code
```lua
local HttpService = game:GetService("HttpService")

-- ฟังก์ชันตรวจสอบ Key
function validateKey(key)
    local success, response = pcall(function()
        return HttpService:GetAsync("https://your-domain.com/api/validate-key?key=" .. key)
    end)
    
    if success then
        local data = HttpService:JSONDecode(response)
        return data.valid
    end
    
    return false
end

-- ใช้งาน
local userKey = "USER_INPUT_KEY_HERE"
if validateKey(userKey) then
    print("Key valid! Loading script...")
    -- โหลด Script ของคุณที่นี่
else
    print("Invalid key! Please get a new key.")
end
```

## 🚀 Deploy บน Railway

### 1. เตรียมไฟล์
- `package.json` ✅
- `railway.json` ✅ 
- `.env` variables ✅

### 2. Deploy Steps
1. เชื่อมต่อ GitHub Repository กับ Railway
2. ตั้งค่า Environment Variables ใน Railway Dashboard
3. Deploy อัตโนมัติ

### 3. Environment Variables บน Railway
```
MONGODB_URI=mongodb+srv://...
SESSION_SECRET=your-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password
DEFAULT_KEY_EXPIRY_HOURS=24
DEFAULT_LINKVERTISE_ID1=123456
DEFAULT_LINKVERTISE_ID2=123457
DEFAULT_LINKVERTISE_ID3=123458
```

## 📝 การใช้งาน

### สำหรับผู้ใช้ทั่วไป
1. เข้าไปที่เว็บไซต์
2. ใส่ Script ID ของคุณ
3. ผ่าน 3 ขั้นตอนโฆษณา
4. รับ Key ที่มีอายุ 24 ชั่วโมง
5. นำ Key ไปใช้กับ Script

### สำหรับ Admin
1. เข้า `/admin` 
2. Login ด้วย Username/Password
3. ดูสถิติและตั้งค่าระบบ
4. อัพเดท Linkvertise IDs
5. จัดการ Key ที่หมดอายุ

## 🔧 Database Schema

### Keys Collection
```javascript
{
  key: String,          // Key ที่สร้าง (UUID)
  createdAt: Date,      // วันที่สร้าง
  expiresAt: Date,      // วันที่หมดอายุ
  ip: String           // IP Address ของผู้ใช้
}
```

### CheckpointStats Collection
```javascript
{
  userId: String,       // Session ID
  shortId: String,      // Script ID
  ip: String,          // IP Address
  checkpoint1Time: Date, // เวลาที่ผ่าน Checkpoint 1
  checkpoint2Time: Date, // เวลาที่ผ่าน Checkpoint 2
  checkpoint3Time: Date, // เวลาที่ผ่าน Checkpoint 3
  completed: Boolean,   // สถานะการเสร็จสิ้น
  completedAt: Date    // เวลาที่เสร็จสิ้น
}
```

### Settings Collection
```javascript
{
  keyExpiryHours: Number,    // อายุของ Key (ชั่วโมง)
  linkvertiseId1: String,    // Linkvertise ID สำหรับ Checkpoint 1
  linkvertiseId2: String,    // Linkvertise ID สำหรับ Checkpoint 2
  linkvertiseId3: String,    // Linkvertise ID สำหรับ Checkpoint 3
  updatedAt: Date           // วันที่อัพเดทล่าสุด
}
```

## 🛡️ ข้อควรระวัง

### Security
- เปลี่ยน `SESSION_SECRET` ใน production
- ใช้ HTTPS ใน production (ตั้ง `cookie.secure = true`)
- ตั้งค่า CORS ให้เหมาะสม
- อัพเดท Dependencies เป็นสม่ำเสมอ

### Performance
- ระบบลบ Key หมดอายุอัตโนมัติทุก 1 ชั่วโมง
- ใช้ Database Index เพื่อความเร็ว
- Rate Limiting ป้องกัน DDoS

## 📞 Support

หากมีปัญหาหรือข้อสงสัย สามารถติดต่อได้ที่:
- GitHub Issues
- หรือช่องทางอื่นที่กำหนด

## 📄 License

MIT License - ใช้งานได้อย่างเสรี

---

**หมายเหตุ**: อย่าลืมเปลี่ยน Linkvertise IDs และ Admin credentials ก่อนใช้งานจริง!