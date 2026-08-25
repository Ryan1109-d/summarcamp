/**
 * 清華大學羽球冬令營 2027 — Google Apps Script 後端
 * （與足球營、台大羽球營完全分開：請用新的 Google Sheet + 新的 Apps Script 部署）
 *
 * 部署步驟：
 * 1. Google Sheet 第一列欄位標題（共 28 欄，與下方 appendRow 順序一致）：
 *    報名時間 | 梯次 | 時段 | 學員姓名 | 性別 | 年齡 | 年級 | 聯絡電話 | 收信信箱 |
 *    緊急聯絡人 | 緊急聯絡人電話 | 繳款人姓名 | 繳款人電話 | 繳款人信箱 | 與學員關係 |
 *    優惠資格 | 班別偏好 | 午餐 | 狀態 | 團報成員 | 備註 | 照片同意 |
 *    健康狀況 | 健康說明 | 緊急醫療授權 | 法定代理人聲明 | 繳費通知 | 系統訊息
 * 2. Sheet 上方選 擴充功能 → Apps Script，貼上本檔案全部內容
 * 3. 修改下方 CONFIG 的 SHEET_ID（網址中 /d/ 和 /edit 之間那串）
 * 4. 部署 → 新增部署作業 → 類型選「網頁應用程式」
 *    - 執行身分：我
 *    - 誰可以存取：所有人
 * 5. 複製 Web App URL，貼到 signup.html 與 index.html 的 GAS_URL
 * 6. 執行一次 checkSetup() 確認全綠，再執行 installDailyBackupTrigger()
 *
 * ⚠️ 本營隊「無早鳥、無推薦人、無紀念衫」，定價沿用 2026 夏令營。
 *    不要從台大羽球站直接複製 CONFIG 過來，那邊有早鳥與推薦人邏輯。
 *
 * 狀態欄位邏輯（與其他兩站不同，請詳讀）：
 * - 名額以「時段」為單位計算，每個時段上限 CONFIG.CAPACITY 人。
 * - 全天班同時佔用上午與下午兩個時段的名額。
 * - 因此上午佔用數 = 上午班 + 全天班；下午佔用數 = 下午班 + 全天班。
 * - 報名時段還有空位 → 狀態「正取」，寄報名確認信
 * - 報名時段已額滿   → 狀態「候補」，寄候補通知信
 *   （報全天班時，只要上午或下午其中一邊滿了就是候補）
 */
const CONFIG = {
  SHEET_ID: 'YOUR_SHEET_ID_HERE',       // TODO: 換成實際 Sheet ID（只在 Apps Script 填，不要 commit）
  SHEET_NAME: '報名名單',                 // 分頁名稱
  CAPACITY: 50,                          // 每個時段的正取上限（不是三時段合計）
  MIN_OPEN: 15,                          // 開班門檻：該時段佔用數達此值才確定開班
  CAMP_NAME: '清華大學羽球冬令營 2027',
  CAMP_DATE: '2027/1/25（一）– 1/29（五）',
  SESSION_NAME: '2027冬令營 1/25–1/29',   // 單梯，寫進 Sheet 的「梯次」欄
  VENUE: '清華大學南大校區 學生活動中心 1F',
  REPLY_EMAIL: 'stayyoung985@gmail.com',
  // 報名關閉時間。網站文案寫「報名截止 2027/1/10」，但系統實際擋到開課前一天，
  // 留一段人工彈性給晚報名的家長（與台大羽球站行為一致）。
  // 要改成硬性 1/10 截止，把這個值換成 '2027-01-10T23:59:59+08:00' 即可。
  REG_CLOSE: '2027-01-24T23:59:59+08:00',
  // 定價：沿用 2026 夏令營，本營隊「沒有」早鳥與推薦人優惠。
  //   上午班／下午班　4000 →（優惠資格）3500
  //   全天班　　　　　7600 →（優惠資格）7000
  //   折扣幅度上下午與全天不同（500 / 600），所以直接列價格，不用 STEP。
  PRICE: { HALF: 4000, HALF_DISCOUNT: 3500, FULL: 7600, FULL_DISCOUNT: 7000 },
  LUNCH_FEE: 500,                        // 代訂午餐五天合計，僅全天班適用
  // 個資保留期限。報名表上寫「活動結束後六個月內刪除」，這個值就是那個承諾的到期日
  //（營期 1/29 結束 + 6 個月）。purgeOldData() 會拿它當刪除基準。
  DATA_PURGE_AFTER: '2027-07-29T00:00:00+08:00',
  // 全域流量上限：每分鐘最多幾筆報名。正常招生不可能超過，超過幾乎必然是腳本灌資料。
  MAX_SUBMITS_PER_MINUTE: 12,
  // 家長 LINE 社群邀請連結。⚠️ 真值只填在 Apps Script，不要 commit 進 public repo
  //    （這是可公開加入的邀請網址，落在公開 repo 等於任何人都能加進家長群）。
  //    維持佔位字串時，確認信會自動略過整段 LINE 說明，不會寄出壞掉的連結。
  LINE_GROUP_URL: 'YOUR_LINE_GROUP_URL_HERE',
  // ⚠️ 本營隊的繳費「由學校端寄送與收款」，不使用本系統的繳費通知功能。
  //    ACCOUNT_NAME 刻意維持「（測試）」開頭，讓 paymentIsPlaceholder() 一直成立，
  //    sendPaymentNotice() 會直接中止，避免誤觸把個人帳戶寄給家長。
  //    checkSetup() 對本站回報「收款資訊仍是測試值」是正確結果，不要「修好」它。
  //    若之後改為自行收款，才把戶名換成真實姓名。
  PAYMENT: {
    BANK: '國泰世華銀行 013',
    ACCOUNT_NAME: '（測試）清大羽球營繳費由學校辦理，本系統不寄繳費通知',
    ACCOUNT_NO: '699522993691',
    DEADLINE_DAYS: 7
  }
};

