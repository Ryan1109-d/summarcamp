/*** ============================================================
 * 清大羽球夏令營 2026 — Google Apps Script 後端（完整版）
 *
 * 內容：報名寫入 / 進度條 / 確認信 / 自動排序總表 / 每日備份
 *
 * 部署步驟：
 * 1. 開 Google Sheet →「擴充功能 → Apps Script」，貼上本檔案全部內容
 * 2. 改下方 SHEET_ID（網址中 /d/ 和 /edit 之間那串）
 * 3. 部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署
 *    （只按存檔不會更新線上的 Web App）
 *
 * ⚠️「報名資料」分頁第一列需為 28 欄。原本 23 欄，這版在最後新增 5 欄：
 *    健康狀況 | 健康說明 | 緊急醫療授權 | 法定代理人聲明 | 照片同意
 *
 *    第 18、19 欄（聯電員工編號／聯電員工姓名）保留不刪 —— 前端已移除這兩個欄位，
 *    新報名一律寫「—」，但歷史資料還在那兩欄裡，刪掉會遺失既有報名紀錄。
 * ============================================================ ***/

const SHEET_ID = 'YOUR_SHEET_ID_HERE';   // TODO: 換成實際 Sheet ID（只在 Apps Script 填，不要 commit）
const SHEET_NAME = '報名資料';
const SUMMARY_SHEET = '自動總表';        // 產出分頁（不存在會自動建立）
const REPLY_EMAIL = 'stayyoung985@gmail.com';
const LINE_GROUP_URL = 'https://line.me/ti/g/bVkHhe8Xzb';   // 家長群組邀請連結

/** 給 Sheet 儲存格用：前置單引號讓 Sheets 視為純文字，防公式注入 */
function safeCell(v, maxLen) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

/** 給 email 內文用：拿掉換行與控制字元，限長，防信件標頭注入 */
function safeText(v, maxLen) {
  var s = String(v == null ? '' : v).replace(/[\r\n\u0000-\u001F\u007F]+/g, ' ').trim();
  return (maxLen && s.length > maxLen) ? s.slice(0, maxLen) : s;
}

/** 統一 JSON 回應 */
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testEmail() {
  GmailApp.sendEmail(REPLY_EMAIL, '測試信', '這是測試，確認 Gmail 授權正常。');
}

