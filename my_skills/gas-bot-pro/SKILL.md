---
name: gas-bot-pro
description: Skill hỗ trợ phát triển Telegram Bot bằng Google Apps Script để quản lý chi tiêu cá nhân: nhập liệu chi tiêu, nhắc việc theo lịch, phân tích chi tiêu, và tự động phân tích sao kê ngân hàng để bổ sung dữ liệu.
---

<!--
gas-bot-pro SKILL.md
Mục tiêu: Hướng dẫn và tự động hoá các tác vụ lặp cho việc xây dựng một Telegram Bot trên Google Apps Script
Chức năng chính:
- Nhập liệu chi tiêu hàng ngày qua Telegram (text, quick replies)
- Lập lịch nhắc việc/nhắc nhập chi tiêu
- Phân tích chi tiêu (theo ngày/tuần/tháng, theo danh mục)
- Nhận và phân tích file sao kê ngân hàng (CSV/Excel/PDF OCR) để gợi ý/ghi nhận giao dịch
-->

Tóm tắt nhanh
This skill giúp tạo quy trình rõ ràng để: thiết lập bot Telegram trên GAS, thiết kế lệnh nhập chi tiêu, cấu hình trigger nhắc việc, viết hàm phân tích báo cáo chi tiêu và viết parser để ingest sao kê ngân hàng.

Về skill này (Expert GAS)
- Đây là một *skill chuyên gia* chạy trên Google Apps Script (GAS). Mã mẫu, handler và các tiện ích được viết để chạy trực tiếp trong môi trường Apps Script và tận dụng các service của Google.
- Yêu cầu runtime & quyền: `UrlFetchApp` (gọi Telegram API), `SpreadsheetApp` (lưu/truy vấn Google Sheet), `DriveApp` (nếu cần upload/file processing), `ScriptApp` (tạo time-driven triggers). Project sẽ yêu cầu cấp phép (authorization) cho các service này khi deploy.
- Triển khai: deploy dưới dạng Web App (webhook) hoặc dùng Apps Script webhook; để gửi nhắc theo lịch cần tạo time-driven triggers và cấp quyền tương ứng.
- Quy tắc file mã: tất cả file mã liên quan đến chức năng phải có phần mở rộng `.gs` và đặt cùng cấp với `bot.gs` (ví dụ: cùng thư mục với `config.gs`). Tránh tạo file `.js`/`.ts` cho phần chạy trong Apps Script.
- Mục tiêu: dành cho nhà phát triển quen với GAS, quản lý ủy quyền (OAuth) và triggers; phù hợp với những ai muốn tích hợp Telegram + Google Sheets/Drive an toàn và tự động.

Khi sử dụng
- Muốn một chatbot Telegram trên GAS để ghi và phân tích chi tiêu cá nhân.
- Muốn tự động hoá việc gộp giao dịch từ sao kê ngân hàng vào hệ thống chi tiêu.

Keywords
- Telegram, Google Apps Script, GAS, webhook, chi tiêu, expense, sao kê, CSV, OCR, reminder

Output của skill
- Một checklist và mẫu code/handler để triển khai:
	- Handler nhận tin nhắn người dùng và lưu giao dịch
	- Trigger time-driven để gửi nhắc việc
	- Script phân tích dữ liệu và trả báo cáo tóm tắt
	- Parser sao kê (CSV/Excel) và hướng dẫn OCR khi cần

Quy trình bước-by-step (Workflow)
1) Thiết lập cơ bản
	- Tạo project Google Apps Script và bật Web App / Deploy as Web App hoặc dùng Apps Script webhook cho Telegram.
	- Lấy `BOT_TOKEN` từ BotFather và cấu hình webhook/route (tham chiếu file mẫu `telegram-webhook/bot.gs`).
2) Định nghĩa model dữ liệu
	- Lưu giao dịch vào Google Sheet hoặc Firestore: cột tối thiểu `date, amount, currency, category, description, source`.
3) Lệnh nhập liệu trên Telegram
	- Thiết kế command: `/chi_tieu 2026-04-08 120000 mua_cafe "Cà phê sáng"`
	- Hỗ trợ quick replies: `+ Thêm tiêu đề, Chọn danh mục`.
4) Lập lịch nhắc việc
	- Dùng triggers time-driven (`ScriptApp.newTrigger`) để gửi nhắc hàng ngày/tuần.
5) Phân tích chi tiêu
	- Viết hàm tóm tắt theo thời kỳ (ngày/tuần/tháng), biểu đồ phân bổ (%) theo danh mục, cảnh báo overspend.
6) Nhập sao kê ngân hàng
	- Hỗ trợ CSV/Excel: map cột ngày, mô tả, số tiền.
	- Nếu file là PDF: hướng dẫn OCR (tesseract hoặc Google Drive OCR + Apps Script Advanced Drive API) để xuất CSV trước khi parse.
	- Gắn logic khớp giao dịch: tìm theo ngày, số tiền và mô tả để tránh duplicate.
7) Hoàn thiện UX
	- Thêm phản hồi rõ ràng (confirm, undo), ghi nhận nguồn (manual/upload/bank), và log thay đổi.

Decision points & branching
- Lưu dữ liệu ở đâu? (Google Sheet cho đơn giản; Firestore/BigQuery cho scale)
- Định dạng sao kê nào ưu tiên? (CSV > Excel > PDF)
- Gắn nhãn danh mục tự động hay thủ công? (auto-classifier vs manual override)