// 欄位索引（0-based，對應 Sheet 欄位順序）
const COL = {
  TIME: 0, SESSION: 1, SLOT: 2, STUDENT: 3, GENDER: 4, AGE: 5, GRADE: 6,
  PHONE: 7, EMAIL: 8, EMG_NAME: 9, EMG_PHONE: 10,
  PAYER_NAME: 11, PAYER_PHONE: 12, PAYER_EMAIL: 13, PAYER_RELATION: 14,
  DISCOUNT: 15, CLASS_PREF: 16, LUNCH: 17, STATUS: 18, GROUP: 19,
  NOTES: 20, PHOTO: 21,
  HEALTH: 22, HEALTH_DETAIL: 23, MEDICAL: 24, GUARDIAN: 25
};
const NOTICE_COL = 27;   // 繳費通知（1-based）
const SYSMSG_COL = 28;   // 系統訊息（1-based）

// 標題列應有的 28 欄，順序即寫入順序。checkSetup() 會拿它逐欄比對。
const EXPECTED_HEADERS = [
  '報名時間','梯次','時段','學員姓名','性別','年齡','年級','聯絡電話','收信信箱',
  '緊急聯絡人','緊急聯絡人電話','繳款人姓名','繳款人電話','繳款人信箱','與學員關係',
  '優惠資格','班別偏好','午餐','狀態','團報成員','備註','照片同意',
  '健康狀況','健康說明','緊急醫療授權','法定代理人聲明','繳費通知','系統訊息'
];

// ⚠️ 以下字串必須與 signup.html 的 <input name="slot"> / <select id="discount">
//    option value 逐字一致，改前端選項時要同步改這裡，否則合法報名會被擋。
const SLOT_AM   = '上午班（09:00–12:00）';
const SLOT_PM   = '下午班（14:00–17:00）';
const SLOT_FULL = '全天班（09:00–17:00）';
const VALID_SLOTS = [SLOT_AM, SLOT_PM, SLOT_FULL];

const VALID_DISCOUNTS = [
  '一般報名',
  '團報（5 人以上）',
  '清大在校學生',
  '清大教職員工',
  '特約企業員工（聯電）',
  '特約企業員工（台積電）',
  '特約企業員工（工研院）'
];

/** 有優惠資格（非「一般報名」即為有） */
function hasDiscount_(d) {
  const s = String(d || '').trim();
  return s !== '' && s !== '一般報名' && VALID_DISCOUNTS.indexOf(s) >= 0;
}

/**
 * 取得報名分頁。找不到時丟出「講得出原因」的錯誤，
 * 而不是讓後續程式碰到 null 之後噴 Cannot read properties of null。
 */
function getSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    const names = ss.getSheets().map(s => '「' + s.getName() + '」').join('、');
    throw new Error('找不到分頁「' + CONFIG.SHEET_NAME + '」。這個試算表現有的分頁是：' + names +
                    '。請把報名分頁改名為「' + CONFIG.SHEET_NAME + '」（前後不能有空白），' +
                    '或改掉 CONFIG.SHEET_NAME。');
  }
  return sheet;
}

/**
 * 計算各時段目前的「正取」佔用數。
 *
 * 全天班的人同時佔用上午與下午，所以：
 *   上午佔用 = 上午班人數 + 全天班人數
 *   下午佔用 = 下午班人數 + 全天班人數
 *
 * 回傳的 am / pm / full 是「各時段各自報了幾個人」，
 * amOcc / pmOcc 才是拿來判斷額滿與開班的佔用數。
 */
function countSlots_(rows) {
  let am = 0, pm = 0, full = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.STATUS]).trim() !== '正取') continue;
    const slot = String(rows[i][COL.SLOT]).trim();
    if (slot === SLOT_AM) am++;
    else if (slot === SLOT_PM) pm++;
    else if (slot === SLOT_FULL) full++;
  }
  return { am: am, pm: pm, full: full, amOcc: am + full, pmOcc: pm + full };
}

/** 報這個時段會不會變成候補 */
function isWaitlisted_(slot, c) {
  if (slot === SLOT_AM)   return c.amOcc >= CONFIG.CAPACITY;
  if (slot === SLOT_PM)   return c.pmOcc >= CONFIG.CAPACITY;
  // 全天班要兩邊都有位子才排得進去
  return c.amOcc >= CONFIG.CAPACITY || c.pmOcc >= CONFIG.CAPACITY;
}

/** 這筆報名在該時段是第幾位（通知信用，讓自己一眼看出擠不擠） */
function seqInSlot_(slot, c) {
  if (slot === SLOT_AM)   return c.amOcc + 1;
  if (slot === SLOT_PM)   return c.pmOcc + 1;
  return Math.max(c.amOcc, c.pmOcc) + 1;
}

/**
 * 設定自我檢查。部署完、改完 Sheet 之後手動執行這個，
 * 比送一筆測試報名安全（不會寫資料、不會寄信）。
 */
function checkSetup() {
  const out = [];
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    out.push('✅ SHEET_ID 可開啟：' + ss.getName());
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      out.push('❌ 找不到分頁「' + CONFIG.SHEET_NAME + '」');
      out.push('   現有分頁：' + ss.getSheets().map(s => s.getName()).join('、'));
    } else {
      out.push('✅ 分頁「' + CONFIG.SHEET_NAME + '」存在');
      const lastCol = sheet.getLastColumn();
      const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      out.push((headers.length === EXPECTED_HEADERS.length ? '✅' : '❌') +
               ' 標題列欄數 ' + headers.length + '（應為 ' + EXPECTED_HEADERS.length + '）');
      EXPECTED_HEADERS.forEach(function (h, i) {
        const actual = String(headers[i] == null ? '' : headers[i]).trim();
        if (actual !== h) {
          out.push('   ⚠️ 第 ' + (i + 1) + ' 欄應為「' + h + '」，實際是「' + (actual || '(空白)') + '」');
        }
      });
      const n = Math.max(0, sheet.getLastRow() - 1);
      out.push('   目前資料筆數：' + n);
      if (n > 0) {
        const c = countSlots_(sheet.getDataRange().getValues());
        out.push('   正取佔用｜上午 ' + c.amOcc + '／' + CONFIG.CAPACITY +
                 '　下午 ' + c.pmOcc + '／' + CONFIG.CAPACITY +
                 '　（上午班 ' + c.am + '、下午班 ' + c.pm + '、全天班 ' + c.full + '）');
      }
    }
  } catch (e) {
    out.push('❌ ' + e.message);
  }
  // 本站繳費由學校辦理，這行回報「仍是測試值」是預期結果，不是待修的問題。
  out.push(paymentIsPlaceholder()
    ? '✅ 收款防呆生效中（本營隊繳費由學校辦理，系統不會寄繳費通知）'
    : '⚠️ 收款資訊已被改成真實值 —— 本營隊不該自行收款，請確認是否誤改');
  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * 確認信裡的 LINE 家長社群段落。
 * LINE_GROUP_URL 還是佔位字串時回傳空字串，整段不會出現在信裡，
 * 避免家長收到「請點選以下連結：YOUR_LINE_GROUP_URL_HERE」。
 */
