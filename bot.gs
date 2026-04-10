// ============================================
// TELEGRAM BOT WEBHOOK - GOOGLE APPS SCRIPT
// ============================================

// Commands metadata: update this when adding commands.
// Use `tools/add_command.js` to safely add commands and sync docs.
var COMMANDS = [
  {cmd: "/start", usage: "/start", desc: "Bắt đầu"},
  {cmd: "/help", usage: "/help", desc: "Xem hướng dẫn"},
  {cmd: "/nhacnho", usage: "/nhacnho ...", desc: "Đặt nhắc (ví dụ: /nhacnho 8h sáng ngày mai Gặp khách)"},
  {cmd: "/log", usage: "/log [thu] [mô tả] [số tiền]", desc: "Ghi thu chi cá nhân"},
  {cmd: "/analyze", usage: "/analyze [1w|1m|tháng N]", desc: "Phân tích thu/chi theo danh mục trong khung thời gian (ví dụ: 1w, 1m, tháng 3)"},
  {cmd: "/saoke", usage: "/saoke [bank]", desc: "Nhập sao kê ngân hàng vào FinanceLogs"}
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
// 0. SETUP WEBHOOK (moved to top)
// ============================================
function setupWebhook() {
  try {
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
  } catch (err) {
    Logger.log('setupWebhook error: ' + err.toString());
  }
}

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
  let text = String(message.text || message.caption || "");
  const messageId = message.message_id;

  // If message contains a document (file), prioritize /saoke or pending bank-import flow.
  if (message.document) {
    try {
      var docCommandText = String(message.text || message.caption || '').trim();
      if (docCommandText && docCommandText.startsWith('/saoke')) {
        handleSaokeCommand(chatId, userId, docCommandText.replace(/^\/saoke\b/i, '').trim(), message);
        return;
      }

      var docProps = PropertiesService.getScriptProperties();
      var pendingBank = docProps.getProperty('PENDING_SAOKE_' + chatId);
      if (pendingBank) {
        docProps.deleteProperty('PENDING_SAOKE_' + chatId);
        handleSaokeCommand(chatId, userId, pendingBank, message);
        return;
      }
    } catch (docErr) {
      Logger.log('document-command-routing error: ' + docErr.toString());
    }

    handleDocumentMessage(message);
    return;
  }

  // If this is a forwarded message with text, try to detect a time token and auto-schedule.
  // If no clear time found, save pending reminder and ask user to reply with a specific time.
  try {
    if ((message.forward_date || message.forward_from || message.forward_from_chat) && message.text) {
      var ftext = String(message.text || '').trim();
      // time token regex: matches HH:MM, H:MM, Hh, HhMM, e.g. 20h, 8:30, 13h20
      var timeTokenRe = /([0-9]{1,2}(?::[0-9]{2})?|[0-9]{1,2}h[0-9]{0,2})/i;
      var timeMatch = ftext.match(timeTokenRe);
      if (timeMatch) {
        // build args for handleNhacNhoCommand: e.g. "20h ăn tối"
        var idx = ftext.indexOf(timeMatch[0]);
        var after = ftext.slice(idx + timeMatch[0].length).trim();
        var argsForNhac = timeMatch[0] + (after ? ' ' + after : ' ' + ftext);
        handleNhacNhoCommand(chatId, userId, argsForNhac);
        return;
      } else {
        // no explicit numeric time found -> ask user to reply with specific time
        var props = PropertiesService.getScriptProperties();
        props.setProperty('PENDING_REMINDER_' + chatId, ftext);
        var preview = (ftext.length > 200) ? (ftext.slice(0,200) + '...') : ftext;
        var ask = 'Tôi thấy bạn đã forward một tin nhắn:\n"' + preview + '"\n\n' +
          'Tuy nhiên tôi không tìm thấy giờ cụ thể trong nội dung. Vui lòng trả lời tin nhắn này với thời gian bạn muốn (ví dụ: "20h", "15:30" hoặc "in 20m"). Tôi sẽ dùng nội dung bạn forward làm lời nhắc.';
        sendMessage(chatId, ask);
        return;
      }
    }
  } catch (e) {
    Logger.log('forward-time-detect error: ' + e.toString());
  }

  // If user replied with a time and we have a pending forwarded message, schedule it
  try {
    if (text && !text.startsWith('/') ) {
      var pprops = PropertiesService.getScriptProperties();
      var pending = pprops.getProperty('PENDING_REMINDER_' + chatId);
      if (pending) {
        // If the forwarded text mentions 'mai' (tomorrow), inject it right after the time
        var pendingLower = String(pending || '').toLowerCase();
        var hasMai = /\b(ngày\s+mai|mai)\b/i.test(pendingLower);
        var cleanedPending = pending.replace(/\b(ngày\s+mai|mai)\b/ig, '').trim();
        var combinedArgs;
        if (hasMai) {
          // place 'mai' immediately after time so parser recognizes it as day token
          combinedArgs = text + ' mai ' + (cleanedPending || '');
        } else {
          combinedArgs = text + ' ' + pending;
        }
        // clear pending before scheduling to avoid duplicates
        pprops.deleteProperty('PENDING_REMINDER_' + chatId);
        handleNhacNhoCommand(chatId, userId, combinedArgs.trim());
        return;
      }
    }
  } catch (e) {
    Logger.log('pending-reply-handler error: ' + e.toString());
  }

  // Loại bỏ tên bot khỏi câu lệnh (ví dụ: /log@BOT_NAME -> /log)
  if (typeof BOT_NAME !== 'undefined' && BOT_NAME) {
    if (text.startsWith("/") && text.includes(BOT_NAME)) {
      text = text.replace(BOT_NAME, "");
    }
  }

        var timeIdx = -1, catIdx = -1, amtIdx = -1, typeIdx = -1;

  // Xử lý các lệnh
  if (text.startsWith("/start")) {
    var helpList = COMMANDS.map(function(c) { return (c.usage || c.cmd || '') + ' — ' + (c.desc || ''); }).join('\n');
    sendMessage(chatId, "👋 Xin chào! Tôi là bot Google Apps Script.\n\nCác lệnh có sẵn:\n" + helpList, getMainKeyboard());
  }
  else if (text.startsWith("/help")) {
    // Build help text from COMMANDS metadata
    try {
      var lines = ['📖 Danh sách lệnh:', ''];
      for (var i = 0; i < COMMANDS.length; i++) {
        var c = COMMANDS[i] || {};
        var name = c.usage || c.cmd || '';
        var desc = c.desc || '';
        lines.push(name + ' — ' + desc);
      }
      sendMessage(chatId, lines.join('\n'));
    } catch (e) {
      Logger.log('help command error: ' + e.toString());
      sendMessage(chatId, '❌ Lỗi khi hiển thị trợ giúp.');
    }
  }
    else if (text.startsWith("/analyze")) {
        try {
          var parts = text.split(/\s+/);
          var rawArg = parts.slice(1).join(' ').trim();

          // Support optional focus type: leading 'chi' or 'thu'
          var focusType = null;
          var argWork = (rawArg || '').trim();
          var mtype = argWork.match(/^(chi|thu)\b\s*/i);
          if (mtype) {
            focusType = mtype[1].toLowerCase();
            argWork = argWork.replace(/^(chi|thu)\b\s*/i, '').trim();
          }

          var arg = argWork; // remaining arg used for range parsing
          var range = null;
          var now = new Date();
          if (!arg) {
            range = null; // full range
          } else if (/^(\d+)w$/i.test(arg)) {
            var w = parseInt(arg.match(/^(\d+)w$/i)[1], 10);
            // start at 00:00 of (w*7) days ago, end at end of today
            var from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (w * 7), 0, 0, 0, 0);
            var to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            range = { from: from, to: to };
          } else if (/^(\d+)m$/i.test(arg)) {
            // interpret '1m' as last 30 days starting at 00:00 of 30 days ago
            var mmCount = parseInt(arg.match(/^(\d+)m$/i)[1], 10);
            var days = mmCount * 30;
            var from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 0, 0, 0, 0);
            var to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            range = { from: from, to: to };
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

          createAnalysisSheet(range, focusType);
          var noteTarget = focusType === 'chi' ? 'Chi' : (focusType === 'thu' ? 'Thu' : 'Chi & Thu');
          var msg = '✅ Đã tạo/\u200ccập nhật sheet "Analysis" và biểu đồ phân tích (' + noteTarget + ').';
          if (range && range.from) {
            msg += '\nPhạm vi: ' + (range.from.toLocaleString('vi-VN')) + ' → ' + (range.to ? range.to.toLocaleString('vi-VN') : now.toLocaleString('vi-VN'));
          }
          sendMessage(chatId, msg);
        } catch (err) {
          Logger.log('Error running analyze via Telegram: ' + err.toString());
          sendMessage(chatId, "❌ Lỗi khi phân tích: " + (err.message || err));
        }
      }
  else if (text.startsWith("/log")) {
    try {
      // /log [thu] [mô tả] [số tiền]
      var toks = text.split(/\s+/).slice(1); // drop command
      if (!toks || toks.length === 0) {
        sendMessage(chatId, '❌ Cách dùng: /log [thu] [mô tả] [số tiền] (ví dụ: /log ăn tối 10k hoặc /log thu lương 1000000)');
      } else {
        var type = 'chi';
        var explicitType = false;
        if (/^thu$/i.test(toks[0])) {
          type = 'thu';
          explicitType = true;
          toks = toks.slice(1);
        } else if (/^chi$/i.test(toks[0])) {
          type = 'chi';
          explicitType = true;
          toks = toks.slice(1);
        }

        // amount is expected as last token
        var amountToken = toks.length ? toks[toks.length - 1] : '';
        var amountVal = parseAmountString(amountToken);
        var description = '';
        if (!isNaN(amountVal) && amountToken) {
          description = toks.slice(0, toks.length - 1).join(' ').trim();
        } else {
          // try inline match for amount anywhere
          var m = text.match(/([\d\.,]+\s*(k|m|tr|vnd)?)/i);
          if (m) {
            amountVal = parseAmountString(m[0]);
            // remove matched amount from description
            description = text.replace(/\/log\b/i, '').replace(m[0], '').trim();
            // strip possible leading 'thu'/'chi'
            description = description.replace(/^\s*(thu|chi)\b\s*/i, '').trim();
          } else {
            amountVal = NaN;
          }
        }

        if (!description) description = '(no description)';

        // auto-detect type from description if not explicit
        try {
          var autoCat = classifyDescription(description || '');
          var autoCatLower = String(autoCat || '').toLowerCase();
          if (!explicitType && (autoCatLower.indexOf('lương') !== -1 || autoCatLower.indexOf('thưởng') !== -1 || autoCatLower.indexOf('được') !== -1 || autoCatLower.indexOf('được') !== -1)) {
            type = 'thu';
          }
        } catch (e) {
          // ignore
        }

        if (isNaN(amountVal)) {
          sendMessage(chatId, '❌ Không nhận dạng được số tiền. Vui lòng ghi dạng: /log [thu] Mô_tả 10000 (ví dụ: /log ăn tối 10k)');
        } else {
          // record
          try {
            logFinanceCommand(username, type, description, amountVal);
            sendMessage(chatId, '✅ Đã ghi ' + (type === 'thu' ? 'Thu' : 'Chi') + ': ' + description + ' — ' + amountVal.toLocaleString('vi-VN') + ' VND');
          } catch (err) {
            Logger.log('log command save error: ' + err.toString());
            sendMessage(chatId, '❌ Lỗi khi ghi lệnh. Vui lòng thử lại.');
          }
        }
      }
    } catch (err) {
      Logger.log('handle /log error: ' + err.toString());
      sendMessage(chatId, '❌ Lỗi khi xử lý /log.');
    }
  }
  else if (text.startsWith("/nhacnho")) {
    try {
      var argsText = text.replace(/^\/nhacnho\b/i, '').trim();
      handleNhacNhoCommand(chatId, userId, argsText);
    } catch (e) {
      Logger.log('handle /nhacnho error: ' + e.toString());
      sendMessage(chatId, '❌ Lỗi khi đặt nhắc.');
    }
  }
  else if (text.startsWith("/saoke")) {
    try {
      var saokeArgsText = text.replace(/^\/saoke\b/i, '').trim();
      handleSaokeCommand(chatId, userId, saokeArgsText, message);
    } catch (e) {
      Logger.log('handle /saoke error: ' + e.toString());
      sendMessage(chatId, '❌ Lỗi khi xử lý /saoke.');
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
    var desiredHeaders = getFinanceLogsHeaders();
    if (!sheet) {
      sheet = spreadsheet.insertSheet("FinanceLogs");
      sheet.appendRow(desiredHeaders);
    }

    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      sheet.appendRow(desiredHeaders);
      lastCol = sheet.getLastColumn();
    }

    var currentHeaders = ensureFinanceLogsHeaders(sheet);

    var category = classifyDescription(description);

    // Build row aligned to currentHeaders
    var row = new Array(currentHeaders.length).fill('');
    function setVal(h, v) {
      var idx = currentHeaders.indexOf(h);
      if (idx !== -1) row[idx] = v;
    }
    setVal("Thời gian", new Date().toISOString());
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
      var importResult = createEmptyImportResult();
      var looksLikeTech = /saoketk|saoke|tech/i.test(lower);
      if (looksLikeTech) {
        importResult = importTechStatementBlobToFinanceLogs(blob, fileName);
      }
      if (!importResult.inserted && !importResult.duplicateButToan && !importResult.invalidRows) {
        importResult = importXlsxBlobToFinanceLogs(blob, fileName);
      }

      if (importResult.inserted > 0 || importResult.duplicateButToan > 0) {
        sendMessage(chatId, formatImportResultMessage('✅ Kết quả import file spreadsheet:', importResult));
      } else {
        sendMessage(chatId, "⚠️ Chưa bóc tách được dữ liệu từ file spreadsheet. Nếu đây là sao kê Tech, hãy gửi `/saoke tech` kèm file hoặc reply lệnh đó rồi gửi file.");
      }
    } else if (lower.endsWith('.pdf') || doc.mime_type && doc.mime_type.indexOf('pdf') !== -1) {
      var pdfImportResult = importPdfBlobToFinanceLogs(blob, fileName);
      if (pdfImportResult.inserted > 0 || pdfImportResult.duplicateButToan > 0) {
        sendMessage(chatId, formatImportResultMessage('✅ Kết quả import file PDF:', pdfImportResult));
      } else {
        sendMessage(chatId, "⚠️ Chưa bóc tách được giao dịch nào từ file PDF.");
      }
    } else {
      sendMessage(chatId, "❌ Định dạng file không được hỗ trợ. Vui lòng gửi .xlsx hoặc .pdf");
    }
  } catch (err) {
    Logger.log('handleDocumentMessage error: ' + err.toString());
  }
}

