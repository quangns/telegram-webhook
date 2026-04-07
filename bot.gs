// ============================================
// TELEGRAM BOT WEBHOOK - GOOGLE APPS SCRIPT
// ============================================

// Cấu hình được tách ra trong config.gs

// ============================================
// 1. KHỞI TẠO WEBHOOK
// ============================================
function doPost(e) {
  try {
    // Kiểm tra secret
    // const receivedSecret = e.parameter.secret || e.postData.parameters.secret;
    // if (receivedSecret !== WEBHOOK_SECRET) {
    //   return ContentService.createTextOutput('Unauthorized').setMimeType(ContentService.MimeType.TEXT);
    // }

    // Lấy dữ liệu từ request
    const payload = JSON.parse(e.postData.contents);

    Logger.log("Payload received: " + JSON.stringify(payload));

    // Bỏ qua các update đã xử lý trước đó để tránh retry / start cũ
    const updateId = payload.update_id;
    if (updateId != null && isDuplicateUpdate(updateId)) {
      Logger.log(`Duplicate or old update skipped: ${updateId}`);
    }

    // Ghi update_id đã xử lý
    if (updateId != null) {
      markUpdateProcessed(updateId);
    }

    // Xử lý webhook từ Telegram
    if (payload.message) {
      handleTelegramMessage(payload.message);
    } else if (payload.callback_query) {
      handleCallbackQuery(payload.callback_query);
    }
  } catch (error) {
    Logger.log("Error: " + error.toString());
  }
}

// ============================================
// 2. XỬ LÝ TIN NHẮN TỪ TELEGRAM
// ============================================
function handleTelegramMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const username = message.from.username || "Unknown";
  let text = String(message.text || "");
  const messageId = message.message_id;

  // Loại bỏ tên bot khỏi câu lệnh (ví dụ: /log@BOT_NAME -> /log)
  if (typeof BOT_NAME !== 'undefined' && BOT_NAME) {
    if (text.startsWith("/") && text.includes(BOT_NAME)) {
      text = text.replace(BOT_NAME, "");
    }
  }

  Logger.log(`Message from ${username}: ${text}`);

  // Xử lý các lệnh
  if (text.startsWith("/start")) {
    sendMessage(chatId, "👋 Xin chào! Tôi là bot Google Apps Script.\n\nCác lệnh có sẵn:\n/help - Xem danh sách lệnh\n/info - Thông tin\n/hello - Chào", getMainKeyboard());
  }
  else if (text.startsWith("/help")) {
    const helpText = `📖 Danh sách lệnh:\n\n
/start - Bắt đầu\n
/help - Xem hướng dẫn\n
/info - Thông tin bot\n
/hello - Chào hỏi\n
/status - Kiểm tra trạng thái\n
/time - Xem giờ hiện tại\n
/log [thu] [mô tả] [số tiền] - Ghi thu chi cá nhân (mặc định chi, lương/thưởng mặc định thu, hỗ trợ k/tr)\n
/search [từ khóa] - Tổng hợp tin tức tóm tắt, chỉ hiển thị nội dung\n
/echo [text] - Lặp lại text`;
    sendMessage(chatId, helpText);
  }
  else if (text.startsWith("/info")) {
    const infoText = `ℹ️ Thông tin Bot:\n\n
Tên: SkyHub Telegram Bot\n
Phiên bản: 1.0.0\n
Nền tảng: Google Apps Script\n
Trạng thái: ✅ Hoạt động`;
    sendMessage(chatId, infoText);
  }
  else if (text === "/hello") {
    sendMessage(chatId, `👋 Xin chào ${username}! Mình rất vui gặp bạn!`);
  }
  else if (text === "/status") {
    const status = `✅ Bot Status:\n\nTrạng thái: Hoạt động\nThời gian: ${new Date().toLocaleString('vi-VN')}\nUser ID: ${userId}`;
    sendMessage(chatId, status);
  }
  else if (text === "/time") {
    const now = new Date();
    const timeText = `🕐 Thời gian hiện tại:\n\n${now.toLocaleString('vi-VN')}`;
    sendMessage(chatId, timeText);
  }
  else if (text.startsWith("/log ")) {
    const parts = text.substring(5).trim().split(' ');
    if (parts.length < 2) {
      sendMessage(chatId, "💰 Vui lòng nhập theo định dạng: /log [thu] [mô tả] [số tiền]. Ví dụ: /log ăn uống 50000, /log lương 10tr, /log thưởng 5k");
    } else {
      let type = 'chi'; // Mặc định là chi
      let descriptionStart = 0;
      if (parts[0].toLowerCase() === 'thu') {
        type = 'thu';
        descriptionStart = 1;
      }
      const amountStr = parts[parts.length - 1];
      const description = parts.slice(descriptionStart, -1).join(' ');
      
      // Xử lý viết tắt số tiền (hỗ trợ: 3tr5, 3M5, 3,5M, 3.5M, 3M, 3k, 3,5k...)
      const amount = parseAmountString(amountStr);
      
      // Kiểm tra nếu mô tả bắt đầu bằng lương, thưởng hoặc chứa chữ "được" thì mặc định thu
      const descLower = description.toLowerCase();
      if (descLower.startsWith('lương') || descLower.startsWith('thưởng') || descLower.includes('được')) {
        type = 'thu';
      }
      
      if (isNaN(amount) || amount <= 0) {
        sendMessage(chatId, "❌ Số tiền phải là số dương. Ví dụ: /log ăn uống 50000, /log lương 10tr, /log thưởng 5k");
      } else {
        const nowStr = new Date().toLocaleString('vi-VN');
        sendMessage(chatId, `💰 Đã ghi nhận: ${type === 'thu' ? 'Thu' : 'Chi'} ${description} - ${amount.toLocaleString('vi-VN')} VND.\n⏱ Thời gian: ${nowStr}\nĐã lưu vào Google Sheet.`);
        logFinanceCommand(username, type, description, amount);
      }
    }
  }
  else if (text.startsWith("/echo ")) {
    const echoText = text.substring(6);
    sendMessage(chatId, `🔊 Echo: ${echoText}`);
  }
  else if (text.startsWith("/search ")) {
    const query = text.substring(8).trim();
    if (!query) {
      sendMessage(chatId, "🔍 Vui lòng nhập từ khóa tìm kiếm. Ví dụ: /search giá vàng hôm nay");
    } else {
      const result = searchPerplexity(query);
      sendMessage(chatId, result);
    }
  }
  else if (text.startsWith("/")) {
    sendMessage(chatId, "❌ Lệnh không tồn tại! Gõ /help để xem danh sách lệnh.");
  }
  else {
    // Tin nhắn thường
    const replyText = `📨 Bạn nói: "${text}"\n\nTôi không hiểu lệnh này. Gõ /help để xem hướng dẫn!`;
    sendMessage(chatId, replyText, getMainKeyboard());
  }
}

