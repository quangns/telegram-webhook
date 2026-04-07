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
      
      // Xử lý viết tắt số tiền
      let multiplier = 1;
      let cleanAmountStr = amountStr.replace(/,/g, '');
      if (cleanAmountStr.toLowerCase().endsWith('tr')) {
        multiplier = 1000000;
        cleanAmountStr = cleanAmountStr.slice(0, -2);
      } else if (cleanAmountStr.toLowerCase().endsWith('k')) {
        multiplier = 1000;
        cleanAmountStr = cleanAmountStr.slice(0, -1);
      }
      const baseAmount = parseFloat(cleanAmountStr);
      const amount = baseAmount * multiplier;
      
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
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    let sheet = spreadsheet.getSheetByName("FinanceLogs");
    if (!sheet) {
      sheet = spreadsheet.insertSheet("FinanceLogs");
      sheet.appendRow(["Thời gian", "Username", "Loại", "Mô tả", "Số tiền (VND)"]);
    }
    sheet.appendRow([new Date().toLocaleString('vi-VN'), username, type === 'thu' ? 'Thu' : 'Chi', description, amount]);
    Logger.log(`Logged /log command: ${username} -> ${type} ${description} ${amount}`);
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