function lineSection() {
  const url = String(CONFIG.LINE_GROUP_URL || '').trim();
  if (!url || url.indexOf('http') !== 0) return '';
  return '\n\n── 加入家長社群 ──\n' +
         '請加入本營隊的 LINE 家長社群，開班通知、繳費提醒與每日花絮都會在這裡發布：\n' +
         url + '\n' +
         '※ 此連結僅提供給已報名的家長，請勿轉發給無關人士。' + '\n';
}

/**
 * 新報名通知（寄給 Stay Young 自己，不是家長）。
 * 主旨開頭固定帶【清大羽球】，三個營隊的通知在收件匣裡不會混淆。
 * 這封信寄失敗絕不能影響報名結果，呼叫端一律包在 try/catch 內。
 */
function notifyOwner_(data, clean, status, seq, c) {
  const subject = '【清大羽球】新報名　' + status + ' 第 ' + seq + ' 位　' +
                  safeText(clean.studentName, 20);
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SHEET_ID + '/edit';
  const dash = function (v) { var s = safeText(v, 40); return s ? s : '—'; };
  // 三個營隊刻意共用同一組欄位與順序，收件匣裡的信長得一樣；
  // 該營隊沒有的欄位一律填「—」，不要整行省略，否則行數會對不齊。
  const body =
    CONFIG.CAMP_NAME + '\n' +
    '─────────────────\n' +
    '狀態：' + status + '（該時段第 ' + seq + ' 位，每時段上限 ' + CONFIG.CAPACITY +
      '｜上午 ' + c.amOcc + '、下午 ' + c.pmOcc + '）\n' +
    '梯次：' + dash(data.session) + '\n' +
    '時段：' + dash(data.slot) + '\n' +
    '─────────────────\n' +
    '學員：' + safeText(clean.studentName, 20) +
      '（' + dash(clean.gender) + '，' + dash(clean.age) + ' 歲）\n' +
    '年級：' + dash(clean.grade) + '\n' +
    '衣服尺寸：—\n' +
    '健康狀況：' + dash(clean.health) +
      (String(clean.health).trim() === '有特殊狀況'
        ? '　⚠️ ' + safeText(clean.healthDetail, 200) : '') + '\n' +
    '─────────────────\n' +
    '收信信箱：' + safeText(clean.email, 254) + '\n' +
    '聯絡電話：' + dash(clean.phone) + '\n' +
    '緊急聯絡人：' + dash(clean.emgName) + '（' + dash(clean.emgPhone) + '）\n' +
    '繳款人：' + dash(clean.payerName) + '（' + dash(clean.payerPhone) + '）\n' +
    '─────────────────\n' +
    '優惠資格：' + dash(clean.discount) + '\n' +
    '推薦人：—\n' +
    '午餐：' + dash(clean.lunch) + '\n' +
    '班別偏好：' + dash(clean.classPref) + '\n' +
    '團報成員：' + dash(clean.groupMembers) + '\n' +
    '備註：' + dash(clean.notes) + '\n' +
    '─────────────────\n' +
    '報名名單：' + sheetUrl;
  MailApp.sendEmail({
    to: CONFIG.REPLY_EMAIL,
    subject: subject,
    body: body,
    name: 'Stay Young 報名系統'
  });
}

/** 給 Sheet 儲存格用：前置單引號讓 Sheets 視為純文字，防公式注入 */
function safeCell(v, maxLen) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

/** 給 email 內文用：拿掉換行與控制字元，限長，防信件標頭注入 */
function safeText(v, maxLen) {
  var s = String(v == null ? '' : v).replace(/[\r\n\u0000-\u001F\u007F]+/g, " ").trim();
  return (maxLen && s.length > maxLen) ? s.slice(0, maxLen) : s;
}