// ============================================
// 3. XỬ LÝ NÚT BẤM (CALLBACK QUERY)
// ============================================
function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const callbackId = callbackQuery.id;
  const data = typeof callbackQuery.data === 'string' ? callbackQuery.data : "";
  const messageId = callbackQuery.message.message_id;

  Logger.log(`Callback data: ${data}`);

  // Xử lý các button
  if (data === "btn_hello") {
    editMessage(chatId, messageId, "👋 Xin chào! Bạn vừa bấm nút 'Xin chào'");
    answerCallbackQuery(callbackId, "Bạn đã bấm nút!", false);
  }
  else if (data === "btn_info") {
    editMessage(chatId, messageId, "ℹ️ Đây là thông tin chi tiết");
    answerCallbackQuery(callbackId, "Xem thông tin", false);
  }
  else if (data === "btn_back") {
    editMessage(chatId, messageId, "🔙 Quay lại menu chính", getMainKeyboard());
    answerCallbackQuery(callbackId, "Quay lại", false);
  }
  else if (data === "btn_time") {
    const now = new Date();
    editMessage(chatId, messageId, `🕐 Thời gian hiện tại:\n\n${now.toLocaleString('vi-VN')}`);
    answerCallbackQuery(callbackId, "Xem thời gian", false);
  }
  else if (data === "btn_status") {
    const status = `✅ Bot Status:\n\nTrạng thái: Hoạt động\nThời gian: ${new Date().toLocaleString('vi-VN')}`;
    editMessage(chatId, messageId, status);
    answerCallbackQuery(callbackId, "Xem trạng thái", false);
  }
  else if (data.startsWith("btn_")) {
    answerCallbackQuery(callbackId, `Bạn chọn: ${data}`, false);
  }
}

// ============================================
// 4. GỬI TIN NHẮN
// ============================================
function sendMessage(chatId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  Logger.log("Send message response: " + response.getContentText());
}