function doPost(e) {
  // 併發鎖：兩人同時送出時，避免同時讀寫造成漏算或覆蓋
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonOut({ success: false, error: '系統忙碌中，請稍後再送出一次' });
  }
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        '報名時間','學員姓名','性別','年齡','年級',
        '聯絡電話','Email','緊急聯絡人','緊急電話',
        '繳款人','繳款電話','繳款信箱','與學員關係',
        '報名梯次','時段','班別','優惠資格',
        '聯電員工編號','聯電員工姓名',
        '團報成員','備注','狀態','管理備注',
        '健康狀況','健康說明','緊急醫療授權','法定代理人聲明','照片同意'
      ]);
      sheet.getRange(1, 1, 1, 28).setBackground('#185FA5').setFontColor('#FFFFFF').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // ── 進度條統計（唯讀，只回傳各梯人數，不含個資）──
    if (data.action === 'progress') {
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const sessionIdx = headers.indexOf('報名梯次');
      const slotIdx = headers.indexOf('時段');
      const batches = ['第1梯','第2梯','第3梯','第4梯','第5梯','第6梯','第7梯','第8梯'];
      const result = {};
      batches.forEach(b => result[b] = { am: 0, pm: 0, ft: 0 });
      rows.slice(1).forEach(row => {
        const sessions = String(row[sessionIdx] || '').split('、');
        const slot = String(row[slotIdx] || '');
        sessions.forEach(s => {
          const key = s.trim().split('｜')[0];
          if (!result[key]) return;
          if (slot === '上午班') result[key].am++;
          else if (slot === '下午班') result[key].pm++;
          else if (slot === '全天班') result[key].ft++;
        });
      });
      return jsonOut({ success: true, progress: result });
    }

    // ⚠️ 原本這裡有 action === 'updateStatus'，可以直接指定列號改「狀態」與「管理備注」。
    //    那個端點沒有任何驗證，任何人只要知道 Web App 網址就能改任意一列的狀態，
    //    而前端的管理後台早已移除、沒有任何地方會用到它，因此整段刪除。
    //    要改狀態請直接開 Sheet 編輯。

    // ---- 必填驗證（前端驗證擋不住直接打 API，後端必須自己驗）----
    const required = ['name', 'gender', 'age', 'phone', 'email',
                      'emergency_name', 'emergency_phone',
                      'payer_name', 'payer_phone', 'payer_email',
                      'sessions', 'time_slots', 'healthStatus', 'photoConsent'];
    for (const key of required) {
      if (!data[key] || String(data[key]).trim() === '') {
        return jsonOut({ success: false, error: '缺少必填欄位：' + key });
      }
    }
    if (String(data.healthStatus).trim() === '有特殊狀況' &&
        (!data.healthDetail || String(data.healthDetail).trim() === '' ||
         String(data.healthDetail).trim() === '—')) {
      return jsonOut({ success: false, error: '請填寫健康狀況說明' });
    }
    if (!data.medicalConsent) {
      return jsonOut({ success: false, error: '請勾選緊急醫療授權' });
    }
    if (!data.guardianConsent) {
      return jsonOut({ success: false, error: '請勾選法定代理人聲明' });
    }

    // ---- 格式驗證 ----
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (!EMAIL_RE.test(String(data.email).trim())) {
      return jsonOut({ success: false, error: '信箱格式有誤，請確認後再送出' });
    }
    if (!EMAIL_RE.test(String(data.payer_email).trim())) {
      return jsonOut({ success: false, error: '繳款人信箱格式有誤，請確認後再送出' });
    }
    const PHONE_RE = /^0\d{1,3}-?\d{6,8}$/;
    if (!PHONE_RE.test(String(data.phone).trim())) {
      return jsonOut({ success: false, error: '聯絡電話格式有誤，請確認後再送出' });
    }
    if (!PHONE_RE.test(String(data.emergency_phone).trim())) {
      return jsonOut({ success: false, error: '緊急聯絡人電話格式有誤，請確認後再送出' });
    }
    if (!PHONE_RE.test(String(data.payer_phone).trim())) {
      return jsonOut({ success: false, error: '繳款人電話格式有誤，請確認後再送出' });
    }

    // ---- 淨化（比對與寫入都用這組值）----
    const clean = {
      name:      safeCell(data.name, 20),
      gender:    safeCell(data.gender, 20),
      age:       safeCell(data.age, 20),
      grade:     safeCell(data.grade, 20) || '—',
      phone:     safeCell(data.phone, 15),
      email:     safeCell(data.email, 254),
      emgName:   safeCell(data.emergency_name, 20),
      emgPhone:  safeCell(data.emergency_phone, 15),
      payName:   safeCell(data.payer_name, 20),
      payPhone:  safeCell(data.payer_phone, 15),
      payEmail:  safeCell(data.payer_email, 254),
      payRel:    safeCell(data.payer_relation, 20) || '—',
      sessions:  safeCell(data.sessions, 120),
      slot:      safeCell(data.time_slots, 20),
      cls:       safeCell(data.class_prefs, 20) || '待評估',
      discount:  safeCell(data.discount, 40) || '—',
      group:     safeCell(data.group_members, 200) || '—',
      notes:     safeCell(data.notes, 200) || '—',
      health:        safeCell(data.healthStatus, 20),
      healthDetail:  safeCell(data.healthDetail, 200) || '—',
      medical:       data.medicalConsent ? '同意' : '',
      guardian:      data.guardianConsent ? '同意' : '',
      photo:         safeCell(data.photoConsent, 10)
    };

    // ---- 重複報名檢查（姓名＋信箱＋梯次全同才擋，同信箱不同孩子仍可報名）----
    const rows = sheet.getDataRange().getValues();
    const h = rows[0];
    const iName = h.indexOf('學員姓名'), iEmail = h.indexOf('Email'), iSess = h.indexOf('報名梯次');
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][iName]).trim() === clean.name &&
          String(rows[i][iEmail]).trim().toLowerCase() === clean.email.toLowerCase() &&
          String(rows[i][iSess]).trim() === clean.sessions) {
        return jsonOut({ success: false, error: '這位學員已用相同信箱報名過同一梯次了。' });
      }
    }

    // ---- 寫入（共 28 欄，順序 = 標題順序）----
    // 第 18、19 欄為已停用的聯電欄位，固定寫「—」以維持既有欄位對齊
    sheet.appendRow([
      safeCell(data.time, 30) || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss'),
      clean.name, clean.gender, clean.age, clean.grade,
      clean.phone, clean.email, clean.emgName, clean.emgPhone,
      clean.payName, clean.payPhone, clean.payEmail, clean.payRel,
      clean.sessions, clean.slot, clean.cls, clean.discount,
      '—', '—',
      clean.group, clean.notes, '待確認', '',
      clean.health, clean.healthDetail, clean.medical, clean.guardian, clean.photo
    ]);

    // ── 報名寫入後，自動同步「自動總表」──
    try { updateSummary(); } catch (sumErr) { Logger.log('自動總表更新失敗：' + sumErr); }

    // ── 寄確認信給報名者（寄信失敗不得讓家長看到「送出失敗」，資料已寫入）──
    try {
      sendConfirmEmail(data, clean);
    } catch (mailErr) {
      Logger.log('確認信寄送失敗：' + mailErr);
      try {
        sheet.getRange(sheet.getLastRow(), 23)
             .setValue('寄信失敗：' + safeCell(mailErr.message, 150));
      } catch (ignore) {}
    }

    return jsonOut({ success: true });
  } catch (err) {
    Logger.log('doPost 失敗：' + err);
    // 不把內部錯誤訊息原樣回給前端，避免洩漏後端結構
    return jsonOut({ success: false, error: '系統忙線或發生問題，請稍後再試，或來信 ' + REPLY_EMAIL });
  } finally {
    lock.releaseLock();
  }
}