/** 統一 JSON 回應 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse({ status: 'error', message: '系統忙碌中，請稍後再送出一次' });
  }
  const t0 = Date.now();
  try {
    const data = JSON.parse(e.postData.contents);

    // ── 進度查詢（唯讀，只回各時段人數，不含任何個資）──
    // 用 POST 而不是 GET，是為了避開瀏覽器對 script.google.com 的跨網域轉址問題。
    if (data.action === 'progress') {
      const c = countSlots_(getSheet_().getDataRange().getValues());
      return jsonResponse({
        status: 'ok',
        capacity: CONFIG.CAPACITY,
        minOpen: CONFIG.MIN_OPEN,
        am: c.am, pm: c.pm, full: c.full, amOcc: c.amOcc, pmOcc: c.pmOcc
      });
    }

    // ── 防濫用 1：honeypot（欄名須與 signup.html 的 .hp-field 一致）──
    if (data.contact_pref_2 && String(data.contact_pref_2).trim() !== '') {
      return jsonResponse({ status: 'ok', waitlist: false });
    }
    const cache = CacheService.getScriptCache();

    // ── 防濫用 2：全域流量上限 ──
    // Web App 必須開放「所有人」才能收報名，網址又寫在公開的前端裡，
    // 等於任何人都能對這個端點灌資料。這裡擋的是「有人寫腳本狂送」，
    // 讓 Sheet 不會在幾秒內被塞進幾千筆假資料、把真報名淹掉。
    const minuteKey = 'g_' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMddHHmm');
    const inThisMinute = Number(cache.get(minuteKey) || 0);
    if (inThisMinute >= CONFIG.MAX_SUBMITS_PER_MINUTE) {
      Logger.log('全域流量上限觸發：本分鐘已達 ' + inThisMinute + ' 筆');
      return jsonResponse({ status: 'error',
        message: '系統忙碌中，請稍候一分鐘再送出一次。若持續失敗，請直接來信 ' + CONFIG.REPLY_EMAIL });
    }

    // ── 防濫用 3：重複送出保護 ──
    const rateKey = 'rl_' + [
      String(data.email || '').toLowerCase().trim(),
      String(data.studentName || '').trim(),
      String(data.slot || '').trim()
    ].join('|');
    if (cache.get(rateKey)) {
      return jsonResponse({ status: 'error',
        message: '這筆報名剛剛已經送出成功了，請稍候幾分鐘再試，或直接來信確認報名狀態。' });
    }

    // ---- 基本驗證 ----
    const required = ['slot', 'studentName', 'gender', 'age', 'phone', 'email',
                      'emgName', 'emgPhone', 'payerName', 'payerPhone', 'payerEmail',
                      'discount', 'lunch', 'healthStatus', 'photoConsent'];
    for (const key of required) {
      if (!data[key] || String(data[key]).trim() === '') {
        return jsonResponse({ status: 'error', message: '缺少必填欄位：' + key });
      }
    }
    if (String(data.healthStatus).trim() === '有特殊狀況' &&
        (!data.healthDetail || String(data.healthDetail).trim() === '')) {
      return jsonResponse({ status: 'error', message: '請填寫健康狀況說明' });
    }
    if (!data.medicalConsent) {
      return jsonResponse({ status: 'error', message: '請勾選緊急醫療授權' });
    }
    if (!data.guardianConsent) {
      return jsonResponse({ status: 'error', message: '請勾選法定代理人聲明' });
    }

    // ---- 信箱格式驗證 ----
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (!EMAIL_RE.test(String(data.email).trim())) {
      return jsonResponse({ status: 'error', message: '信箱格式有誤，請確認後再送出' });
    }
    if (!EMAIL_RE.test(String(data.payerEmail).trim())) {
      return jsonResponse({ status: 'error', message: '繳款人信箱格式有誤，請確認後再送出' });
    }

    // ---- 時段與優惠資格白名單驗證 ----
    if (VALID_SLOTS.indexOf(String(data.slot).trim()) < 0) {
      return jsonResponse({ status: 'error', message: '報名時段資料有誤，請重新選擇後送出' });
    }
    if (VALID_DISCOUNTS.indexOf(String(data.discount).trim()) < 0) {
      return jsonResponse({ status: 'error', message: '優惠資格資料有誤，請重新選擇後送出' });
    }

    // ---- 電話格式驗證 ----
    const PHONE_RE = /^0\d{1,3}-?\d{6,8}$/;
    if (!PHONE_RE.test(String(data.phone).trim())) {
      return jsonResponse({ status: 'error', message: '聯絡電話格式有誤，請確認後再送出' });
    }
    if (!PHONE_RE.test(String(data.emgPhone).trim())) {
      return jsonResponse({ status: 'error', message: '緊急聯絡人電話格式有誤，請確認後再送出' });
    }
    if (!PHONE_RE.test(String(data.payerPhone).trim())) {
      return jsonResponse({ status: 'error', message: '繳款人電話格式有誤，請確認後再送出' });
    }

    // ---- 團報驗證：選了團報就要列得出同行成員 ----
    if (String(data.discount).trim() === '團報（5 人以上）') {
      const gms = String(data.groupMembers || '')
        .split('\n').map(function (s) { return s.trim(); })
        .filter(function (s) { return s; });
      if (gms.length < 4) {
        return jsonResponse({ status: 'error',
          message: '團報需 5 人（含本人）以上，請至少填寫 4 位同行成員姓名。' });
      }
    }

    // ---- 淨化（比對與寫入都用這組值）----
    const clean = {
      slot:          safeCell(data.slot, 40),
      studentName:   safeCell(data.studentName, 20),
      gender:        safeCell(data.gender, 20),
      age:           safeCell(data.age, 20),
      grade:         safeCell(data.grade, 20) || '—',
      phone:         safeCell(data.phone, 15),
      email:         safeCell(data.email, 254),
      emgName:       safeCell(data.emgName, 20),
      emgPhone:      safeCell(data.emgPhone, 15),
      payerName:     safeCell(data.payerName, 20),
      payerPhone:    safeCell(data.payerPhone, 15),
      payerEmail:    safeCell(data.payerEmail, 254),
      payerRelation: safeCell(data.payerRelation, 20) || '—',
      discount:      safeCell(data.discount, 30),
      classPref:     safeCell(data.classPref, 20) || '待評估',
      lunch:         safeCell(data.lunch, 30),
      groupMembers:  safeCell(data.groupMembers, 200) || '—',
      notes:         safeCell(data.notes, 200) || '—',
      photoConsent:  safeCell(data.photoConsent, 10),
      health:        safeCell(data.healthStatus, 20),
      healthDetail:  safeCell(data.healthDetail, 200) || '—',
      medical:       data.medicalConsent ? '同意' : '',
      guardian:      data.guardianConsent ? '同意' : ''
    };

    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues();
    const tRead = Date.now();

    // ---- 重複報名檢查（用淨化後的值比對）----
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][COL.EMAIL]).trim() === clean.email &&
          String(rows[i][COL.STUDENT]).trim() === clean.studentName) {
        return jsonResponse({ status: 'error', message: '此學員已使用相同信箱報名過' });
      }
    }

    // ---- 報名關閉時間檢查 ----
    if (new Date() > new Date(CONFIG.REG_CLOSE)) {
      return jsonResponse({ status: 'error',
        message: '很抱歉，本梯次報名已截止。如有候補需求請直接來信 ' + CONFIG.REPLY_EMAIL });
    }

    // ---- 判斷正取或候補（以時段為單位，全天班佔用上午＋下午）----
    const counts = countSlots_(rows);
    const isWaitlist = isWaitlisted_(clean.slot, counts);
    const status = isWaitlist ? '候補' : '正取';
    const seq = seqInSlot_(clean.slot, counts);

    // ---- 寫入 Sheet（共 28 欄）----
    sheet.appendRow([
      new Date(),
      CONFIG.SESSION_NAME, clean.slot, clean.studentName, clean.gender, clean.age, clean.grade,
      clean.phone, clean.email, clean.emgName, clean.emgPhone,
      clean.payerName, clean.payerPhone, clean.payerEmail, clean.payerRelation,
      clean.discount, clean.classPref, clean.lunch,
      status,
      clean.groupMembers, clean.notes, clean.photoConsent,
      clean.health, clean.healthDetail, clean.medical, clean.guardian,
      '', ''   // 繳費通知、系統訊息
    ]);
    const tWrite = Date.now();

    // ---- 寫入成功，此時才記錄冷卻與流量計數 ----
    cache.put(rateKey, '1', 600);
    cache.put(minuteKey, String(inThisMinute + 1), 120);

    // ---- 寄信：失敗不得讓家長看到「送出失敗」 ----
    try {
      if (isWaitlist) { sendWaitlistEmail(data); } else { sendConfirmEmail(data); }
    } catch (mailErr) {
      sheet.getRange(sheet.getLastRow(), SYSMSG_COL)
           .setValue('寄信失敗：' + safeCell(mailErr.message, 200));
    }
    const tParentMail = Date.now();

    // ---- 通知自己有新報名（失敗不影響報名，也不寫進系統訊息欄）----
    try {
      notifyOwner_(data, clean, status, seq, counts);
    } catch (notifyErr) {
      Logger.log('新報名通知寄送失敗：' + notifyErr);
    }

    // 效能量測：在 Apps Script 的「執行記錄」可看到每段耗時，用來判斷慢在哪
    Logger.log('doPost 耗時 ms｜讀 Sheet ' + (tRead - t0) +
               '、寫入 ' + (tWrite - tRead) +
               '、家長信 ' + (tParentMail - tWrite) +
               '、通知信 ' + (Date.now() - tParentMail) +
               '、總計 ' + (Date.now() - t0));

    return jsonResponse({ status: 'ok', waitlist: isWaitlist });
  } catch (err) {
    // 內部錯誤不原樣回給家長（可能含 Sheet 結構等資訊）；細節記進執行記錄供排查
    Logger.log('doPost 失敗：' + (err && err.stack ? err.stack : err));
    return jsonResponse({ status: 'error',
      message: '系統忙線或發生問題，請稍後再試一次，或直接來信 ' + CONFIG.REPLY_EMAIL + ' 由我們協助報名。' });
  } finally {
    lock.releaseLock();
  }
}

/** 報名確認信（正取） */
function sendConfirmEmail(data) {
  const subject = `【${CONFIG.CAMP_NAME}】報名確認信`;
  const body =
`您好：

已收到 ${safeText(data.studentName,20)} 的報名資料，報名登記完成！

── 報名資訊 ──
營隊：${CONFIG.CAMP_NAME}
日期：${CONFIG.CAMP_DATE}
地點：${CONFIG.VENUE}
時段：${safeText(data.slot,40)}
學員：${safeText(data.studentName,20)}（${safeText(data.gender,20)}，${safeText(data.age,20)} 歲）
緊急聯絡人：${safeText(data.emgName,20)}（${safeText(data.emgPhone,15)}）
優惠資格：${safeText(data.discount,30)}
午餐：${safeText(data.lunch,30)}${String(data.healthStatus).trim() === '有特殊狀況' ? '\n健康狀況：' + safeText(data.healthDetail,200) : ''}${data.notes && data.notes !== '—' ? '\n備註：' + safeText(data.notes,200) : ''}

── 接下來的流程 ──
1. 報名人數達開班標準並確認開班後，我們會通知您
2. 本營隊的繳費單與收款由清華大學校方統一辦理，屆時請依校方通知完成繳費
3. 開課前會再寄送行前通知信

開班確認前不會收取任何費用，請安心等候通知。
若有任何問題，歡迎直接回覆本信。${lineSection()}

Stay Young 清華大學羽球冬令營
${CONFIG.REPLY_EMAIL}`;
  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    body: body,
    replyTo: CONFIG.REPLY_EMAIL,
    name: 'Stay Young 清華大學羽球冬令營'
  });
}

