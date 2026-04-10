# 🤖 Telegram Bot Webhook với Google Apps Script

Hướng dẫn đầy đủ để tạo Telegram bot sử dụng Google Apps Script và webhook.

## 📋 Bước 1: Tạo Bot Telegram

1. **Mở Telegram** và tìm **@BotFather**
2. Gửi lệnh `/start`
3. Gửi `/newbot` để tạo bot mới
4. Đặt tên cho bot (ví dụ: "SkyHub Bot")
5. Đặt username cho bot (ví dụ: "skyhub_bot")
6. **Lưu BOT_TOKEN** mà BotFather cung cấp

**Ví dụ BOT_TOKEN:** `123456789:ABCDefGhIjKlMnOpQrStUvWxYzABCDefG`

---

## 📝 Bước 2: Lấy Chat ID

1. **Mở Google Apps Script:**
   - Truy cập [script.google.com](https://script.google.com)
   - Click **+ New Project**
   - Tạo file mới

2. **Sao chép code từ `bot.gs`** vào editor

3. **Cập nhật BOT_TOKEN:**
   - Thay `YOUR_BOT_TOKEN_HERE` bằng token từ BotFather

4. **Lấy Chat ID của bạn:**
   - Lần đầu, chat ID có thể lấy từ bot khi bạn gửi tin nhắn
   - Hoặc sử dụng API Telegram: `https://api.telegram.org/botYOUR_TOKEN/getUpdates`
   - Tìm `"id"` trong phần `"chat"`

---

## 🌐 Bước 3: Deploy Google Apps Script

1. **Click `Deploy` > `New Deployment`**
2. **Select type:** `Web app`
3. **Execute as:** Your Google Account
4. **Who has access:** Anyone
5. **Click `Deploy`**
6. **Copy Web app URL** (sẽ giống như: `https://script.google.com/macros/s/ABC123.../usercontent`)

---

## 🔗 Bước 4: Thiết lập Webhook

Có 2 cách:

### Cách 1: Sử dụng Google Apps Script UI
1. Mở Google Apps Script của bạn
2. Click **Run** > `setupWebhook()`
3. Cho phép quyền truy cập
4. Webhook sẽ được thiết lập tự động

### Cách 2: Sử dụng curl
```bash
curl -X POST https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://script.google.com/macros/s/YOUR_SCRIPT_ID/usercontent?secret=your_secret_key_123",
    "allowed_updates": ["message", "callback_query"]
  }'
```

---

## ✅ Bước 5: Kiểm tra Webhook

1. Mở Google Apps Script
2. Click **Run** > `getWebhookInfo()`
3. Kiểm tra Logs (View > Logs)
4. Status phải là `"ok": true`

---

## 🧪 Bước 6: Test Bot

1. **Mở Telegram**
2. **Tìm bot của bạn** (ví dụ: @skyhub_bot)
3. **Gửi các lệnh:**
   - `/start` - Bắt đầu
   - `/help` - Xem danh sách lệnh
   - `/info` - Thông tin bot
   - `/hello` - Chào hỏi
   - `/status` - Trạng thái
   - `/time` - Xem giờ
   - `/echo hello` - Lặp lại text

---

  ## ⚙️ Lưu ý về lệnh, nhắc và đồng bộ tài liệu

  - **Danh sách lệnh động:** `bot.gs` chứa mảng `COMMANDS` — bot sẽ sinh nội dung `/help` từ đó. Khi thêm lệnh mới, hãy cập nhật `COMMANDS` để `/help` luôn đồng bộ.
  - **Lệnh nhắc (reminder):** Bot hỗ trợ `/nhacnho` để đặt nhắc. Ví dụ: `/nhacnho 2026-04-08 15:30 Nộp báo cáo` hoặc `/nhacnho 8h sáng ngày mai Gặp khách` hoặc `/nhacnho in 10m Uống thuốc`.
  - **Lưu nhắc:** Nhắc được lưu trong sheet `Reminders` (nếu chưa có, script sẽ tạo). Đảm bảo `SHEET_ID` trong `config.gs` trỏ tới Google Sheet đúng.
  - **Cột `Bút toán` trong FinanceLogs:** Sheet `FinanceLogs` sẽ tự có thêm cột `Bút toán` để lưu mã giao dịch hoặc khóa giao dịch ổn định cho dữ liệu import từ sao kê.
  - **Chống trùng khi dùng `/saoke`:** Khi import sao kê, bot sẽ kiểm tra cột `Bút toán`; chỉ các giao dịch chưa có `Bút toán` tương ứng mới được thêm vào sheet.
  - **Triggers & Quyền:** Nhắc theo lịch cần trigger time-driven; script sẽ tạo trigger `checkReminders()` nếu cần, nhưng bạn vẫn phải cấp quyền cho `ScriptApp`, `SpreadsheetApp`, `UrlFetchApp` khi deploy.
  - **Đồng bộ tài liệu:** Khuyến nghị dùng một script helper (ví dụ `tools/add_command.js` hoặc `tools/sync_help.js`) để thêm entry vào `COMMANDS` và chèn mô tả tương ứng vào `my_skills/gas-bot-pro/SKILL.md` giữa marker `<!-- COMMANDS:START -->` / `<!-- COMMANDS:END -->`.
  - **Quy tắc file mã:** Mọi file mã hỗ trợ Apps Script phải có phần mở rộng `.gs` và đặt cùng cấp với `bot.gs` và `config.gs` trong repo. Không thêm `.js`/`.ts` cho phần chạy trong Apps Script.

## 📤 Bước 7: Gửi Tin Nhắn từ Script

```javascript
// Gửi tin nhắn bình thường
function sendMsg() {
  sendMessage(CHAT_ID, "Xin chào từ script!");
}

// Gửi tin nhắn với button
function sendWithButtons() {
  const markup = {
    inline_keyboard: [[
      { text: "Button 1", callback_data: "btn_1" },
      { text: "Button 2", callback_data: "btn_2" }
    ]]
  };
  sendMessage(CHAT_ID, "Chọn một option:", markup);
}
```

---

## 🔧 Các Function Chính

| Function | Mô tả |
|----------|-------|
| `sendMessage(chatId, text, keyboard)` | Gửi tin nhắn |
| `editMessage(chatId, msgId, text, keyboard)` | Chỉnh sửa tin nhắn |
| `answerCallbackQuery(id, text, alert)` | Phản hồi button click |
| `setupWebhook()` | Thiết lập webhook |
| `deleteWebhook()` | Xóa webhook |
| `getWebhookInfo()` | Lấy thông tin webhook |
| `sendTestMessage()` | Gửi tin nhắn test |

---

## 🔐 Bảo Mật

1. **Thay đổi WEBHOOK_SECRET** thành một chuỗi ngẫu nhiên mạnh
2. **Không chia sẻ BOT_TOKEN** công khai
3. **Kiểm tra xác thực** trong hàm `doPost()`

---

## 🆘 Troubleshooting

### Bot không nhận tin nhắn
- Kiểm tra BOT_TOKEN có đúng không
- Chạy `getWebhookInfo()` để xem status
- Kiểm tra Logs trong Google Apps Script

### Webhook error
- Đảm bảo Web app được deploy là "Anyone"
- Thử xóa webhook cũ rồi thiết lập lại
- Kiểm tra WEBHOOK_SECRET trong URL

### Button không hoạt động
- Kiểm tra `callback_data` không trùng
- Chắc chắn có hàm `answerCallbackQuery()`

---

## 📚 Tài liệu Tham Khảo

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Google Apps Script](https://developers.google.com/apps-script)
- [Telegram Webhooks](https://core.telegram.org/bots/webhooks)

---

## 📝 Ví dụ Webhook Payload

```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 1,
    "date": 1234567890,
    "chat": {
      "id": -1001234567890,
      "type": "private"
    },
    "from": {
      "id": 123456789,
      "is_bot": false,
      "first_name": "John",
      "username": "john_doe"
    },
    "text": "/start"
  }
}
```

---

Happy Coding! 🚀