function handleSaokeCommand(chatId, userId, argsText, message) {
  try {
    var bank = String(argsText || '').trim().toLowerCase();
    if (!bank) {
      sendMessage(chatId, '❌ Cách dùng: /saoke [bank]\nVí dụ: /saoke tech rồi gửi hoặc forward file sao kê vào chat.');
      return;
    }

    var doc = null;
    if (message && message.document) doc = message.document;
    else if (message && message.reply_to_message && message.reply_to_message.document) doc = message.reply_to_message.document;

    if (!doc) {
      PropertiesService.getScriptProperties().setProperty('PENDING_SAOKE_' + chatId, bank);
      sendMessage(chatId, '📎 Đã ghi nhận `/saoke ' + bank + '`. Bây giờ hãy gửi hoặc forward file sao kê để tôi ghi vào `FinanceLogs`.');
      return;
    }

    var fileId = doc.file_id;
    var fileName = doc.file_name || ('file_' + new Date().getTime());
    var resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    var data = JSON.parse(resp.getContentText());
    if (!data.ok) {
      sendMessage(chatId, '❌ Không tải được file từ Telegram.');
      return;
    }

    var filePath = data.result.file_path;
    var fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    var blob = UrlFetchApp.fetch(fileUrl).getBlob();
    blob.setName(fileName);

    var importResult = createEmptyImportResult();
    if (bank === 'tech') {
      importResult = importTechStatementBlobToFinanceLogs(blob, fileName);
    } else {
      importResult = importXlsxBlobToFinanceLogs(blob, fileName);
    }

    if (importResult.inserted > 0 || importResult.duplicateButToan > 0) {
      sendMessage(chatId, formatImportResultMessage('✅ Kết quả import sao kê ' + bank + ':', importResult));
    } else {
      sendMessage(chatId, '⚠️ Không bóc tách được giao dịch nào từ file ' + fileName + '. Hãy kiểm tra đúng mẫu sao kê rồi thử lại.');
    }
  } catch (err) {
    Logger.log('handleSaokeCommand error: ' + err.toString());
    sendMessage(chatId, '❌ Lỗi khi xử lý sao kê.');
  }
}