/** 候補通知信（該時段額滿後） */
function sendWaitlistEmail(data) {
  const subject = `【${CONFIG.CAMP_NAME}】候補登記通知`;
  const body =
`您好：

感謝您為 ${safeText(data.studentName,20)} 報名 ${CONFIG.CAMP_NAME}（${safeText(data.slot,40)}）。

目前該時段正取名額已滿，您的報名已列入「候補名單」。
若有名額釋出，我們將立即以 email 通知您，屆時再依信中說明完成報名程序即可。
候補期間不會收取任何費用。

※ 其他時段可能仍有名額。若您的時間允許調整，歡迎回覆本信告知，
　 我們可協助改到還有空位的時段。

若有任何問題，歡迎直接回覆本信。

Stay Young 清華大學羽球冬令營
${CONFIG.REPLY_EMAIL}`;
  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    body: body,
    replyTo: CONFIG.REPLY_EMAIL,
    name: 'Stay Young 清華大學羽球冬令營'
  });
}

/**
 * doGet 保留給之後的後台（?admin）使用。
 * 進度查詢走 doPost 的 action:'progress'，不放在這裡。
 */
function doGet(e) {
  return jsonResponse({ status: 'ok', message: 'API alive' });
}

// ══════════════════════════════════════════
// 繳費通知信
//
// ⚠️ 本營隊繳費由清大校方辦理，以下功能實際上不會用到。
//    程式碼保留是為了與另外兩站一致；防呆讓它永遠不會誤寄。
// ══════════════════════════════════════════

/** 收款資訊是否還是測試值 */
function paymentIsPlaceholder() {
  const p = CONFIG.PAYMENT;
  return [p.BANK, p.ACCOUNT_NAME, p.ACCOUNT_NO]
    .some(v => String(v).indexOf('（測試）') === 0);
}

/**
 * 依時段、優惠資格、午餐計算應繳金額。
 * 本營隊沒有早鳥、沒有推薦人，所以只有兩層：原價 → 優惠價。
 */