/** 報名確認信 */
function sendConfirmEmail(data, clean) {
  const body =
    safeText(data.name, 20) + ' 您好，\n\n' +
    '感謝您報名 2026 年國立清華大學南大校區羽球夏令營！\n' +
    '我們已收到您的報名資料，以下是您的報名摘要：\n\n' +
    '▸ 報名梯次：' + safeText(data.sessions, 120) + '\n' +
    '▸ 時段：' + safeText(data.time_slots, 20) + '\n' +
    '▸ 班別偏好：' + safeText(data.class_prefs, 20) + '\n' +
    (String(data.healthStatus).trim() === '有特殊狀況'
      ? '▸ 健康狀況：' + safeText(data.healthDetail, 200) + '\n' : '') +
    '\n【接下來的流程】\n' +
    '接下來將陸續寄送繳費通知，請留意信箱。\n' +
    '若該梯次名額已滿，將寄出候補通知，請於收到確認信後再完成繳費。\n\n' +
    '【立即加入學員家長群組】\n' +
    '加入後可第一時間掌握開班通知與活動資訊：\n' +
    LINE_GROUP_URL + '\n\n' +
    '【如有任何問題，歡迎聯繫我們】\n' +
    '📧 Email：' + REPLY_EMAIL + '\n\n' +
    '期待與您在球場上見面！\n\n' +
    'Stay Young 運動團隊 敬上';
  GmailApp.sendEmail(
    data.email,
    '【清大羽球夏令營】報名確認通知 — ' + safeText(data.name, 20),
    body,
    { name: 'Stay Young 清大羽球夏令營', replyTo: REPLY_EMAIL }
  );
}

function doGet(e) {
  return jsonOut({ status: 'ok' });
}

function testProgress() {
  const e = { postData: { contents: JSON.stringify({ action: 'progress' }) } };
  Logger.log(doPost(e).getContent());
}

/*** ============================================================
 * 自動排序總表
 * 讀「報名資料」→ 依梯次展開（報多梯→多列）→ 寫入「自動總表」
 * 手填三欄（繳費狀態/個別Line群/繳費回信）用「姓名+梯次+時段」鍵保留
 * ============================================================ ***/

const SUMMARY_HEADERS = [
  '報名梯次','學生姓名','年齡','繳款人姓名','繳款人電話','繳款人email','優惠方案','年級',
  '繳費狀態','個別Line群','繳費回信',
  '時段','性別','班別','報名時間','健康狀況'
];
const MANUAL_START_COL = 9;    // I欄起是手填區（繳費狀態/個別Line群/繳費回信）
const MANUAL_COLS = 3;
const BATCH_ORDER = ['第1梯','第2梯','第3梯','第4梯','第5梯','第6梯','第7梯','第8梯'];
const SLOT_ORDER  = ['上午班','下午班','全天班'];