function openSpreadsheetFromExcelBlob(blob, filename) {
  var resource = { title: filename };
  var file = Drive.Files.insert(resource, blob, { convert: true });
  return SpreadsheetApp.openById(file.id);
}

function readFirstWorksheetRowsFromXlsxBlob(blob) {
  var files = Utilities.unzip(blob);
  if (!files || !files.length) throw new Error('Không giải nén được file .xlsx');

  var fileMap = {};
  for (var i = 0; i < files.length; i++) {
    fileMap[files[i].getName()] = files[i].getDataAsString();
  }

  var mainNs = XmlService.getNamespace('http://schemas.openxmlformats.org/spreadsheetml/2006/main');
  var relNs = XmlService.getNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
  var pkgNs = XmlService.getNamespace('http://schemas.openxmlformats.org/package/2006/relationships');

  function colLettersToIndex(letters) {
    var n = 0;
    for (var j = 0; j < letters.length; j++) {
      n = n * 26 + (letters.charCodeAt(j) - 64);
    }
    return n - 1;
  }

  function getNestedText(node) {
    var out = [];
    var descendants = node.getDescendants();
    for (var d = 0; d < descendants.length; d++) {
      var item = descendants[d];
      if (item.getType && item.getType() === XmlService.ContentTypes.ELEMENT) {
        var el = item.asElement();
        if (el.getName() === 't') out.push(el.getText());
      }
    }
    return out.join('');
  }

  var shared = [];
  if (fileMap['xl/sharedStrings.xml']) {
    var sharedDoc = XmlService.parse(fileMap['xl/sharedStrings.xml']);
    var sis = sharedDoc.getRootElement().getChildren('si', mainNs);
    for (var s = 0; s < sis.length; s++) {
      shared.push(getNestedText(sis[s]));
    }
  }

  var workbookDoc = XmlService.parse(fileMap['xl/workbook.xml']);
  var sheetsNode = workbookDoc.getRootElement().getChild('sheets', mainNs);
  var sheetNodes = sheetsNode ? sheetsNode.getChildren('sheet', mainNs) : [];
  if (!sheetNodes.length) throw new Error('Không tìm thấy worksheet trong file .xlsx');

  var ridAttr = sheetNodes[0].getAttribute('id', relNs);
  var rid = ridAttr ? ridAttr.getValue() : null;
  if (!rid) throw new Error('Không tìm thấy relationship id của worksheet');

  var relsDoc = XmlService.parse(fileMap['xl/_rels/workbook.xml.rels']);
  var relNodes = relsDoc.getRootElement().getChildren('Relationship', pkgNs);
  var target = null;
  for (var r = 0; r < relNodes.length; r++) {
    if (relNodes[r].getAttribute('Id') && relNodes[r].getAttribute('Id').getValue() === rid) {
      target = relNodes[r].getAttribute('Target').getValue();
      break;
    }
  }
  if (!target) throw new Error('Không tìm thấy worksheet target trong workbook rels');
  if (target.indexOf('xl/') !== 0) target = 'xl/' + target.replace(/^\/+/, '');

  var sheetDoc = XmlService.parse(fileMap[target]);
  var sheetData = sheetDoc.getRootElement().getChild('sheetData', mainNs);
  var rowNodes = sheetData ? sheetData.getChildren('row', mainNs) : [];
  var rows = [];

  for (var iRow = 0; iRow < rowNodes.length; iRow++) {
    var rowNode = rowNodes[iRow];
    var rowNumAttr = rowNode.getAttribute('r');
    var rowNum = rowNumAttr ? parseInt(rowNumAttr.getValue(), 10) : (iRow + 1);
    var row = [];
    var cells = rowNode.getChildren('c', mainNs);

    for (var iCell = 0; iCell < cells.length; iCell++) {
      var cell = cells[iCell];
      var refAttr = cell.getAttribute('r');
      var ref = refAttr ? refAttr.getValue() : '';
      var colLetters = (ref.match(/[A-Z]+/) || ['A'])[0];
      var colIdx = colLettersToIndex(colLetters);
      var typeAttr = cell.getAttribute('t');
      var cellType = typeAttr ? typeAttr.getValue() : '';
      var value = '';

      if (cellType === 'inlineStr') {
        var inlineNode = cell.getChild('is', mainNs);
        value = inlineNode ? getNestedText(inlineNode) : '';
      } else {
        var valueNode = cell.getChild('v', mainNs);
        if (valueNode) {
          var raw = valueNode.getText();
          if (cellType === 's') value = shared[parseInt(raw, 10)] || '';
          else value = raw;
        }
      }

      row[colIdx] = value;
    }

    rows[rowNum - 1] = row;
  }

  return rows;
}