function calcAmount(row) {
  const slot = String(row[COL.SLOT] || '').trim();
  const fullDay = slot === SLOT_FULL;
  const discounted = hasDiscount_(row[COL.DISCOUNT]);

  const listPrice = fullDay ? CONFIG.PRICE.FULL : CONFIG.PRICE.HALF;
  const base = fullDay
    ? (discounted ? CONFIG.PRICE.FULL_DISCOUNT : CONFIG.PRICE.FULL)
    : (discounted ? CONFIG.PRICE.HALF_DISCOUNT : CONFIG.PRICE.HALF);

  const breakdown = [];
  if (discounted) {
    breakdown.push('優惠資格（' + String(row[COL.DISCOUNT]).trim() + '）　−NT$ ' + (listPrice - base));
  }

  // 午餐代訂只有全天班適用
  const meal = (fullDay && String(row[COL.LUNCH] || '').indexOf('代訂') >= 0)
    ? CONFIG.LUNCH_FEE : 0;

  return { listPrice: listPrice, base: base, meal: meal, total: base + meal,
           slotLabel: fullDay ? '全天班' : '半天班', breakdown: breakdown,
           label: discounted ? '優惠價' : '原價' };
}

/** 組繳費通知信內容 */
function buildPaymentBody(studentName, session, slot, amt) {
  const p = CONFIG.PAYMENT;
  const due = new Date();
  due.setDate(due.getDate() + p.DEADLINE_DAYS);
  const dueStr = Utilities.formatDate(due, 'Asia/Taipei', 'yyyy/MM/dd');
  return `您好：

${CONFIG.CAMP_NAME} 已達開班標準，確定開班！
以下是 ${studentName} 的繳費資訊，敬請於期限內完成轉帳。

── 費用明細 ──
梯次：${session}
時段：${slot}（${amt.slotLabel}）
原價：NT$ ${amt.listPrice}
${amt.breakdown.length ? amt.breakdown.map(x => '　' + x).join('\n') + '\n' : ''}營隊費用：NT$ ${amt.base}${amt.meal ? '\n代訂午餐：NT$ ' + amt.meal + '（五天）' : ''}
應繳總額：NT$ ${amt.total}

── 轉帳資訊 ──
銀行：${p.BANK}
戶名：${p.ACCOUNT_NAME}
帳號：${p.ACCOUNT_NO}
繳費期限：${dueStr}（收到通知後 ${p.DEADLINE_DAYS} 天內）

── 完成轉帳後 ──
請直接回覆本信，告知「轉帳帳號末五碼」與「轉帳日期」，
我們核帳後會回覆確認，即完成報名程序。

如需延長繳費期限或有任何問題，請直接回覆本信與我們聯繫。

Stay Young 清華大學羽球冬令營
${CONFIG.REPLY_EMAIL}`;
}

/** 預覽：只寄一封範例信給自己，不讀 Sheet、不動任何資料 */
function previewPaymentNotice() {
  const amt = { listPrice: CONFIG.PRICE.FULL, base: CONFIG.PRICE.FULL_DISCOUNT,
                meal: CONFIG.LUNCH_FEE, total: CONFIG.PRICE.FULL_DISCOUNT + CONFIG.LUNCH_FEE,
                slotLabel: '全天班', breakdown: ['優惠資格（清大教職員工）　−NT$ 600'],
                label: '優惠價' };
  const body = buildPaymentBody('王小華（範例）', CONFIG.SESSION_NAME, SLOT_FULL, amt);
  MailApp.sendEmail({
    to: CONFIG.REPLY_EMAIL,
    subject: `【預覽】${CONFIG.CAMP_NAME} 繳費通知信`,
    body: (paymentIsPlaceholder()
            ? '⚠️ 本營隊繳費由清大校方辦理，收款防呆生效中，正式寄送會被擋下。\n\n───────────\n\n'
            : '⚠️ 收款防呆已被解除，正式寄送不會被擋 —— 本營隊不該自行收款，請確認。\n\n───────────\n\n') + body,
    replyTo: CONFIG.REPLY_EMAIL,
    name: 'Stay Young 清華大學羽球冬令營'
  });
  return '預覽信已寄至 ' + CONFIG.REPLY_EMAIL;
}

/** 正式寄送：挑出「正取」且尚未寄過繳費通知的人，寄信並回填時間 */
function sendPaymentNotice() {
  if (paymentIsPlaceholder()) {
    throw new Error('本營隊的繳費單由清華大學校方寄送與收款，本系統不寄繳費通知，已中止。' +
                    '若確實要改為自行收款，請先把 CONFIG.PAYMENT 換成真實資料。');
  }
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  let sent = 0, skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[COL.STATUS]).trim() !== '正取') { skipped++; continue; }
    if (String(r[NOTICE_COL - 1] || '').trim() !== '') { skipped++; continue; }
    const payerEmail = String(r[COL.PAYER_EMAIL] || '').trim();
    if (!payerEmail) { skipped++; continue; }
    const amt = calcAmount(r);
    const body = buildPaymentBody(r[COL.STUDENT], r[COL.SESSION], r[COL.SLOT], amt);
    const opts = {
      to: payerEmail,
      subject: `【${CONFIG.CAMP_NAME}】確定開班・繳費通知`,
      body: body,
      replyTo: CONFIG.REPLY_EMAIL,
      name: 'Stay Young 清華大學羽球冬令營'
    };
    const notifyEmail = String(r[COL.EMAIL] || '').trim();
    if (notifyEmail && notifyEmail !== payerEmail) opts.bcc = notifyEmail;
    MailApp.sendEmail(opts);
    sheet.getRange(i + 1, NOTICE_COL)
         .setValue(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm'));
    sent++;
  }
  return '已寄送 ' + sent + ' 封，略過 ' + skipped + ' 筆。';
}

// ══════════════════════════════════════════
// 每日自動備份
//
// 安裝方式（擇一）：
//   A. 【建議】在上方函式下拉選單選 installDailyBackupTrigger 按執行，一次就裝好。
//   B. 手動：左側「觸發條件」→ 新增 → dailyBackup／時間驅動／日計時器／23:00–00:00
// ══════════════════════════════════════════

/**
 * 一鍵安裝每日備份觸發條件（每天 23:00–00:00 之間跑一次 dailyBackup）。
 * 會先刪掉既有的 dailyBackup 觸發條件，重複執行不會裝出兩個。
 */
function installDailyBackupTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyBackup') { ScriptApp.deleteTrigger(t); removed++; }
  });
  ScriptApp.newTrigger('dailyBackup').timeBased().atHour(23).everyDays(1).create();
  var msg = '已安裝每日備份觸發條件（每天 23:00–00:00）' +
            (removed ? '，並清掉 ' + removed + ' 個舊的。' : '。');
  Logger.log(msg);
  return msg;
}

/** 檢查目前裝了哪些觸發條件（隨時可安全執行） */
function listTriggers() {
  var lines = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction() + '（' + t.getEventType() + '）';
  });
  var msg = lines.length ? '目前的觸發條件：\n' + lines.join('\n') : '目前沒有任何觸發條件。';
  Logger.log(msg);
  return msg;
}

/** 備份資料夾名稱。必須與另外兩站分開，否則各站的 slice(14) 會互刪對方的備份 */
const BACKUP_FOLDER_NAME = 'StayYoung 報名備份_清大羽球';

/** 取得備份資料夾；新建時直接設成私有 */
function getBackupFolder_() {
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  const folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  return folder;
}

function dailyBackup() {
  const folder = getBackupFolder_();
  const src = DriveApp.getFileById(CONFIG.SHEET_ID);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  const copy = src.makeCopy('【備份】清大羽球冬令營報名_' + stamp, folder);

  // ⚠️ 備份副本會繼承來源 Sheet 的共用設定。來源如果曾經開過「知道連結的人可查看」，
  //    副本就會跟著開，等於把整份報名個資多複製一份到外面看得到的地方。
  //    這裡每次都明確壓成私有，不倚賴繼承。
  copy.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  const files = folder.getFiles();
  const list = [];
  while (files.hasNext()) list.push(files.next());
  list.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  list.slice(14).forEach(f => f.setTrashed(true));
  return copy.getId();
}

// ══════════════════════════════════════════
// 個資保護：權限稽核與保留期限
//
// 這一區的函式都可以隨時手動執行。
// checkPrivacy() 唯讀，不動任何東西；
// lockDownSharing() 會改共用設定；
// purgeOldData() 會刪資料，預設是試算模式。
// ══════════════════════════════════════════

/** 把 Drive 的共用設定翻成看得懂的字，並判斷是否安全 */
function describeSharing_(file) {
  var access, perm;
  try {
    access = String(file.getSharingAccess());
    perm = String(file.getSharingPermission());
  } catch (e) {
    return { safe: false, text: '讀不到共用設定：' + e.message };
  }
  // PRIVATE 以外都代表「不用被邀請也可能看得到」，對報名個資來說一律視為不安全
  var safe = (access === 'PRIVATE');
  return { safe: safe, access: access, permission: perm, text: access + ' / ' + perm };
}

/**
 * 個資保護稽核。唯讀，不寫不刪不寄信，隨時可以跑。
 *
 * 檢查三件事：
 * 1. 報名 Sheet 有沒有被設成「知道連結的人可以看」
 * 2. 每日備份的副本有沒有跟著外流
 * 3. 除了你自己以外，還有誰有存取權
 */