// ============================================
// 5. CHỈNH SỬA TIN NHẮN
// ============================================
function editMessage(chatId, messageId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "HTML"
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

// ============================================
// 6. CALLBACK QUERY RESPONSE
// ============================================
function answerCallbackQuery(callbackId, text, showAlert = false) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;

  const payload = {
    callback_query_id: callbackId,
    text: text,
    show_alert: showAlert
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

// ============================================
// 6.5. UPDATE_ID DEDUPLICATION
// ============================================
function isDuplicateUpdate(updateId) {
  try {
    const props = PropertiesService.getScriptProperties();
    const lastId = parseInt(props.getProperty('LAST_UPDATE_ID') || '0', 10);
    return updateId <= lastId;
  } catch (error) {
    Logger.log('Error checking duplicate update: ' + error.toString());
    return false;
  }
}

function markUpdateProcessed(updateId) {
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('LAST_UPDATE_ID', updateId.toString());
  } catch (error) {
    Logger.log('Error marking update processed: ' + error.toString());
  }
}

// ============================================
// 6.6. GHI LỆNH /log VÀO GOOGLE SHEET
// ============================================
function logFinanceCommand(username, type, description, amount) {
  try {
    var spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    var sheet = spreadsheet.getSheetByName("FinanceLogs");
    var desiredHeaders = ["Thời gian", "Username", "Loại", "Danh mục", "Mô tả", "Số tiền (VND)"];
    if (!sheet) {
      sheet = spreadsheet.insertSheet("FinanceLogs");
      sheet.appendRow(desiredHeaders);
    }

    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      sheet.appendRow(desiredHeaders);
      lastCol = sheet.getLastColumn();
    }

    var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    // Ensure any missing desired headers exist (append at end)
    for (var i = 0; i < desiredHeaders.length; i++) {
      if (currentHeaders.indexOf(desiredHeaders[i]) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(desiredHeaders[i]);
        currentHeaders.push(desiredHeaders[i]);
      }
    }

    var category = classifyDescription(description);

    // Build row aligned to currentHeaders
    var row = new Array(currentHeaders.length).fill('');
    function setVal(h, v) {
      var idx = currentHeaders.indexOf(h);
      if (idx !== -1) row[idx] = v;
    }
    setVal("Thời gian", new Date().toLocaleString('vi-VN'));
    setVal("Username", username);
    setVal("Loại", type === 'thu' ? 'Thu' : 'Chi');
    setVal("Danh mục", category);
    setVal("Mô tả", description);
    setVal("Số tiền (VND)", amount);

    sheet.appendRow(row);
    Logger.log("Logged /log command: " + username + " -> " + type + " " + description + " " + amount + " (category=" + category + ")");
  } catch (error) {
    Logger.log("Error logging /log command: " + error.toString());
  }
}

// ============================================
// 6.7. TÌM KIẾM TRÊN DUCKDUCKGO (ALTERNATIVE CHO PERPLEXITY)
// ============================================
function searchPerplexity(query) {
  try {
    // Lấy HTML kết quả DuckDuckGo và parse title/snippet để tổng hợp tin tức.
    const url = `https://lite.duckduckgo.com/lite?q=${encodeURIComponent(query)}`;
    const options = {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true
    };
    const html = UrlFetchApp.fetch(url, options).getContentText();

    const itemRegex = /<a[^>]+class=["']result-link["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<div[^>]+class=["']result-snippet["'][^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    const results = [];
    while ((match = itemRegex.exec(html)) && results.length < 5) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      const snippet = match[2].replace(/<[^>]+>/g, '').trim();
      if (title) {
        results.push({ title, snippet });
      }
    }

    if (results.length > 0) {
      let output = `📰 Tổng hợp tin tức cho: "${query}"\n\n`;
      results.forEach((item, index) => {
        output += `${index + 1}. ${item.title}\n`;
        if (item.snippet) {
          output += `${item.snippet}\n`;
        }
        output += `\n`;
      });
      output += `📌 Đây là phần tóm tắt tin tức, không có link để bạn click.`;
      return output.trim();
    }

    return `❌ Không tìm thấy kết quả cho: "${query}"`;
  } catch (error) {
    Logger.log("DuckDuckGo HTML fallback error: " + error.toString());
    return "❌ Lỗi khi tìm kiếm. Vui lòng thử lại sau.";
  }
}

// ============================================
// 7. KEYBOARD (NÚT BẤM)
// ============================================
function getMainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "👋 Xin chào", callback_data: "btn_hello" },
        { text: "ℹ️ Thông tin", callback_data: "btn_info" }
      ],
      [
        { text: "🕐 Giờ", callback_data: "btn_time" },
        { text: "✅ Trạng thái", callback_data: "btn_status" }
      ],
      [
        { text: "📖 Hướng dẫn", url: "https://example.com" }
      ]
    ]
  };
}