function parseBankDateToIso(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  var s = String(value || '').trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    var day = parseInt(m[1], 10);
    var month = parseInt(m[2], 10) - 1;
    var year = parseInt(m[3], 10);
    var hour = m[4] ? parseInt(m[4], 10) : 0;
    var minute = m[5] ? parseInt(m[5], 10) : 0;
    var second = m[6] ? parseInt(m[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second).toISOString();
  }
  var parsed = Date.parse(s);
  return isNaN(parsed) ? '' : new Date(parsed).toISOString();
}

function getFinanceLogsHeaders() {
  return ['Thời gian', 'Username', 'Loại', 'Danh mục', 'Mô tả', 'Số tiền (VND)', 'Bút toán'];
}

function normalizeFinanceHeader(value) {
  return String(value || '').toLowerCase().trim();
}

function ensureFinanceLogsHeaders(sheet) {
  var desiredHeaders = getFinanceLogsHeaders();
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.appendRow(desiredHeaders);
    return desiredHeaders.slice();
  }

  var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < desiredHeaders.length; i++) {
    if (currentHeaders.indexOf(desiredHeaders[i]) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(desiredHeaders[i]);
      currentHeaders.push(desiredHeaders[i]);
    }
  }
  return currentHeaders;
}

function findFinanceHeaderIndex(headers, aliases) {
  var aliasLookup = {};
  for (var i = 0; i < aliases.length; i++) {
    aliasLookup[normalizeFinanceHeader(aliases[i])] = true;
  }

  for (var j = 0; j < headers.length; j++) {
    if (aliasLookup[normalizeFinanceHeader(headers[j])]) return j;
  }

  return -1;
}