function checkPrivacy() {
  const out = ['── 個資保護稽核 ──'];

  // 1. 報名 Sheet
  try {
    const sheetFile = DriveApp.getFileById(CONFIG.SHEET_ID);
    const s = describeSharing_(sheetFile);
    out.push((s.safe ? '✅' : '🔴') + ' 報名 Sheet 共用狀態：' + s.text);
    if (!s.safe) {
      out.push('   ⚠️ 任何拿到連結的人都可能看到全部報名個資。請執行 lockDownSharing() 收緊。');
    }
    const editors = sheetFile.getEditors().map(function (u) { return u.getEmail(); });
    const viewers = sheetFile.getViewers().map(function (u) { return u.getEmail(); });
    out.push('   個別授權：編輯者 ' + editors.length + ' 人' +
             (editors.length ? '（' + editors.join('、') + '）' : '') +
             '、檢視者 ' + viewers.length + ' 人' +
             (viewers.length ? '（' + viewers.join('、') + '）' : ''));
    out.push('   ※ 這些是被個別邀請的帳號，確認每一個都是現在還需要看資料的人。');
  } catch (e) {
    out.push('🔴 無法讀取報名 Sheet：' + e.message);
  }

  // 2. 備份資料夾與副本
  try {
    const it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
    if (!it.hasNext()) {
      out.push('⚠️ 找不到備份資料夾「' + BACKUP_FOLDER_NAME + '」——每日備份可能還沒跑過。');
    } else {
      const folder = it.next();
      const f = describeSharing_(folder);
      out.push((f.safe ? '✅' : '🔴') + ' 備份資料夾共用狀態：' + f.text);
      const files = folder.getFiles();
      let total = 0, bad = 0;
      const badNames = [];
      while (files.hasNext()) {
        const file = files.next();
        total++;
        const d = describeSharing_(file);
        if (!d.safe) { bad++; if (badNames.length < 5) badNames.push(file.getName()); }
      }
      out.push((bad === 0 ? '✅' : '🔴') + ' 備份副本 ' + total + ' 份，其中 ' + bad + ' 份是對外可見的' +
               (badNames.length ? '（例如：' + badNames.join('、') + '）' : ''));
      if (bad > 0) out.push('   ⚠️ 執行 lockDownSharing() 會把它們全部壓成私有。');
    }
  } catch (e) {
    out.push('🔴 無法檢查備份：' + e.message);
  }

  // 3. 保留期限
  try {
    const sheet = getSheet_();
    const n = Math.max(0, sheet.getLastRow() - 1);
    const purgeAt = new Date(CONFIG.DATA_PURGE_AFTER);
    const days = Math.ceil((purgeAt - new Date()) / 86400000);
    out.push('ℹ️ 目前保有 ' + n + ' 筆報名個資；依報名表的告知，應於 ' +
             Utilities.formatDate(purgeAt, 'Asia/Taipei', 'yyyy/MM/dd') + ' 前刪除（' +
             (days >= 0 ? '還有 ' + days + ' 天' : '已逾期 ' + (-days) + ' 天') + '）。');
    if (days < 0) out.push('   🔴 已超過告知的保留期限，請執行 purgeOldData(true) 刪除。');
  } catch (e) {
    out.push('⚠️ 無法統計筆數：' + e.message);
  }

  // 4. 提醒無法從程式端檢查的部分
  out.push('');
  out.push('以下無法用程式檢查，請自行確認：');
  out.push('  · Apps Script 部署的「誰可以存取」必須是「所有人」，報名才收得到。');
  out.push('    這是必要的，但它只開放「送出報名」，本後端沒有任何讀取個資的對外端點。');
  out.push('  · 招生狀況查詢（action:progress）只回各時段人數，不含任何個資。');

  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * 一鍵收緊共用設定：報名 Sheet、備份資料夾、所有備份副本一律改成「只有我」。
 *
 * 不會動「個別邀請」的編輯者／檢視者——那是你自己加的人，要移除請到 Sheet 上手動處理，
 * 程式亂踢人會把協作者一起踢掉。
 */
function lockDownSharing() {
  const done = [];
  try {
    DriveApp.getFileById(CONFIG.SHEET_ID)
            .setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    done.push('✅ 報名 Sheet 已設為私有');
  } catch (e) {
    done.push('🔴 報名 Sheet 設定失敗：' + e.message);
  }
  try {
    const it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
    if (!it.hasNext()) {
      done.push('⚠️ 沒有備份資料夾，略過');
    } else {
      const folder = it.next();
      folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      let n = 0;
      const files = folder.getFiles();
      while (files.hasNext()) {
        files.next().setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
        n++;
      }
      done.push('✅ 備份資料夾與 ' + n + ' 份副本已設為私有');
    }
  } catch (e) {
    done.push('🔴 備份設定失敗：' + e.message);
  }
  const msg = done.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * 依報名表的個資告知刪除報名資料（活動結束後六個月內）。
 *
 * ⚠️ 這是不可逆操作，所以預設只試算不刪：
 *      purgeOldData()      → 只告訴你會刪幾筆，不動資料
 *      purgeOldData(true)  → 真的刪
 *
 * 刪除範圍：報名 Sheet 的所有資料列（不含標題）＋ 備份資料夾內所有副本。
 * 只有在超過 CONFIG.DATA_PURGE_AFTER 之後才會真的執行，避免營期中誤觸。
 */
function purgeOldData(reallyDelete) {
  const purgeAt = new Date(CONFIG.DATA_PURGE_AFTER);
  const now = new Date();
  const sheet = getSheet_();
  const rows = Math.max(0, sheet.getLastRow() - 1);

  let backupCount = 0;
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : null;
  if (folder) {
    const files = folder.getFiles();
    while (files.hasNext()) { files.next(); backupCount++; }
  }

  const header = '保留期限：' + Utilities.formatDate(purgeAt, 'Asia/Taipei', 'yyyy/MM/dd') +
                 '\n報名資料 ' + rows + ' 筆、備份副本 ' + backupCount + ' 份';

  if (now < purgeAt) {
    const msg = header + '\n\n⛔ 尚未到期，不執行刪除。' +
                '\n（真的要提前刪除，請先改 CONFIG.DATA_PURGE_AFTER）';
    Logger.log(msg);
    return msg;
  }
  if (!reallyDelete) {
    const msg = header + '\n\n🔍 試算模式：上述資料「會」被刪除。' +
                '\n確認無誤後，執行 purgeOldData(true) 才會真的刪。';
    Logger.log(msg);
    return msg;
  }

  if (rows > 0) sheet.deleteRows(2, rows);
  if (folder) {
    const files = folder.getFiles();
    while (files.hasNext()) files.next().setTrashed(true);
  }
  const msg = header + '\n\n🗑 已刪除：報名資料 ' + rows + ' 筆、備份副本 ' + backupCount + ' 份。' +
              '\n（Drive 的檔案在垃圾桶內仍可救回，確定不需要請一併清空垃圾桶。）';
  Logger.log(msg);
  return msg;
}

// ══════════════════════════════════════════
// 取消開班通知（未達開班門檻時手動執行）
//
// 用法：sendCancelNotice('上午班（09:00–12:00）')
//       只通知該時段的報名者；不傳參數會擋下來，避免誤發給全部人。
// ══════════════════════════════════════════
function sendCancelNotice(slotName) {
  if (!slotName) {
    throw new Error('請傳入時段名稱，例如 sendCancelNotice("' + SLOT_AM + '")');
  }
  if (VALID_SLOTS.indexOf(String(slotName).trim()) < 0) {
    throw new Error('時段名稱不在白名單內。可用值：' + VALID_SLOTS.join('、'));
  }
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  let sent = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.SLOT]).trim() !== String(slotName).trim()) continue;
    if (String(rows[i][COL.STATUS]).trim() === '已取消通知') continue;
    MailApp.sendEmail({
      to: rows[i][COL.EMAIL],
      subject: '【' + CONFIG.CAMP_NAME + '】' + slotName + ' 未達開班人數通知',
      body:
'您好：\n\n' +
'感謝您為 ' + rows[i][COL.STUDENT] + ' 報名 ' + CONFIG.CAMP_NAME + '（' + slotName + '）。\n\n' +
'很遺憾，本時段報名人數未達開班標準（' + CONFIG.MIN_OPEN + ' 人），經評估後將不予開班，' +
'在此向您致上最深的歉意。\n\n' +
'由於本營隊採「確認開班後才收費」的方式，您並未被收取任何費用，無需辦理退費手續。\n\n' +
'若其他時段仍有名額，歡迎回覆本信告知，我們可協助您改到有開班的時段。\n' +
'若後續有加開梯次或其他營隊資訊，我們也會第一時間通知您。\n' +
'造成您的不便，我們深感抱歉。\n\n' +
'Stay Young 運動團隊\n' + CONFIG.REPLY_EMAIL,
      replyTo: CONFIG.REPLY_EMAIL,
      name: 'Stay Young 運動團隊'
    });
    sheet.getRange(i + 1, COL.STATUS + 1).setValue('已取消通知');
    sent++;
  }
  return sent + ' 封已寄出';
}