Quality checks / Completion criteria
- Có handler Telegram nhận/ghi giao dịch và trả confirm.
- Có trigger nhắc việc hoạt động theo lịch đã cấu hình.
- Parser sao kê xử lý ít nhất CSV/Excel và gợi ý mapping cho user.
- Báo cáo tóm tắt chạy và trả kết quả hợp lệ (tổng, theo danh mục).

Ví dụ prompts để dùng với agent
- "Tạo handler Telegram GAS nhận lệnh `/chi_tieu` và lưu vào Google Sheet với cột: date, amount, category, note." 
- "Viết hàm Apps Script phân tích chi tiêu tháng trước, trả về top 5 danh mục chi tiêu." 
- "Viết parser CSV sao kê ngân hàng, map các cột `Date, Description, Amount` và thêm vào sheet `Transactions` tránh duplicate."

Nhắc nhở (`/nhacnho`) — ví dụ định dạng thời gian được hỗ trợ

- ` /nhacnho 13h20 Gọi điện ` → hiểu là 13:20:00 hôm nay (nếu 13:20 đã qua, sẽ đặt sang ngày mai)
- ` /nhacnho 13:20 Gọi điện ` → tương tự, định dạng `HH:MM`
- ` /nhacnho 20m nữa Uống thuốc ` → hiểu là 20 phút kể từ bây giờ
- ` /nhacnho 2h nữa Hoàn thành báo cáo ` → hiểu là 2 giờ kể từ bây giờ
- ` /nhacnho in 10m Kiểm tra email ` → cú pháp tiếng Anh tương thích (tương đương `10m nữa`)
- ` /nhacnho 8h sáng mai Gặp khách ` → hỗ trợ `sáng/chiều/tối` và `ngày mai`

Lưu ý: nếu người dùng gửi thời gian chỉ gồm giờ:phút mà thời điểm đó nhỏ hơn thời gian hiện tại, bot sẽ tự động đặt nhắc vào ngày kế tiếp.

Tệp mẫu tham chiếu trong repo
- [telegram-webhook/bot.gs](telegram-webhook/bot.gs)
- [telegram-webhook/config.gs](telegram-webhook/config.gs)

Next steps / Các tuỳ chỉnh đề xuất
- Thêm classifier ML đơn giản (keyword rules hoặc TinyML) để gợi ý `category` tự động.
- Thêm workflow nhập chủ động: upload sao kê qua bot -> xử lý tự động -> confirm từng giao dịch.

Các câu hỏi cần làm rõ (để hoàn thiện skill)
1. Bạn muốn lưu dữ liệu vào `Google Sheet` hay `Firestore/BigQuery`?
2. Sao kê ngân hàng thường ở định dạng nào (CSV, XLSX, hay PDF)? Có mẫu không?
3. Bạn muốn phân loại danh mục tự động không? Nếu có, cung cấp vài ví dụ mapping từ mô tả giao dịch -> danh mục.

-- End of skill draft --

Quy tắc khi thêm lệnh mới (Automation & Conventions)
- **Mục tiêu:** Khi phát triển và thêm lệnh mới vào `bot.gs`, ta tự động duy trì đồng bộ giữa phần trợ giúp `/help` trong bot và tài liệu hướng dẫn (`.md`).
- **Cập nhật `/help`:** Mỗi lệnh mới phải được thêm vào mảng `COMMANDS` trong [telegram-webhook/bot.gs](telegram-webhook/bot.gs). Hệ thống `/help` sẽ đọc `COMMANDS` để sinh nội dung trợ giúp động.
	- Lưu ý: khi thêm lệnh mới, hãy cập nhật cả trường `usage` và `desc` trong mảng `COMMANDS` để phần `/help` hiển thị miêu tả ngắn chính xác cho người dùng. Đồng thời đảm bảo mô tả ngắn (`desc`) phù hợp để dùng khi đăng ký lệnh lên Telegram (trường `description`).
- **Cập nhật tài liệu liên quan:** Sau khi cập nhật `COMMANDS`, hãy bổ sung mô tả tương ứng trong các file markdown liên quan (ví dụ: [my_skills/gas-bot-pro/SKILL.md](my_skills/gas-bot-pro/SKILL.md)). Có thể dùng một script đồng bộ (ví dụ: `tools/sync_help.js` hoặc `tools/add_command.js`) để chèn/mở rộng phần lệnh trong các `.md` giữa các marker `<!-- COMMANDS:START -->` / `<!-- COMMANDS:END -->`.
- **Quy tắc tạo file mới:** Nếu cần tạo file mã mới khi thêm chức năng, file phải có định dạng `.gs` (Google Apps Script) và đặt ở cùng cấp với các file `.gs` hiện có trong repo (ví dụ: cùng thư mục với `bot.gs` và `config.gs`). Không tạo file .js/.ts ở vị trí mã GAS.
- **Gợi ý công cụ:** Nên tạo một helper `tools/add_command.js` để:
	- Thêm entry vào `COMMANDS` trong `bot.gs` theo một template chuẩn.
	- Cập nhật phần trợ giúp trong `SKILL.md` hoặc các tài liệu khác giữa marker đã định.
	- Kiểm tra và đảm bảo tên file mã mới là `.gs` và vị trí đặt file hợp lệ.

Áp dụng những quy tắc này giúp tránh sai lệch giữa mã và tài liệu, và giữ workflow thêm lệnh nhất quán cho dự án GAS.