function normalizeButToan(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function createEmptyImportResult() {
  return {
    inserted: 0,
    duplicateButToan: 0,
    invalidRows: 0
  };
}

function formatImportResultMessage(title, result) {
  var lines = [title];
  lines.push('Đã import: ' + (result.inserted || 0) + ' giao dịch');
  lines.push('Trùng bút toán: ' + (result.duplicateButToan || 0) + ' giao dịch');
  if (result.invalidRows) {
    lines.push('Bỏ qua không hợp lệ: ' + result.invalidRows + ' giao dịch');
  }
  return lines.join('\n');
}

function buildButToanValue(row, source, amountValue) {
  if (row && row.butToan) {
    return String(row.butToan).trim();
  }

  var parts = [
    String(source || '').trim(),
    String(row && row.dateIso || '').trim(),
    String(row && row.type || '').trim(),
    isNaN(amountValue) ? '' : String(amountValue),
    String(row && row.description || '').replace(/\s+/g, ' ').trim()
  ];

  return parts.join('|').replace(/^\|+|\|+$/g, '');
}

function getExistingButToanMap(sheet, headers) {
  var result = {};
  var butToanIdx = findFinanceHeaderIndex(headers, ['Bút toán', 'But toan']);
  if (butToanIdx === -1) return result;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;

  var values = sheet.getRange(2, butToanIdx + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var key = normalizeButToan(values[i][0]);
    if (key) result[key] = true;
  }
  return result;
}

function backfillFinanceLogsButToan(sheet, headers) {
  var butToanIdx = findFinanceHeaderIndex(headers, ['Bút toán', 'But toan']);
  if (butToanIdx === -1) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var timeIdx = findFinanceHeaderIndex(headers, ['Thời gian', 'Thoi gian']);
  var userIdx = findFinanceHeaderIndex(headers, ['Username']);
  var typeIdx = findFinanceHeaderIndex(headers, ['Loại', 'Loai']);
  var descIdx = findFinanceHeaderIndex(headers, ['Mô tả', 'Mo ta', 'Mota']);
  var amtIdx = findFinanceHeaderIndex(headers, ['Số tiền (VND)', 'So tien (VND)', 'Số tiền', 'So tien']);
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var updates = [];
  var hasChanges = false;

  for (var i = 0; i < rows.length; i++) {
    var existing = String(rows[i][butToanIdx] || '').trim();
    var source = userIdx >= 0 ? String(rows[i][userIdx] || '').trim() : '';
    if (!isImportSourceUsername(source)) {
      updates.push([existing]);
      continue;
    }

    var generated = buildButToanValue({
      dateIso: timeIdx >= 0 ? parseBankDateToIso(rows[i][timeIdx]) : '',
      type: typeIdx >= 0 ? String(rows[i][typeIdx] || '').trim() : '',
      description: descIdx >= 0 ? String(rows[i][descIdx] || '').trim() : ''
    }, source, amtIdx >= 0 ? parseAmountString(rows[i][amtIdx]) : NaN);

    updates.push([existing || generated]);
    if (!existing && generated) hasChanges = true;
  }

  if (hasChanges) {
    sheet.getRange(2, butToanIdx + 1, updates.length, 1).setValues(updates);
  }
}

function isImportSourceUsername(username) {
  return /^(saoke-|import$|pdf-import$)/i.test(String(username || '').trim());
}

function findFirstAmountInColumns(row, startCol1Based, endCol1Based) {
  for (var c = startCol1Based - 1; c <= endCol1Based - 1 && c < row.length; c++) {
    var value = row[c];
    if (value === '' || value == null) continue;
    var parsed = parseAmountString(value);
    if (!isNaN(parsed) && parsed > 0) {
      return { raw: value, amount: parsed, column: c + 1 };
    }
  }
  return null;
}

function importTechStatementBlobToFinanceLogs(blob, filename) {
  try {
    var result = createEmptyImportResult();
    var data;
    try {
      data = readFirstWorksheetRowsFromXlsxBlob(blob);
    } catch (zipErr) {
      Logger.log('readFirstWorksheetRowsFromXlsxBlob fallback: ' + zipErr.toString());
      var ss = openSpreadsheetFromExcelBlob(blob, filename);
      data = ss.getSheets()[0].getDataRange().getValues();
    }

    if (!data || data.length < 35) return result;

    // Layout verified from sample `SaoKeTK_04042026_10042026.xlsx`
    // Row 33: headers, Row 34: opening balance, Row 35+: transactions.
    var rows = [];
    for (var r = 34; r < data.length; r++) {
      var row = data[r] || [];
      var dateRaw = row[1]; // C2: Ngày giao dịch
      var desc = String(row[24] || '').trim(); // C25: Diễn giải
      var butToan = String(row[33] || '').trim(); // AH: Số bút toán / Transaction No

      if (!dateRaw && !desc && !butToan) continue;

      var debitInfo = findFirstAmountInColumns(row, 47, 52);
      var creditInfo = findFirstAmountInColumns(row, 53, 58);
      var picked = debitInfo || creditInfo;
      if (!picked) continue;

      var dateIso = parseBankDateToIso(dateRaw);
      if (!dateIso) continue;

      rows.push({
        dateIso: dateIso,
        description: desc || 'Giao dịch sao kê Tech',
        amount: String(picked.raw),
        type: debitInfo ? 'Chi' : 'Thu',
        username: 'saoke-tech',
        butToan: buildButToanValue({
          butToan: butToan,
          dateIso: dateIso,
          type: debitInfo ? 'Chi' : 'Thu',
          description: desc || 'Giao dịch sao kê Tech'
        }, 'saoke-tech', picked.amount)
      });
    }

    Logger.log('importTechStatementBlobToFinanceLogs rows=' + rows.length + ' file=' + filename);
    return appendTransactionsToFinanceLogs(rows, 'saoke-tech');
  } catch (err) {
    Logger.log('importTechStatementBlobToFinanceLogs error: ' + err.toString());
    return createEmptyImportResult();
  }
}

function importXlsxBlobToFinanceLogs(blob, filename) {
  try {
    var result = createEmptyImportResult();
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
    var dateIdx = findFinanceHeaderIndex(header, ['date', 'ngày', 'ngày giao dịch', 'thời gian']);
    var typeIdx = findFinanceHeaderIndex(header, ['loại', 'type']);
    var butToanIdx = findFinanceHeaderIndex(header, ['bút toán', 'but toan', 'reference', 'ref', 'transaction id']);
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var desc = (descIdx >=0) ? data[i][descIdx] : data[i][0];
      var amt = (amtIdx >=0) ? data[i][amtIdx] : '';
      rows.push({
        description: desc,
        amount: String(amt),
        dateIso: dateIdx >= 0 ? parseBankDateToIso(data[i][dateIdx]) : '',
        type: typeIdx >= 0 ? String(data[i][typeIdx] || '').trim() : '',
        butToan: butToanIdx >= 0 ? String(data[i][butToanIdx] || '').trim() : ''
      });
    }
    return appendTransactionsToFinanceLogs(rows, 'import');
  } catch (err) {
    Logger.log('importXlsxBlobToFinanceLogs error: ' + err.toString());
    return createEmptyImportResult();
  }
}

