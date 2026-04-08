# 📁 File bot.gs - Google Apps Script

## 🚀 Cách sử dụng:

1. **Download file `bot.gs`** từ thư mục này
2. **Mở [script.google.com](https://script.google.com)**
3. **Tạo project mới**
4. **Copy toàn bộ nội dung** từ `bot.gs` vào editor
5. **Cập nhật BOT_TOKEN** và các cấu hình khác
6. **Save** và **Deploy**

## 📋 Các function chính:

- `doPost(e)` - Xử lý webhook từ Telegram
- `handleTelegramMessage(message)` - Xử lý tin nhắn
- `handleCallbackQuery(callbackQuery)` - Xử lý nút bấm
- `sendMessage(chatId, text, keyboard)` - Gửi tin nhắn
- `setupWebhook()` - Thiết lập webhook
- `getWebhookInfo()` - Kiểm tra webhook status

## ⚙️ Cấu hình cần thay đổi:

```javascript
const BOT_TOKEN = "YOUR_BOT_TOKEN_HERE"; // Từ @BotFather
const CHAT_ID = "YOUR_CHAT_ID_HERE"; // Chat ID của bạn
const WEBHOOK_SECRET = "your_secret_key_123"; // Secret key bất kỳ
const SHEET_ID = "YOUR_SPREADSHEET_ID"; // Google Sheet ID để lưu lệnh /eat
```

## 🔎 Lưu ý khi thêm lệnh mới và tài liệu

- **COMMANDS array:** Thêm metadata lệnh vào `COMMANDS` trong `bot.gs`. `handleTelegramMessage` / `/help` sử dụng `COMMANDS` để hiển thị trợ giúp.
- **Cập nhật tài liệu:** Khi thêm lệnh mới, hãy bổ sung mô tả vào `my_skills/gas-bot-pro/SKILL.md`. Để tiện, có thể dùng `tools/add_command.js` để đồng bộ tự động giữa mã và tài liệu.
- **Nhắc (reminder):** Bot có lệnh `/nhacnho` để lập lịch nhắc; nhắc được lưu trong sheet `Reminders` (script tạo sheet nếu cần) và cần trigger/time-driven permissions.
- **File mã:** Tạo file mã mới ở dạng `.gs` và đặt cùng cấp với `bot.gs`.

## 🧪 Test bot:

Sau khi deploy, gửi các lệnh cho bot:
- `/start` - Khởi tạo
- `/help` - Xem lệnh
- `/hello` - Chào hỏi
- `/status` - Trạng thái
- `/time` - Xem giờ
- `/eat [món ăn]` - Ghi món ăn vào Google Sheet

**Happy Botting! 🤖**