function updateSummary() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const src = ss.getSheetByName(SHEET_NAME);
  if (!src) return;
  let dest = ss.getSheetByName(SUMMARY_SHEET);
  if (!dest) dest = ss.insertSheet(SUMMARY_SHEET);

  // 1. 記住已填的三欄（鍵 = 姓名|梯次|時段）
  const oldManual = readManual_(dest);

  // 2. 讀原始報名
  const data = src.getDataRange().getValues();
  if (data.length < 2) {
    dest.clear();
    dest.getRange(1,1,1,SUMMARY_HEADERS.length).setValues([SUMMARY_HEADERS]);
    return;
  }
  const head = data[0];
  const col = n => head.indexOf(n);
  const ci = {
    time: col('報名時間'), name: col('學員姓名'), gender: col('性別'),
    age: col('年齡'), grade: col('年級'), pay_name: col('繳款人'),
    pay_phone: col('繳款電話'), pay_email: col('繳款信箱'),
    batch: col('報名梯次'), slot: col('時段'),
    cls: col('班別'), discount: col('優惠資格'),
    health: col('健康狀況'), healthDetail: col('健康說明')
  };

  // 3. 展開：報多梯→多列
  const out = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const name = row[ci.name];
    if (!name) continue;
    const slot = row[ci.slot] || '';
    const batches = String(row[ci.batch] || '').split(/[、,，]/).map(s => s.trim()).filter(Boolean);
    // 健康狀況：有特殊狀況時直接把說明帶進總表，教練不必再翻原始分頁
    let healthCell = '';
    if (ci.health >= 0) {
      const hs = String(row[ci.health] || '').trim();
      const hd = ci.healthDetail >= 0 ? String(row[ci.healthDetail] || '').trim() : '';
      healthCell = (hs === '有特殊狀況') ? ('⚠️ ' + (hd && hd !== '—' ? hd : '有特殊狀況')) : hs;
    }
    batches.forEach(b => {
      const batchKey = normBatch_(b);
      const key = name + '|' + batchKey + '|' + slot;
      const m = oldManual[key] || ['','',''];
      out.push([
        batchKey, name, row[ci.age], row[ci.pay_name], row[ci.pay_phone], row[ci.pay_email],
        row[ci.discount], row[ci.grade],
        m[0], m[1], m[2],
        slot, row[ci.gender], row[ci.cls], row[ci.time], healthCell
      ]);
    });
  }

  // 4. 排序：梯次→時段→姓名
  out.sort((a,b) => {
    const bi = BATCH_ORDER.indexOf(a[0]) - BATCH_ORDER.indexOf(b[0]);
    if (bi !== 0) return bi;
    const si = SLOT_ORDER.indexOf(a[11]) - SLOT_ORDER.indexOf(b[11]);
    if (si !== 0) return si;
    return String(a[1]).localeCompare(String(b[1]), 'zh-Hant');
  });

  // 5. 寫回（只清內容，不動欄寬與格式，保留你手動調整的欄寬）
  const lastRow = dest.getLastRow();
  if (lastRow > 0) dest.getRange(1, 1, lastRow, SUMMARY_HEADERS.length).clearContent();
  dest.getRange(1,1,1,SUMMARY_HEADERS.length).setValues([SUMMARY_HEADERS]);
  if (out.length) dest.getRange(2,1,out.length,SUMMARY_HEADERS.length).setValues(out);

  // 6. 美化（不含 autoResizeColumns，欄寬交給你手動控制）
  dest.setFrozenRows(1);
  dest.getRange(1,1,1,SUMMARY_HEADERS.length).setBackground('#0C447C').setFontColor('#FFFFFF').setFontWeight('bold');
  dest.getRange(1, MANUAL_START_COL, 1, MANUAL_COLS).setBackground('#EF9F27').setFontColor('#412402');
  if (out.length) dest.getRange(2, MANUAL_START_COL, out.length, MANUAL_COLS).setBackground('#FFF8EC');
}

// 讀現有手填三欄 → { "姓名|梯次|時段": [繳費狀態, Line群, 繳費回信] }
function readManual_(dest) {
  const map = {};
  if (!dest || dest.getLastRow() < 2) return map;
  const vals = dest.getDataRange().getValues();
  const h = vals[0];
  const iName = h.indexOf('學生姓名'), iBatch = h.indexOf('報名梯次'), iSlot = h.indexOf('時段');
  const iM = MANUAL_START_COL - 1;
  if (iName < 0 || iBatch < 0) return map;
  for (let r = 1; r < vals.length; r++) {
    const key = vals[r][iName] + '|' + vals[r][iBatch] + '|' + vals[r][iSlot];
    const m = [vals[r][iM] || '', vals[r][iM+1] || '', vals[r][iM+2] || ''];
    if (m.some(x => x !== '')) map[key] = m;
  }
  return map;
}

// 「第3梯｜7/20－7/24」→「第3梯」
function normBatch_(s) {
  const m = String(s).match(/第[0-9一二三四五六七八]+梯/);
  if (!m) return s;
  return m[0].replace(/[一二三四五六七八]/, d => ({'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8'}[d]));
}

/*** ============================================================
 * 每日自動備份
 *
 * 安裝方式（擇一）：
 *   A.【建議】函式下拉選單選 installDailyBackupTrigger 按執行，一次裝好。
 *   B. 手動：左側「觸發條件」→ 新增 → dailyBackup／時間驅動／日計時器／23:00–00:00
 * ============================================================ ***/

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

function dailyBackup() {
  // 資料夾與兩個冬令營站分開，否則各自的 slice(14) 會互刪對方的備份
  const FOLDER_NAME = 'StayYoung 報名備份_夏令營';
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  const src = DriveApp.getFileById(SHEET_ID);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  const copy = src.makeCopy('【備份】羽球夏令營報名_' + stamp, folder);
  const files = folder.getFiles();
  const list = [];
  while (files.hasNext()) list.push(files.next());
  list.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  list.slice(14).forEach(f => f.setTrashed(true));
  return copy.getId();
}

// 手動更新選單
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏸 營隊工具')
    .addItem('更新自動總表', 'updateSummary')
    .addItem('立即備份一次', 'dailyBackup')
    .addToUi();
}