function importPdfBlobToFinanceLogs(blob, filename) {
  try {
    var result = createEmptyImportResult();
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
      return result;
    }

    var txs = parseBankStatementText(text);
    return appendTransactionsToFinanceLogs(txs, 'pdf-import');
  } catch (err) {
    Logger.log('importPdfBlobToFinanceLogs error: ' + err.toString());
    return createEmptyImportResult();
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
      txs.push({
        description: desc || 'auto-import',
        amount: amtRaw,
        butToan: buildButToanValue({ description: desc || 'auto-import' }, 'pdf-import', parseAmountString(amtRaw))
      });
    }
  }
  return txs;
}

function appendTransactionsToFinanceLogs(rows, source) {
  try {
    var result = createEmptyImportResult();
    if (!rows || rows.length === 0) return result;
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('FinanceLogs');
    if (!sheet) {
      sheet = ss.insertSheet('FinanceLogs');
      sheet.appendRow(getFinanceLogsHeaders());
    }
    var headers = ensureFinanceLogsHeaders(sheet);
    backfillFinanceLogsButToan(sheet, headers);
    var existingButToanMap = getExistingButToanMap(sheet, headers);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var desc = rows[i].description || '';
      var amt = parseAmountString(rows[i].amount);
      if (isNaN(amt)) {
        result.invalidRows++;
        continue;
      }
      var cat = classifyDescription(desc);
      var explicitType = rows[i].type || 'Chi';
      var explicitDateIso = rows[i].dateIso || new Date().toISOString();
      var username = rows[i].username || source;
      var butToan = buildButToanValue({
        butToan: rows[i].butToan,
        dateIso: explicitDateIso,
        type: explicitType,
        description: desc
      }, source, amt);
      var butToanKey = normalizeButToan(butToan);
      if (butToanKey && existingButToanMap[butToanKey]) {
        result.duplicateButToan++;
        continue;
      }

      var outRow = [];
      for (var c = 0; c < headers.length; c++) {
        var h = headers[c];
        var hLower = String(h).toLowerCase();
        if (h === 'Thời gian') outRow.push(explicitDateIso);
        else if (h === 'Username') outRow.push(username);
        else if (hLower.indexOf('loại') !== -1 || hLower.indexOf('loai') !== -1) outRow.push(explicitType);
        else if (hLower.indexOf('danh mục') !== -1 || hLower.indexOf('danh muc') !== -1) outRow.push(cat);
        else if (hLower.indexOf('mô tả') !== -1 || hLower.indexOf('mo ta') !== -1 || hLower.indexOf('mota') !== -1) outRow.push(desc);
        else if (hLower.indexOf('số tiền') !== -1 || hLower.indexOf('so tien') !== -1 || hLower.indexOf('sotien') !== -1) outRow.push(amt);
        else if (hLower.indexOf('bút toán') !== -1 || hLower.indexOf('but toan') !== -1) outRow.push(butToan);
        else outRow.push('');
      }
      out.push(outRow);
      if (butToanKey) existingButToanMap[butToanKey] = true;
    }
    if (out.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
    }
    result.inserted = out.length;
    return result;
  } catch (err) {
    Logger.log('appendTransactionsToFinanceLogs error: ' + err.toString());
    return createEmptyImportResult();
  }
}