// ============================================
// 8. THIẾT LẬP WEBHOOK (CHẠY 1 LẦN)
// ============================================
function setupWebhook() {
  // Xóa webhook hiện tại để drop các tin nhắn pending
  deleteWebhook();
  
  // Chờ một chút để đảm bảo webhook đã bị xóa
  Utilities.sleep(2000);
  
  // Thiết lập webhook mới
  var url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=` + WEBAPPURL + '&drop_pending_updates=true';
  var response = UrlFetchApp.fetch(url);
  Logger.log("Setup webhook response: " + response.getContentText());
}

// ============================================
// 9. XÓA WEBHOOK
// ============================================
function deleteWebhook() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`;

  const options = {
    method: "post",
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  Logger.log("Webhook delete response: " + response.getContentText());
}

// ============================================
// 10. LẤY WEBHOOK INFO
// ============================================
function getWebhookInfo() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;

  const options = {
    method: "post",
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  Logger.log("Webhook info: " + JSON.stringify(result, null, 2));
}

// ============================================
// 11. GỬI TIN NHẮN TEST
// ============================================
function sendTestMessage() {
  const testMessage = `🧪 Test message từ Google Apps Script\nThời gian: ${new Date().toLocaleString('vi-VN')}`;
  sendMessage(CHAT_ID, testMessage);
  Logger.log("Test message sent!");
}

// ============================================
// PHẦN BỔ SUNG: PHÂN LOẠI MÔ TẢ GIAO DỊCH
// Không xóa hoặc thay thế phần nào trong file, chỉ bổ sung thêm code
// ============================================

// Mẫu từ khóa/regex cho từng danh mục
// Mẫu từ khóa cho từng danh mục (sử dụng so khớp chuỗi để tương thích Unicode)
var CATEGORY_PATTERNS = {
  "lương thưởng": ["lương","thưởng","salary","bonus","payroll","nhận","chuyển khoản"],
  "ăn uống": ["nhà hàng","ăn uống","ăn tối","ăn trưa","ăn sáng","ăn","cơm","quán","cafe","cà phê","trà sữa","phở","bún","ăn vặt","ăn nhẹ","siêu thị","grocery","chợ"],
  "xăng xe": ["gửi xe","xăng","đổ xăng","bơm xăng","nhien lieu","nhiên liệu","petrol","diesel","gas","xăng xe","đổ","rút xăng","thuê xe","xe ôm","grab","taxi","xe máy","xe tải"],
  "nhà cửa": ["nhà","thuê","tiền nhà","điện","nước","internet","phòng","điện nước","wifi","tiền điện","tiền nước","tiền internet"],
  "được cho": ["được"],
  "quan hệ": ["mừng","đám","hiếu","hỉ","gửi","mừng cưới","đám cưới","đám hỏi","đám tang"]
};

/**
 * Phân tích chuỗi số tiền và trả về số tiền bằng VND (số nguyên).
 * Hỗ trợ: "3tr5", "3M5", "3,5M", "3.5M", "3M", "3k", "35000".
 */
function parseAmountString(raw) {
  if (raw == null) return NaN;
  var s = String(raw).toLowerCase().trim();
  // remove spaces
  s = s.replace(/\s+/g, '');

  // if plain number with commas or dots: "47,000" or "47000"
  if (/^[\d.,]+$/.test(s)) {
    var num = parseFloat(s.replace(/,/g, '.'));
    return isNaN(num) ? NaN : Math.round(num);
  }

  // handle k (thousand)
  var m;
  m = s.match(/^([\d.,]+)k$/);
  if (m) {
    var n = parseFloat(m[1].replace(/,/g, '.'));
    return isNaN(n) ? NaN : Math.round(n * 1000);
  }

  // normalize m -> tr (million)
  s = s.replace(/m/g, 'tr');

  // handle formats like 3.5tr or 3,5tr
  m = s.match(/^([\d]+)[.,]?([\d]+)?tr$/);
  if (m) {
    var intPart = parseInt(m[1], 10);
    var fracPart = m[2] ? (parseFloat('0.' + m[2])) : 0;
    if (isNaN(intPart) || isNaN(fracPart)) return NaN;
    return Math.round((intPart + fracPart) * 1000000);
  }

  // handle compact form like 3tr5 or 3tr50 (means 3 + 0.5 or 3 + 0.50)
  m = s.match(/^(\d+)tr(\d+)$/);
  if (m) {
    var a = parseInt(m[1], 10);
    var bstr = m[2];
    var bnum = parseInt(bstr, 10);
    if (isNaN(a) || isNaN(bnum)) return NaN;
    var frac = bnum / Math.pow(10, bstr.length);
    return Math.round((a + frac) * 1000000);
  }

  // handle trailing 'tr' like '3tr'
  m = s.match(/^(\d+)tr$/);
  if (m) {
    var a2 = parseInt(m[1], 10);
    return isNaN(a2) ? NaN : a2 * 1000000;
  }

  // fallback: try parseFloat of digits in string
  m = s.match(/([\d.,]+)/);
  if (m) {
    var p = parseFloat(m[1].replace(/,/g, '.'));
    return isNaN(p) ? NaN : Math.round(p);
  }

  return NaN;
}

/**
 * Phân loại một chuỗi mô tả thành một danh mục.
 * Trả về tên danh mục (ví dụ: "ăn uống") hoặc "khác" nếu không khớp.
 */
function classifyDescription(text) {
  if (text == null) return "khác";
  var s = String(text).toLowerCase();
  // Loại bỏ dấu câu để tăng độ chính xác khi so khớp
  s = s.replace(/[.,;:!"'()\[\]\/\\-]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  for (var cat in CATEGORY_PATTERNS) {
    var patterns = CATEGORY_PATTERNS[cat];
    for (var i = 0; i < patterns.length; i++) {
      var kw = patterns[i].toLowerCase();
      if (!kw) continue;
      if (s.indexOf(kw) !== -1) return cat;
    }
  }
  return "khác";
}

/**
 * Duyệt toàn bộ sheet `FinanceLogs`, tạo cột "Danh mục" nếu chưa có,
 * và điền danh mục cho mỗi dòng dựa trên cột "Mô tả".
 * Chạy thủ công từ Apps Script editor hoặc gọi từ menu.
 */
function reclassifyFinanceLogs() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName("FinanceLogs");
    if (!sheet) {
      Logger.log("Sheet 'FinanceLogs' không tồn tại.");
      return;
    }

    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      Logger.log("Sheet 'FinanceLogs' rỗng.");
      return;
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var descIdx = -1;
    var catIdx = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim().toLowerCase();
      if (h === 'mô tả' || h === 'mo ta' || h === 'mota') descIdx = i;
      if (h === 'danh mục') catIdx = i;
    }

    if (descIdx === -1) {
      Logger.log("Header 'Mô tả' không tìm thấy trong 'FinanceLogs'. Vui lòng đảm bảo có cột 'Mô tả'.");
      return;
    }

    // Nếu chưa có cột 'Danh mục' thì thêm ở cuối
    if (catIdx === -1) {
      sheet.getRange(1, lastCol + 1).setValue('Danh mục');
      catIdx = lastCol; // chỉ số 0-based
      lastCol = lastCol + 1;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('Không có dòng dữ liệu để phân loại.');
      return;
    }

    var descRange = sheet.getRange(2, descIdx + 1, lastRow - 1, 1);
    var descValues = descRange.getValues();
    var out = [];
    for (var r = 0; r < descValues.length; r++) {
      var d = descValues[r][0];
      out.push([classifyDescription(d)]);
    }

    sheet.getRange(2, catIdx + 1, out.length, 1).setValues(out);
    Logger.log('reclassifyFinanceLogs: Đã phân loại ' + out.length + ' dòng.');
    return out.length;
  } catch (err) {
    Logger.log('reclassifyFinanceLogs error: ' + err.toString());
  }
}

/**
 * Tùy chọn: thêm menu vào spreadsheet (chỉ hoạt động nếu script gắn vào spreadsheet)
 */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('Finance')
      .addItem('Phân loại (Reclassify)', 'reclassifyFinanceLogs')
      .addToUi();
  } catch (e) {
    // Không bắt lỗi nếu script không chạy trong context Spreadsheet
  }
}
