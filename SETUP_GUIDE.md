# 🚀 Hướng dẫn Chi Tiết Google Apps Script + Telegram Bot

## 📦 Cấu trúc thư mục

```
telegram-webhook/
├── bot.gs                 # Script chính (webhooks & handlers)
├── advanced-features.js   # Tính năng nâng cao
├── payments-admin.js      # Thanh toán & admin functions
├── README.md              # Hướng dẫn chính
---
└── SETUP_GUIDE.md         # Bắt đầu nhanh
```

---

## 🔧 Cấu hình Ban Đầu

### 1️⃣ **Tạo Bot Telegram**

```bash
# Mở Telegram, tìm @BotFather
/start
/newbot
# Đặt tên: "SkyHub Bot"
# Đặt username: "skyhub_bot"
# Lưu token
```

**Token Format:** `123456789:ABCDefGhIjKlMnOpQrStUvWxYzABCDefG`

---

### 2️⃣ **Tạo Google Apps Script**

```bash
1. Truy cập https://script.google.com
2. Tạo project mới
3. Xóa code mặc định
4. Copy code từ bot.gs
5. Cập nhật BOT_TOKEN
6. Save
```

---

### 3️⃣ **Deploy Web App**

```bash
1. Click "Deploy" > "New deployment"
2. Select type: "Web app"
3. Execute as: Your account
4. Who has access: "Anyone"
5. Deploy
6. Copy Web app URL
7. Cho phép quyền truy cập
```

**URL Format:** `https://script.google.com/macros/s/AK...z/usercontent`

---

### 4️⃣ **Thiết lập Webhook**

**Cách 1: Từ Script UI**
```javascript
// Mở Apps Script console
// Chọn setupWebhook function
// Click "Run"
```

**Cách 2: Từ Terminal (PowerShell)**
```powershell
$url = "https://api.telegram.org/botYOUR_TOKEN/setWebhook"
$body = @{
    "url" = "https://your-apps-script-url?secret=your_secret_key"
    "allowed_updates" = @("message", "callback_query")
} | ConvertTo-Json

Invoke-WebRequest -Uri $url -Method Post -ContentType "application/json" -Body $body
```

**Cách 3: Dùng cURL**
```bash
curl -X POST "https://api.telegram.org/botYOUR_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "YOUR_SCRIPT_URL?secret=your_secret",
    "allowed_updates": ["message", "callback_query"]
  }'
```

---

## 📱 Kiểm Tra Webhook

```javascript
// Chạy function này trong Apps Script
function getWebhookInfo() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    muteHttpExceptions: true
  });
  Logger.log(response.getContentText());
}
```

**Output mong đợi:**
```
```json
## 📌 Lưu ý về lệnh, nhắc và tài liệu

- **COMMANDS metadata:** Đặt tất cả command definitions vào mảng `COMMANDS` trong `bot.gs`. `/help` trong bot sẽ đọc mảng này để hiển thị trợ giúp động.
- **Thêm lệnh mới:** Khi thêm lệnh mới vào `bot.gs`, hãy cập nhật `COMMANDS` và bổ sung mô tả trong `my_skills/gas-bot-pro/SKILL.md` để tài liệu luôn khớp với mã.
- **Tự động hoá tài liệu:** Có thể viết `tools/add_command.js` hoặc `tools/sync_help.js` để chèn/mở rộng phần lệnh trong các `.md` giữa marker `<!-- COMMANDS:START -->` / `<!-- COMMANDS:END -->`.
- **Nhắc (reminder):** `/nhacnho` lưu vào sheet `Reminders`; script có logic tạo sheet nếu cần. Đảm bảo `SHEET_ID` hợp lệ và script có quyền `SpreadsheetApp`.
- **Trigger creation:** `createReminderTriggerIfNotExists()` trong `bot.gs` tạo trigger minute-based cho `checkReminders()`; deploy và cấp quyền để trigger hoạt động.
- **File mã:** Các file chạy trong Apps Script phải là `.gs` và cùng cấp với `bot.gs`.

{
  "ok": true,
  "result": {
    "url": "https://your-script-url",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "ip_address": "xxx.xxx.xxx.xxx",
    "last_error_date": 0,
    "max_connections": 40
  }
}
```

---

## 💬 Test Bot

1. **Mở Telegram**
2. **Tìm bot:** `@skyhub_bot`
3. **Gửi lệnh:**

```
/start          # Khởi tạo
/help           # Danh sách lệnh
/hello          # Chào hỏi
/status         # Trạng thái
/time           # Xem giờ
/echo hello     # Lặp lại
```

---

## 🎯 Các Function Quan Trọng

### Gửi Tin Nhắn

```javascript
// Tin nhắn đơn
sendMessage(chatId, "Xin chào!");