function createAnalysisSheet(range, focusType) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var dataSheet = ss.getSheetByName('FinanceLogs');
    if (!dataSheet) throw new Error("Sheet 'FinanceLogs' not found");
    var lastRow = dataSheet.getLastRow();
    if (lastRow < 2) throw new Error('No data to analyze');
    var lastCol = dataSheet.getLastColumn();
    var headers = dataSheet.getRange(1,1,1,lastCol).getValues()[0];

    // find indices (0-based for arrays, will use .getRange with 1-based)
    var timeIdx = -1, catIdx = -1, amtIdx = -1, typeIdx = -1;
    for (var i=0;i<headers.length;i++){
      var h = String(headers[i]).toLowerCase();
      if (h.indexOf('thời gian') !== -1 || h.indexOf('thoi gian') !== -1) timeIdx = i;
      if (h === 'danh mục' || h.indexOf('danh mục') !== -1 || h.indexOf('danh muc') !== -1) catIdx = i;
      if (h.indexOf('số tiền') !== -1 || h.indexOf('so tien') !== -1 || h.indexOf('sotien') !== -1) amtIdx = i;
      if (h.indexOf('loại') !== -1 || h.indexOf('loai') !== -1) typeIdx = i;
    }
    if (catIdx === -1) throw new Error("Header 'Danh mục' not found");
    if (amtIdx === -1) throw new Error("Header 'Số tiền (VND)' not found");

    var rows = dataSheet.getRange(2,1,lastRow-1,lastCol).getValues();
    var sumsChi = {};
    var sumsThu = {};
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

      var typeVal = '';
      if (typeIdx !== -1) {
        typeVal = String(row[typeIdx] || '').toLowerCase();
      }
      if (typeVal.indexOf('thu') !== -1) {
        sumsThu[cat] = (sumsThu[cat] || 0) + (amt || 0);
      } else {
        // default to Chi
        sumsChi[cat] = (sumsChi[cat] || 0) + (amt || 0);
      }
    }

    var analysis = ss.getSheetByName('Analysis');
    if (!analysis) analysis = ss.insertSheet('Analysis');
    // Clear existing values and remove any old charts so we don't accumulate duplicates
    analysis.clear();
    try {
      var oldCharts = analysis.getCharts();
      for (var ci = 0; ci < oldCharts.length; ci++) {
        analysis.removeChart(oldCharts[ci]);
      }
    } catch (e) { Logger.log('Failed to remove old charts: ' + e.toString()); }

    // Build Chi table (A:B) and Thu table (D:E)
    var outChi = [['Danh mục (Chi)','Tổng (Chi)']];
    for (var k in sumsChi) outChi.push([k, sumsChi[k]]);
    var outThu = [['Danh mục (Thu)','Tổng (Thu)']];
    for (var k2 in sumsThu) outThu.push([k2, sumsThu[k2]]);

    var onlyChi = (String(focusType || '').toLowerCase() === 'chi');
    var onlyThu = (String(focusType || '').toLowerCase() === 'thu');

    // If user asked for only one type, show only that type and its chart (placed at A:B).
    if (onlyChi) {
      if (outChi.length === 1) {
        analysis.getRange(1,1,1,1).setValue('Không có dữ liệu phù hợp với phạm vi đã chọn.');
        return true;
      }
      analysis.getRange(1,1,outChi.length,outChi[0].length).setValues(outChi);
      try { analysis.getRange(2,2,outChi.length-1,1).setNumberFormat('#,##0'); } catch(e){}
    } else if (onlyThu) {
      if (outThu.length === 1) {
        analysis.getRange(1,1,1,1).setValue('Không có dữ liệu phù hợp với phạm vi đã chọn.');
        return true;
      }
      // place Thu table at A:B when focusing only on Thu
      analysis.getRange(1,1,outThu.length,outThu[0].length).setValues(outThu);
      try { analysis.getRange(2,2,outThu.length-1,1).setNumberFormat('#,##0'); } catch(e){}
    } else {
      if (outChi.length === 1 && outThu.length === 1) {
        analysis.getRange(1,1,1,1).setValue('Không có dữ liệu phù hợp với phạm vi đã chọn.');
        return true;
      }
      if (outChi.length > 1) analysis.getRange(1,1,outChi.length,outChi[0].length).setValues(outChi);
      if (outThu.length > 1) analysis.getRange(1,4,outThu.length,outThu[0].length).setValues(outThu);
      try { if (outChi.length>1) analysis.getRange(2,2,outChi.length-1,1).setNumberFormat('#,##0'); } catch(e){}
      try { if (outThu.length>1) analysis.getRange(2,5,outThu.length-1,1).setNumberFormat('#,##0'); } catch(e){}
    }

    var noteText = 'Ghi chú: Báo cáo tổng hợp số tiền theo "Danh mục" lấy từ sheet "FinanceLogs". Thời gian tạo: ' + new Date().toLocaleString('vi-VN');
    if (range && range.from) {
      noteText += '\nPhạm vi: ' + range.from.toLocaleString('vi-VN') + (range.to ? (' → ' + range.to.toLocaleString('vi-VN')) : ' → hiện tại');
    }
    analysis.getRange(1,7).setValue(noteText);
    try { analysis.setColumnWidth(7, 420); } catch(e){}

    try {
      // Chi chart
      var chiCount = outChi.length - 1;
      if (chiCount > 0) {
        var chiRange = analysis.getRange(2,1,chiCount,2);
        var chartChi = analysis.newChart()
          .setChartType(Charts.ChartType.PIE)
          .addRange(chiRange)
          .setPosition(2,4,0,0)
          .setOption('title', 'Phân bố Chi theo danh mục')
          .setOption('pieSliceText', 'percentage')
          .setOption('legend', 'right')
          .build();
        analysis.insertChart(chartChi);
      }
      // Thu chart
      var thuCount = outThu.length - 1;
      if (thuCount > 0) {
        // If onlyThu was requested, the Thu table is placed at A:B; otherwise it's at D:E
        var thuRangeRow = 2;
        var thuRangeCol = (String(focusType || '').toLowerCase() === 'thu') ? 1 : 4;
        var thuRange = analysis.getRange(thuRangeRow, thuRangeCol, thuCount, 2);
        var chartThu = analysis.newChart()
          .setChartType(Charts.ChartType.PIE)
          .addRange(thuRange)
          .setPosition(2, thuRangeCol + 3, 0, 0)
          .setOption('title', 'Phân bố Thu theo danh mục')
          .setOption('pieSliceText', 'percentage')
          .setOption('legend', 'right')
          .build();
        analysis.insertChart(chartThu);
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
  "đầu tư": ["lợi nhuận","loi nhuan","sinh lời","sinh loi","quyền mua","quyen mua","nghia vu thanh toan ck","nghĩa vụ thanh toán ck","tra lai so du","trả lãi số dư"],
  "lương thưởng": ["lương","thưởng","salary","bonus","payroll","nhận","chuyển khoản"],
  "ăn uống": ["nhà hàng","ăn uống","ăn tối","ăn trưa","ăn sáng","ăn","cơm","quán","cafe","cà phê","trà sữa","phở","bún","ăn vặt","ăn nhẹ","siêu thị","grocery","chợ"],
  "xăng xe": ["gửi xe","xăng","đổ xăng","bơm xăng","nhien lieu","nhiên liệu","petrol","diesel","gas","xăng xe","đổ","rút xăng","thuê xe","xe ôm","grab","taxi","xe máy","xe tải"],
  "nhà cửa": ["nhà","thuê","tiền nhà","điện","nước","internet","phòng","điện nước","wifi","tiền điện","tiền nước","tiền internet","tien phong"],
  "được cho": ["được"],
  "thư giãn": ["du lịch","du lich","tham quan","vui chơi","khách sạn","khach san","resort","spa","công viên","cong vien","tour","bảo tàng","bao tang"],
  "quan hệ": ["mừng","mung","đám","hiếu","hỉ","gửi","mừng cưới","mung cuoi","đám cưới","đám hỏi","đám tang","biếu","bieu","tặng","tang","cho","ủng hộ","ung ho","ủng","ung"]
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
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
      var whole = parseInt(s.replace(/[.,]/g, ''), 10);
      return isNaN(whole) ? NaN : whole;
    }
    var normalized = s;
    if ((s.match(/[.,]/g) || []).length > 1) {
      normalized = s.replace(/[.,]/g, '');
      var whole2 = parseInt(normalized, 10);
      return isNaN(whole2) ? NaN : whole2;
    }
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

  // Ưu tiên các cụm tiền phòng/thuê phòng để tránh bắt nhầm từ "tang" trong địa chỉ tầng.
  if (/\b(ti[eề]n\s+ph[oò]ng|thu[eê]\s+ph[oò]ng|ph[oò]ng\s+tr[oọ])\b/.test(s)) return 'nhà cửa';

  // Prioritize explicit relationship keywords (whole-word match).
  // Include both accented and unaccented variants to improve matching from different sources.
  var rel = s.match(/\b(mừng|mung|biếu|bieu|tặng|tang|cho|ủng\s*hộ|ung\s*ho|ủng|ung)\b/);
  if (rel) return 'quan hệ';

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

    // We'll try multiple parsing strategies. Keep track of how the time was parsed.
    var parsedType = null; // 'relative' | 'absolute' | 'timeOnly' | 'timeWithDay'
    var m;
    var now = new Date();

    // 1) Vietnamese relative: require explicit suffix ("nữa" or "sau") to be treated as a relative offset
    // examples: "20m nữa ...", "20 phút nữa ...", "2h nữa ...", "20m sau ..."
    m = rest.match(/^([0-9]+)\s*(m|phút|phut|phút|h|giờ|gio)\s+(nữa|sau)\s+([\s\S]+)$/i);
    if (m) {
      var valRel = parseInt(m[1], 10);
      var unitRel = (m[2] || '').toLowerCase();
      messageText = (m[4] || '').trim();
      whenDate = new Date();
      if (unitRel.indexOf('h') === 0 || unitRel.indexOf('gi') === 0) {
        whenDate.setHours(whenDate.getHours() + valRel);
      } else {
        whenDate.setMinutes(whenDate.getMinutes() + valRel);
      }
      parsedType = 'relative';
    }

    // 1b) English style relative: "in 10m message"
    if (!whenDate) {
      m = rest.match(/^in\s+([0-9]+)(m|h)\s+([\s\S]+)$/i);
      if (m) {
        var val2 = parseInt(m[1], 10);
        var unit2 = m[2].toLowerCase();
        whenDate = new Date();
        if (unit2 === 'm') whenDate.setMinutes(whenDate.getMinutes() + val2);
        else whenDate.setHours(whenDate.getHours() + val2);
        messageText = (m[3] || '').trim();
        parsedType = 'relative';
      }
    }

    // 2) Absolute datetime: YYYY-MM-DD HH:MM or YYYY-MM-DDTHH:MM
    if (!whenDate) {
      m = rest.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2})\s+([\s\S]+)$/);
      if (m) {
        whenDate = parseIsoLikeDate(m[1]);
        messageText = (m[2] || '').trim();
        parsedType = 'absolute';
      }
    }

    // 3) Time-only / Vietnamese short form: accept "8h", "8:30", "13h20" (with or without colon), optionally with 'sáng/chiều' and optional 'ngày mai'
    // This will correctly match "20h ăn tối" as 20:00 today (or next day if already passed).
    if (!whenDate) {
      m = rest.match(/^([0-9]{1,2})(?::([0-9]{2})|h([0-9]{1,2})?)?\s*(sáng|chiều|tối|sang|chieu|toi)?\s*(ngày mai|mai)?\s+([\s\S]+)$/i);
      if (m) {
        var hour = parseInt(m[1], 10);
        var minute = 0;
        if (m[2]) minute = parseInt(m[2], 10);
        else if (typeof m[3] !== 'undefined' && m[3] !== '') minute = parseInt(m[3], 10);
        var period = (m[4] || '').toLowerCase();
        var dayToken = (m[5] || '').toLowerCase();
        messageText = (m[6] || '').trim();

        var base = new Date();
        if (dayToken === 'ngày mai' || dayToken === 'mai') {
          base.setDate(base.getDate() + 1);
          parsedType = 'timeWithDay';
        } else {
          parsedType = 'timeOnly';
        }
        if (period === 'chiều' || period === 'chieu' || period === 'tối' || period === 'toi') {
          if (hour < 12) hour += 12;
        }
        if ((period === 'sáng' || period === 'sang') && hour === 12) hour = 0;
        whenDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0);
      }
    }

    // 4) Fallback: HH:MM message (explicit 2-digit hour:minute)
    if (!whenDate) {
      m = rest.match(/^([0-9]{2}:[0-9]{2})\s+([\s\S]+)$/);
      if (m) {
        whenDate = parseTimeToday(m[1]);
        messageText = (m[2] || '').trim();
        parsedType = 'timeOnly';
      }
    }


    if (!whenDate || isNaN(whenDate.getTime())) {
      sendMessage(chatId, '❌ Không nhận dạng được thời gian. Dùng: /nhacnho YYYY-MM-DD HH:MM lời_nhắc\nHoặc: /nhacnho 15:30 Gọi điện\nHoặc: /nhacnho 20m nữa Gọi điện\nHoặc: /nhacnho in 10m Xong việc');
      return;
    }

    // If parsed time is in the past, handle according to parsedType:
    // - 'timeOnly': roll to next day
    // - 'relative': should normally be future, but if not, add 1 minute
    // - 'absolute' or 'timeWithDay': treat as error
    if (whenDate.getTime() <= now.getTime()) {
      if (parsedType === 'timeOnly') {
        whenDate.setDate(whenDate.getDate() + 1);
      } else if (parsedType === 'relative') {
        whenDate = new Date(now.getTime() + 60 * 1000); // schedule 1 minute later as a recovery
      } else {
        sendMessage(chatId, '❌ Thời gian đã qua. Vui lòng đặt thời gian trong tương lai.');
        return;
      }
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
