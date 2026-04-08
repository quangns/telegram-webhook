// ============================================
// TELEGRAM BOT WEBHOOK - GOOGLE APPS SCRIPT
// ============================================

// Commands metadata: update this when adding commands.
// Use `tools/add_command.js` to safely add commands and sync docs.
var COMMANDS = [
  {cmd: "/start", usage: "/start", desc: "Bắt đầu"},
  {cmd: "/help", usage: "/help", desc: "Xem hướng dẫn"},
  {cmd: "/info", usage: "/info", desc: "Thông tin bot"},
  {cmd: "/status", usage: "/status", desc: "Kiểm tra trạng thái"},
  {cmd: "/nhacnho", usage: "/nhacnho ...", desc: "Đặt nhắc (ví dụ: /nhacnho 8h sáng ngày mai Gặp khách)"},
  {cmd: "/log", usage: "/log [thu] [mô tả] [số tiền]", desc: "Ghi thu chi cá nhân"},
  {cmd: "/analyze", usage: "/analyze [1w|1m|tháng N]", desc: "Phân tích thu/chi theo danh mục trong khung thời gian (ví dụ: 1w, 1m, tháng 3)"}
];

// Function to update bot commands dynamically and sync with Telegram
function updateBotCommand(command, description) {
  if (!Array.isArray(COMMANDS)) {
    throw new Error('COMMANDS array is not defined.');
  }

  // update local list
  const existingCommand = COMMANDS.find(cmd => cmd.cmd === command);
  if (existingCommand) {
    existingCommand.desc = description;
  } else {
    COMMANDS.push({ cmd: command, usage: command, desc: description });
  }

  // If no BOT_TOKEN configured, only update local list
  if (typeof BOT_TOKEN === 'undefined' || !BOT_TOKEN) return;

  // Normalize command name to Telegram requirements (no leading '/', lowercase, letters/numbers/underscore)
  function normalizeCmdName(s) {
    if (!s) return '';
    s = String(s).trim();
    if (s.startsWith('/')) s = s.substring(1);
    s = s.toLowerCase();
    // replace spaces with underscores and remove invalid chars
    s = s.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return s.substring(0, 32);
  }

  const commandsForApi = COMMANDS.map(function(c) {
    // Use `COMMANDS.cmd` for command name and include description from `desc` or `usage`
    var name = normalizeCmdName(c.cmd || c.usage || '');
    var desc = String(c.desc || c.usage || name || '').substring(0, 256);
    return {
      command: name,
      description: desc
    };
  }).filter(function(x) { return x.command && x.description; });

  if (commandsForApi.length === 0) return;

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`;
  const payload = { commands: commandsForApi };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const text = response.getContentText();
    let result;
    try { result = JSON.parse(text); } catch (e) { result = { ok: false, description: 'Invalid JSON response', raw: text }; }
    if (!result.ok) {
      Logger.log('setMyCommands payload: ' + JSON.stringify(payload));
      Logger.log('setMyCommands response: ' + text);
      throw new Error('Telegram API error: ' + (result.description || JSON.stringify(result)));
    }
    Logger.log('Telegram commands synced successfully');
  } catch (err) {
    Logger.log('Failed to sync commands: ' + err.toString());
  }
}

// (syncTelegramCommands removed — handled inside updateBotCommand)

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

  // If message contains a document (file) -> handle import
  if (message.document) {
    handleDocumentMessage(message);
    return;
  }

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
    // Build help text from COMMANDS metadata
    try {
      var lines = ['📖 Danh sách lệnh:', ''];
      for (var i = 0; i < COMMANDS.length; i++) {
        var c = COMMANDS[i];
        lines.push((c.usage || c.cmd) + ' - ' + (c.desc || ''));
      }
      sendMessage(chatId, lines.join('\n'));
    } catch (e) {
      // fallback to static text
      sendMessage(chatId, "📖 /start /help /info /hello /status /time /nhacnho /log /search /echo");
    }
  }
  else if (text.startsWith("/info")) {
    const infoText = `ℹ️ Thông tin Bot:\n\n
Tên: SkyHub Telegram Bot\n
Phiên bản: 1.0.0\n
Nền tảng: Google Apps Script\n
Trạng thái: ✅ Hoạt động`;
    sendMessage(chatId, infoText);
  }
  else if (text === "/status") {
    const status = `✅ Bot Status:\n\nTrạng thái: Hoạt động\nThời gian: ${new Date().toLocaleString('vi-VN')}\nUser ID: ${userId}`;
    sendMessage(chatId, status);
  }
  
  else if (text.startsWith("/nhacnho")) {
    // /nhacnho command: delegate to handler
    var args = text.length > 8 ? text.substring(8).trim() : '';
    handleNhacNhoCommand(chatId, userId, args);
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
    else if (text.startsWith("/analyze")) {
        try {
          var parts = text.split(/\s+/);
          var arg = parts.slice(1).join(' ').trim();
          var range = null;
          var now = new Date();
          if (!arg) {
            range = null; // full range
          } else if (/^(\d+)w$/i.test(arg)) {
            var w = parseInt(arg.match(/^(\d+)w$/i)[1], 10);
            var from = new Date(now.getTime() - (w * 7 * 24 * 60 * 60 * 1000));
            range = { from: from, to: now };
          } else if (/^(\d+)m$/i.test(arg)) {
            // interpret '1m' as current month from start
            var m = parseInt(arg.match(/^(\d+)m$/i)[1], 10);
            if (m === 1) {
              var from = new Date(now.getFullYear(), now.getMonth(), 1);
              range = { from: from, to: now };
            } else {
              range = null;
            }
          } else {
            // try parse Vietnamese 'tháng N [YYYY]'
            var mm = arg.match(/th[aá]ng\s*(\d{1,2})(?:\s+(\d{4}))?/i);
            if (mm) {
              var month = parseInt(mm[1], 10);
              var year = mm[2] ? parseInt(mm[2], 10) : now.getFullYear();
              var from = new Date(year, month - 1, 1);
              var to = new Date(year, month, 1);
              to = new Date(to.getTime() - 1); // end of month
              range = { from: from, to: to };
            } else {
              range = null;
            }
          }

          createAnalysisSheet(range);
          var msg = '✅ Đã tạo/‌cập nhật sheet "Analysis" và biểu đồ phân tích.';
          if (range && range.from) {
            msg += '\nPhạm vi: ' + (range.from.toLocaleString('vi-VN')) + ' → ' + (range.to ? range.to.toLocaleString('vi-VN') : now.toLocaleString('vi-VN'));
          }
          sendMessage(chatId, msg);
        } catch (err) {
          Logger.log('Error running analyze via Telegram: ' + err.toString());
          sendMessage(chatId, "❌ Lỗi khi phân tích: " + (err.message || err));
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
// searchPerplexity removed — /search command no longer supported

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
  try {
    // Register commands after webhook setup
    if (Array.isArray(COMMANDS) && COMMANDS.length > 0) {
      for (var i = 0; i < COMMANDS.length; i++) {
        try {
          var c = COMMANDS[i];
          updateBotCommand(c.cmd || c.usage, c.desc || c.usage || '');
        } catch (e) {
          Logger.log('updateBotCommand error for ' + JSON.stringify(COMMANDS[i]) + ': ' + e.toString());
        }
      }
    }
  } catch (err) {
    Logger.log('Error registering commands after webhook setup: ' + err.toString());
  }
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
// IMPORT FILES (PDF / XLSX) + ANALYSIS
// ============================================

function handleDocumentMessage(message) {
  try {
    var chatId = message.chat.id;
    var doc = message.document;
    var fileId = doc.file_id;
    var fileName = doc.file_name || ('file_' + new Date().getTime());
    // Get file path from Telegram
    var resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    var data = JSON.parse(resp.getContentText());
    if (!data.ok) {
      sendMessage(chatId, "❌ Không tải được file từ Telegram.");
      return;
    }
    var filePath = data.result.file_path;
    var fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    var blob = UrlFetchApp.fetch(fileUrl).getBlob();
    blob.setName(fileName);

    // Decide by extension
    var lower = fileName.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || doc.mime_type && doc.mime_type.indexOf('spreadsheet') !== -1) {
      var added = importXlsxBlobToFinanceLogs(blob, fileName);
      sendMessage(chatId, "✅ Đã import " + added + " giao dịch từ file spreadsheet.");
    } else if (lower.endsWith('.pdf') || doc.mime_type && doc.mime_type.indexOf('pdf') !== -1) {
      var added2 = importPdfBlobToFinanceLogs(blob, fileName);
      sendMessage(chatId, "✅ Đã import ~" + added2 + " giao dịch từ file PDF (kết quả ước lượng).");
    } else {
      sendMessage(chatId, "❌ Định dạng file không được hỗ trợ. Vui lòng gửi .xlsx hoặc .pdf");
    }
  } catch (err) {
    Logger.log('handleDocumentMessage error: ' + err.toString());
  }
}

function importXlsxBlobToFinanceLogs(blob, filename) {
  try {
    // Try converting via Drive API (Advanced Drive service) if available
    var file;
    var ss;
    try {
      var resource = { title: filename };
      file = Drive.Files.insert(resource, blob, { convert: true });
      ss = SpreadsheetApp.openById(file.id);
    } catch (e) {
      // fallback: create file in Drive and try to open
      var f = DriveApp.createFile(blob);
      try { ss = SpreadsheetApp.openById(f.getId()); } catch (e2) { throw e; }
    }

    var sheet0 = ss.getSheets()[0];
    var data = sheet0.getDataRange().getValues();
    // Heuristic: find description and amount columns
    var header = data[0].map(function(h){ return String(h).toLowerCase(); });
    var descIdx = header.indexOf('description');
    if (descIdx === -1) descIdx = header.indexOf('mô tả');
    var amtIdx = header.indexOf('amount');
    if (amtIdx === -1) amtIdx = header.indexOf('số tiền (vnd)');
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var desc = (descIdx >=0) ? data[i][descIdx] : data[i][0];
      var amt = (amtIdx >=0) ? data[i][amtIdx] : '';
      rows.push({description: desc, amount: String(amt)});
    }
    return appendTransactionsToFinanceLogs(rows, 'import');
  } catch (err) {
    Logger.log('importXlsxBlobToFinanceLogs error: ' + err.toString());
    return 0;
  }
}

function importPdfBlobToFinanceLogs(blob, filename) {
  try {
    // Try to convert PDF -> Google Doc using Drive API (convert:true)
    var docFile;
    var text = '';
    try {
      var resource = { title: filename, mimeType: MimeType.GOOGLE_DOCS };
      docFile = Drive.Files.insert(resource, blob, { convert: true });
      var doc = DocumentApp.openById(docFile.id);
      text = doc.getBody().getText();
    } catch (e) {
      // fallback: try saving pdf and use OCR/third-party - here we just extract raw text if possible
      var saved = DriveApp.createFile(blob);
      Logger.log('PDF conversion failed; saved to Drive id=' + saved.getId());
      text = '';
    }

    if (!text) {
      return 0;
    }

    var txs = parseBankStatementText(text);
    return appendTransactionsToFinanceLogs(txs, 'pdf-import');
  } catch (err) {
    Logger.log('importPdfBlobToFinanceLogs error: ' + err.toString());
    return 0;
  }
}

function parseBankStatementText(text) {
  var lines = text.split(/\r?\n/);
  var txs = [];
  for (var i=0;i<lines.length;i++){
    var l = lines[i].trim();
    if (!l) continue;
    // find amount-like token
    var m = l.match(/([\d\.,]+\s*(k|m|tr|vnd)?)/i);
    if (m) {
      var amtRaw = m[0];
      var desc = l.replace(m[0],'').trim();
      if (desc.length > 200) desc = desc.slice(0,200);
      txs.push({description: desc || 'auto-import', amount: amtRaw});
    }
  }
  return txs;
}

function appendTransactionsToFinanceLogs(rows, source) {
  try {
    if (!rows || rows.length===0) return 0;
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('FinanceLogs');
    if (!sheet) {
      sheet = ss.insertSheet('FinanceLogs');
      sheet.appendRow(['Thời gian','Username','Loại','Danh mục','Mô tả','Số tiền (VND)']);
    }
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1,1,1,lastCol).getValues()[0];
    var out = [];
    for (var i=0;i<rows.length;i++){
      var desc = rows[i].description;
      var amt = parseAmountString(rows[i].amount);
      var cat = classifyDescription(desc);
      var row = [];
      for (var c=0;c<headers.length;c++){
        var h = headers[c];
        if (h === 'Thời gian') row.push(new Date().toLocaleString('vi-VN'));
        else if (h === 'Username') row.push(source);
        else if (String(h).toLowerCase().indexOf('loại')!==-1) row.push('Chi');
        else if (String(h).toLowerCase().indexOf('danh mục')!==-1) row.push(cat);
        else if (String(h).toLowerCase().indexOf('mô tả')!==-1 || String(h).toLowerCase().indexOf('mota')!==-1) row.push(desc);
        else if (String(h).toLowerCase().indexOf('số tiền')!==-1 || String(h).toLowerCase().indexOf('so tien')!==-1) row.push(amt);
        else row.push('');
      }
      out.push(row);
    }
    sheet.getRange(sheet.getLastRow()+1,1,out.length,out[0].length).setValues(out);
    return out.length;
  } catch (err) {
    Logger.log('appendTransactionsToFinanceLogs error: ' + err.toString());
    return 0;
  }
}

function createAnalysisSheet(range) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var dataSheet = ss.getSheetByName('FinanceLogs');
    if (!dataSheet) throw new Error("Sheet 'FinanceLogs' not found");
    var lastRow = dataSheet.getLastRow();
    if (lastRow < 2) throw new Error('No data to analyze');
    var lastCol = dataSheet.getLastColumn();
    var headers = dataSheet.getRange(1,1,1,lastCol).getValues()[0];

    // find indices (0-based for arrays, will use .getRange with 1-based)
    var timeIdx = -1, catIdx = -1, amtIdx = -1;
    for (var i=0;i<headers.length;i++){
      var h = String(headers[i]).toLowerCase();
      if (h.indexOf('thời gian') !== -1 || h.indexOf('thoi gian') !== -1) timeIdx = i;
      if (h === 'danh mục' || h.indexOf('danh mục') !== -1 || h.indexOf('danh muc') !== -1) catIdx = i;
      if (h.indexOf('số tiền') !== -1 || h.indexOf('so tien') !== -1 || h.indexOf('sotien') !== -1) amtIdx = i;
    }
    if (catIdx === -1) throw new Error("Header 'Danh mục' not found");
    if (amtIdx === -1) throw new Error("Header 'Số tiền (VND)' not found");

    var rows = dataSheet.getRange(2,1,lastRow-1,lastCol).getValues();
    var sums = {};
    for (var r=0;r<rows.length;r++){
      var row = rows[r];
      var rowDate = null;
      if (timeIdx !== -1) {
        var tv = row[timeIdx];
        if (tv instanceof Date) rowDate = tv;
        else if (tv) {
          var parsed = Date.parse(String(tv));
          if (!isNaN(parsed)) rowDate = new Date(parsed);
        }
      }

      // if range provided, skip rows without valid date or outside range
      if (range && range.from) {
        if (!rowDate) continue;
        if (range.to) {
          if (rowDate.getTime() < range.from.getTime() || rowDate.getTime() > range.to.getTime()) continue;
        } else {
          if (rowDate.getTime() < range.from.getTime()) continue;
        }
      }

      var cat = String(row[catIdx] || 'khác');
      var amtRaw = row[amtIdx];
      var amt = Number(amtRaw);
      if (isNaN(amt)) {
        amt = parseAmountString(amtRaw) || 0;
      }
      sums[cat] = (sums[cat] || 0) + (amt || 0);
    }

    var analysis = ss.getSheetByName('Analysis');
    if (!analysis) analysis = ss.insertSheet('Analysis');
    analysis.clear();

    var out = [['Danh mục','Tổng']];
    for (var k in sums) {
      out.push([k, sums[k]]);
    }

    if (out.length === 1) {
      analysis.getRange(1,1,1,1).setValue('Không có dữ liệu phù hợp với phạm vi đã chọn.');
      return true;
    }

    analysis.getRange(1,1,out.length,out[0].length).setValues(out);
    try { analysis.getRange(2,2,out.length-1,1).setNumberFormat('#,##0'); } catch(e){}

    var noteText = 'Ghi chú: Báo cáo tổng hợp số tiền theo "Danh mục" lấy từ sheet "FinanceLogs". Thời gian tạo: ' + new Date().toLocaleString('vi-VN');
    if (range && range.from) {
      noteText += '\nPhạm vi: ' + range.from.toLocaleString('vi-VN') + (range.to ? (' → ' + range.to.toLocaleString('vi-VN')) : ' → hiện tại');
    }
    analysis.getRange(1,4).setValue(noteText);
    try { analysis.setColumnWidth(4, 420); } catch(e){}

    try {
      var dataRowCount = out.length - 1;
      if (dataRowCount > 0) {
        var dataRange = analysis.getRange(2,1,dataRowCount,2);
        var chart = analysis.newChart()
          .setChartType(Charts.ChartType.PIE)
          .addRange(dataRange)
          .setPosition(2,4,0,0)
          .setOption('title', 'Phân bố thu/chi theo danh mục')
          .setOption('pieSliceText', 'percentage')
          .setOption('legend', 'right')
          .build();
        analysis.insertChart(chart);
      }
    } catch(e) { Logger.log('Chart creation failed: ' + e.toString()); }

    return true;
  } catch (err) {
    Logger.log('createAnalysisSheet error: ' + err.toString());
    throw err;
  }
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
  "thư giãn": ["du lịch","du lich","tham quan","vui chơi","khách sạn","khach san","resort","spa","công viên","cong vien","tour","bảo tàng","bao tang"],
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

  // Special-case: xử lý các chuỗi chứa "vé <x>"
  if (s.indexOf('vé ') !== -1 || s.indexOf('ve ') !== -1) {
    var transportKeywords = ['xe', 'tàu', 'tau', 'bus', 'máy bay', 'may bay', 'taxi', 'ô tô', 'oto', 'ôtô', 'xe máy', 'xe ôm', 'xeom', 'grab', 'vé xe', 'vé tàu', 'vé máy bay', 'vé taxi'];
    var leisureKeywords = ['tham quan', 'du lịch', 'du lich', 'vui chơi', 'công viên', 'cong vien', 'tour', 'bảo tàng', 'bao tang', 'khách sạn', 'khach san', 'resort', 'vé tham quan', 'vé du lịch'];

    for (var ti = 0; ti < transportKeywords.length; ti++) {
      if (s.indexOf(transportKeywords[ti]) !== -1) return 'xăng xe';
    }
    for (var li = 0; li < leisureKeywords.length; li++) {
      if (s.indexOf(leisureKeywords[li]) !== -1) return 'thư giãn';
    }
  }

  // Fall back to general keyword lists
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

// ============================================
// Reminders: `/nhacnho` command + scheduler
// ============================================

/**
 * Handle /nhacnho command from Telegram.
 * Supported formats:
 * /nhacnho YYYY-MM-DD HH:MM message
 * /nhacnho YYYY-MM-DDTHH:MM message
 * /nhacnho HH:MM message (today at that time)
 * /nhacnho in 10m message  (relative minutes)
 * /nhacnho in 2h message   (relative hours)
 */
function handleNhacNhoCommand(chatId, userId, argsText) {
  try {
    var rest = (argsText || '').toString().trim();
    if (!rest) {
      sendMessage(chatId, '❌ Cách dùng: /nhacnho 2026-04-08 15:30 Nộp báo cáo\nHoặc: /nhacnho 15:30 Gọi điện');
      return;
    }

    var whenDate = null;
    var messageText = '';

    // 1) Vietnamese short form: "8h sáng ngày mai ..." or "8:30 chiều mai ..."
    var m = rest.match(/^([0-9]{1,2})(?::([0-9]{2}))?\s*h?\s*(sáng|chiều|tối|sang|chieu|toi)?\s*(ngày mai|mai)?\s+([\s\S]+)$/i);
    if (m) {
      var hour = parseInt(m[1], 10);
      var minute = m[2] ? parseInt(m[2], 10) : 0;
      var period = (m[3] || '').toLowerCase();
      var dayToken = (m[4] || '').toLowerCase();
      messageText = (m[5] || '').trim();

      var base = new Date();
      if (dayToken === 'ngày mai' || dayToken === 'mai') base.setDate(base.getDate() + 1);
      if (period === 'chiều' || period === 'chieu' || period === 'tối' || period === 'toi') {
        if (hour < 12) hour += 12;
      }
      if ((period === 'sáng' || period === 'sang') && hour === 12) hour = 0;
      whenDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0);
    }

    // 2) Absolute datetime: YYYY-MM-DD HH:MM
    if (!whenDate) {
      m = rest.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2})\s+([\s\S]+)$/);
      if (m) {
        whenDate = parseIsoLikeDate(m[1]);
        messageText = (m[2] || '').trim();
      }
    }

    // 3) Time only today: HH:MM message
    if (!whenDate) {
      m = rest.match(/^([0-9]{2}:[0-9]{2})\s+([\s\S]+)$/);
      if (m) {
        whenDate = parseTimeToday(m[1]);
        messageText = (m[2] || '').trim();
      }
    }

    // 4) Relative: in 10m message or in 2h message
    if (!whenDate) {
      m = rest.match(/^in\s+([0-9]+)(m|h)\s+([\s\S]+)$/i);
      if (m) {
        var val = parseInt(m[1], 10);
        var unit = m[2].toLowerCase();
        whenDate = new Date();
        if (unit === 'm') whenDate.setMinutes(whenDate.getMinutes() + val);
        else whenDate.setHours(whenDate.getHours() + val);
        messageText = (m[3] || '').trim();
      }
    }

    if (!whenDate || isNaN(whenDate.getTime())) {
      sendMessage(chatId, '❌ Không nhận dạng được thời gian. Dùng: /nhacnho YYYY-MM-DD HH:MM lời_nhắc\nHoặc: /nhacnho 15:30 Gọi điện\nHoặc: /nhacnho in 10m Xong việc');
      return;
    }

    var now = new Date();
    if (whenDate.getTime() <= now.getTime()) {
      sendMessage(chatId, '❌ Thời gian đã qua. Vui lòng đặt thời gian trong tương lai.');
      return;
    }

    scheduleReminder(chatId, userId, whenDate, messageText);
    sendMessage(chatId, '✅ Đã đặt nhắc: ' + whenDate.toLocaleString('vi-VN') + ' -> ' + messageText);
  } catch (err) {
    Logger.log('handleNhacNhoCommand error: ' + err.toString());
    try { sendMessage(chatId, '❌ Lỗi khi đặt nhắc. Vui lòng thử lại.'); } catch (e) {}
  }
}

function parseIsoLikeDate(s) {
  // Accept YYYY-MM-DD HH:MM or YYYY-MM-DDTHH:MM
  s = s.replace('T', ' ');
  return new Date(s);
}

function parseTimeToday(hm) {
  var now = new Date();
  var parts = hm.split(':');
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0],10), parseInt(parts[1],10), 0);
  return d;
}

function scheduleReminder(chatId, userId, whenDate, messageText) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Reminders');
    var headers = ['ChatId','UserId','WhenUtc','WhenLocal','Message','Sent','CreatedAt','SentAt'];
    if (!sheet) {
      sheet = ss.insertSheet('Reminders');
      sheet.appendRow(headers);
    }

    // Ensure headers exist
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      sheet.appendRow(headers);
      lastCol = sheet.getLastColumn();
    }

    var now = new Date();
    var row = [String(chatId), String(userId), whenDate.toISOString(), whenDate.toLocaleString('vi-VN'), messageText, '', now.toISOString(), ''];
    sheet.appendRow(row);

    // Ensure scheduler trigger exists
    createReminderTriggerIfNotExists();
  } catch (err) {
    Logger.log('scheduleReminder error: ' + err.toString());
  }
}

function createReminderTriggerIfNotExists() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i=0;i<triggers.length;i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'checkReminders') return;
    }
    // create a minute-based trigger
    ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(1).create();
    Logger.log('Created trigger for checkReminders()');
  } catch (err) {
    Logger.log('createReminderTriggerIfNotExists error: ' + err.toString());
  }
}

/**
 * Run by time-driven trigger (every minute). Finds due reminders and sends messages.
 */
function checkReminders() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Reminders');
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var data = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
    var updates = [];
    var now = new Date();
    for (var i=0;i<data.length;i++) {
      var row = data[i];
      var chatId = row[0];
      var sent = row[5];
      var whenUtc = row[2];
      if (sent && String(sent).toLowerCase() === 'true') continue;
      var whenDate = new Date(whenUtc);
      if (isNaN(whenDate.getTime())) continue;
      if (whenDate.getTime() <= now.getTime()) {
        var messageText = row[4] || '🔔 Nhắc nhở của bạn!';
        try {
          sendMessage(chatId, `🔔 Nhắc: ${messageText}`);
          // mark sent
          sheet.getRange(i+2, 6).setValue('TRUE');
          sheet.getRange(i+2, 8).setValue(new Date().toISOString());
        } catch (sendErr) {
          Logger.log('Error sending reminder to ' + chatId + ': ' + sendErr.toString());
        }
      }
    }
  } catch (err) {
    Logger.log('checkReminders error: ' + err.toString());
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