// Tin nhắn với button
const keyboard = {
  inline_keyboard: [[
    { text: "Button 1", callback_data: "btn_1" },
    { text: "Button 2", callback_data: "btn_2" }
  ]]
};
sendMessage(chatId, "Chọn:", keyboard);

// Tin nhắn với HTML formatting
const html = `<b>Bold</b> <i>Italic</i> <code>Code</code>`;
sendMessage(chatId, html);
```

### Xử lý Callback

```javascript
function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const msgId = callbackQuery.message.message_id;
  
  if (data === "btn_1") {
    editMessage(chatId, msgId, "Bạn chọn button 1!");
  }
}
```

### Gửi Ảnh/File

```javascript
// Ảnh từ URL
sendPhoto(chatId, "https://example.com/image.jpg", "Caption");

// Document
sendDocument(chatId, "https://example.com/file.pdf", "file.pdf");

// Location
sendLocation(chatId, 21.0285, 105.8542); // Hà Nội
```

---

## 💾 Lưu Data vào Google Sheet

### Setup Sheet

```javascript
// Tạo Google Sheet
// Thêm columns: Timestamp | Username | Chat_ID | Message | Message_ID

// Lấy Sheet ID từ URL: 
// https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit

// Cập nhật trong code:
const SHEET_ID = "YOUR_SHEET_ID";
```

### Lưu Tin Nhắn

```javascript
function saveMessage(message) {
  const SHEET_ID = "YOUR_SHEET_ID";
  const sheet = SpreadsheetApp.openById(SHEET_ID)
    .getSheetByName("Messages");
  
  sheet.appendRow([
    new Date(),
    message.from.username,
    message.chat.id,
    message.text,
    message.message_id
  ]);
}

// Gọi trong handleTelegramMessage:
handleTelegramMessage(message) {
  saveMessage(message); // Lưu
  // ... xử lý khác
}
```

---

## 🔐 Bảo Mật

### 1. Thay đổi Secret Key
```javascript
const WEBHOOK_SECRET = "random_secret_key_123456789";
```

### 2. Kiểm tra trong doPost()
```javascript
function doPost(e) {
  const secret = e.parameter.secret;
  if (secret !== WEBHOOK_SECRET) {
    return ContentService.createTextOutput('Unauthorized');
  }
  // ...
}
```

### 3. Không chia sẻ BOT_TOKEN
- Lưu ở nơi an toàn
- Không commit vào Git

---

## 🐛 Troubleshooting

### Bot không nhận tin nhắn

```javascript
// 1. Kiểm tra webhook status
function getWebhookInfo() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;
  const response = UrlFetchApp.fetch(url, { method: "post" });
  Logger.log(response.getContentText());
}

// 2. Kiểm tra error
// View > Logs (xem lỗi trong Apps Script)

// 3. Nếu có lỗi, xóa webhook cũ
function deleteWebhook() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`;
  UrlFetchApp.fetch(url, { method: "post" });
}

// 4. Thiết lập lại
function setupWebhook() {
  // ... như hướng dẫn ở trên
}
```

### Nút bấm không hoạt động
- Kiểm tra callback_data là unique
- Kiểm tra hàm `handleCallbackQuery()` có logic đúng

### Request timeout
- Google Apps Script có giới hạn 6 phút/request
- Chia nhỏ tác vụ thành chunks

---

## 📚 Ví dụ Full Bot

```javascript
const BOT_TOKEN = "123456789:ABCDefGhIjKl";
const CHAT_ID = "123456789";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  
  if (payload.message) {
    const msg = payload.message.text;
    const chatId = payload.message.chat.id;
    
    if (msg === "/start") {
      sendMessage(chatId, "👋 Xin chào!");
    } else {
      sendMessage(chatId, `📨 Bạn nói: ${msg}`);
    }
  }
  
  return ContentService.createTextOutput('OK');
}

function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = { chat_id: chatId, text: text };
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch(url, options);
}
```

---

## 🎓 Tài Liệu Tham Khảo

- 📖 [Telegram Bot API](https://core.telegram.org/bots/api)
- 📖 [Google Apps Script](https://developers.google.com/apps-script)
- 🔗 [Webhook Documentation](https://core.telegram.org/bots/webhooks)
- 💬 [Telegram Bot Community](https://t.me/telegram)

---

**Happy Botting! 🤖**
