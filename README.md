# 清華大學羽球冬令營 2027

https://nthu-badminton.stayyounglab.com ｜ 隸屬 [Stay Young](https://stayyounglab.com)（[主站 repo](https://github.com/Ryan1109-d/stay-young-home)）

與另外兩個冬令營站（[football-camp](https://github.com/Ryan1109-d/football-camp) 清大足球、[badminton-camp](https://github.com/Ryan1109-d/badminton-camp) 台大羽球）為**完全獨立**的專案：獨立 repo、獨立 Apps Script、獨立 Google Sheet。

> repo 名稱 `summarcamp` 是 2026 夏令營時期留下的，網站內容已於 2026-08 改為 2027 冬令營。
> 名稱維持不動，避免動到 GitHub Pages 的自訂網域設定。

---

## 這個站是什麼

| | |
|---|---|
| 營期 | 2027/1/25（一）– 1/29（五），單梯 |
| 地點 | 清華大學南大校區　學生活動中心 1F |
| 時段 | 上午班 09:00–12:00／下午班 14:00–17:00／全天班 09:00–17:00 |
| 對象 | 不限年齡 |
| 主辦 | 清華大學羽球校隊（指導：清華大學體育組） |
| 報名截止 | 2027/1/10 |

### 收費（沿用 2026 夏令營定價）

| | 上午班 | 下午班 | 全天班 |
|---|---|---|---|
| 一般報名 | 4,000 | 4,000 | 7,600 |
| 優惠價 | 3,500 | 3,500 | 7,000 |

優惠資格擇一適用、不可疊加：五人以上團報／清大在校學生／清大教職員工／特約合作企業員工（聯電、台積電、工研院）。
全天班可代訂午餐，五天共 500。

> **本營隊沒有早鳥、沒有推薦人優惠、沒有紀念衫**——這三項是另外兩個冬令營站才有的。
> 改動定價或優惠邏輯時，不要直接從 badminton-camp 複製，那邊的 `CONFIG` 帶早鳥與推薦人。

---

## 檔案

```
index.html        首頁（含招生狀況即時看板）
signup.html       報名表單（noindex，不進搜尋結果）
gas-backend.js    Google Apps Script 後端的參考副本
images/           logo 與場地照
CNAME             nthu-badminton.stayyounglab.com　⚠️ 不能刪
robots.txt / sitemap.xml
```

純靜態 HTML/CSS/JS，沒有 build step。GitHub Pages 從 `main` 分支根目錄部署。

---

## 名額與候補：與另外兩站不同，改動前請詳讀

名額以**時段**為單位計算，每個時段上限 50 人（`CONFIG.CAPACITY`），滿 15 人（`CONFIG.MIN_OPEN`）確定開班。

**全天班同時佔用上午與下午兩個時段的名額**，所以：

```
上午佔用 = 上午班人數 + 全天班人數
下午佔用 = 下午班人數 + 全天班人數
```

判定方式：

| 報名時段 | 正取條件 |
|---|---|
| 上午班 | 上午佔用 < 50 |
| 下午班 | 下午佔用 < 50 |
| 全天班 | 上午佔用 < 50 **且** 下午佔用 < 50 |

舉例：全天班 20 人、上午班 30 人、下午班 5 人 → 上午佔用 50（滿）、下午佔用 25。
此時再報上午班或全天班都是候補，只有下午班還能正取。

台大羽球站（badminton-camp）已於 2026-08-21 同步改成這套邏輯。足球站只有整天班一個時段，兩種算法結果相同，未改動。

---

## 後端（Google Apps Script）

`gas-backend.js` 是**參考副本**，改它不會影響線上行為。要生效必須：

1. 貼進 Apps Script 編輯器
2. 儲存
3. **部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署**

只按儲存無效。

### 主要函式

| 函式 | 作用 |
|---|---|
| `checkSetup()` | 檢查 SHEET_ID、分頁、標題列逐欄比對、各時段佔用數。不寫資料不寄信，隨時可跑 |
| `doPost` | 接收報名 → 寫 Sheet → 判定正取／候補 → 寄家長信 → 寄自己通知信。另處理 `action:'progress'` 的招生狀況查詢（唯讀，不含個資） |
| `notifyOwner_` | 新報名通知寄 stayyoung985，主旨帶【清大羽球】 |
| `calcAmount` | 兩層計價：原價 → 優惠價，另計午餐 |
| `sendCancelNotice(時段)` | 未達開班門檻時，通知該時段的報名者 |
| `installDailyBackupTrigger()` / `dailyBackup()` | 每日備份到 Drive，保留 14 份 |

### 繳費：刻意不寄

**本營隊的繳費單由清華大學校方寄送與收款，本系統不參與。**

`CONFIG.PAYMENT.ACCOUNT_NAME` 固定為
`'（測試）清大羽球營繳費由學校辦理，本系統不寄繳費通知'`，
讓 `paymentIsPlaceholder()` 永遠成立、`sendPaymentNotice()` 永遠中止。

**不要「好心」把它換成真實戶名**——那會解除防呆，誤觸就把個人帳戶寄給家長。
`checkSetup()` 回報「收款防呆生效中」是正確結果。

（清大足球站是同樣的設計，理由相同。）

---

## 部署前的必要步驟

前端的 `GAS_URL` 目前是佔位字串 `YOUR_GAS_WEB_APP_URL_HERE`，**index.html 與 signup.html 兩處都要換成同一個值**：

- signup.html：沒換就送不出報名（會直接跳送出失敗）
- index.html：沒換就不會去讀招生狀況，三個時段維持顯示「熱烈招生中」

`CONFIG.LINE_GROUP_URL` 維持佔位字串時，確認信會自動略過整段 LINE 說明，不會寄出壞掉的連結。

真實的 SHEET_ID 與 LINE 群連結放在 repo 外的 `STAY_YOUNG_SHEET_IDS.txt`，不進 git。

---

## Sheet 欄位（28 欄）

分頁名稱 `報名名單`。順序即 `appendRow` 的寫入順序，`checkSetup()` 會逐欄比對：

```
報名時間 | 梯次 | 時段 | 學員姓名 | 性別 | 年齡 | 年級 | 聯絡電話 | 收信信箱 |
緊急聯絡人 | 緊急聯絡人電話 | 繳款人姓名 | 繳款人電話 | 繳款人信箱 | 與學員關係 |
優惠資格 | 班別偏好 | 午餐 | 狀態 | 團報成員 | 備註 | 照片同意 |
健康狀況 | 健康說明 | 緊急醫療授權 | 法定代理人聲明 | 繳費通知 | 系統訊息
```

---

## 改前端時的注意事項

`signup.html` 的時段與優惠資格 option value，必須與 `gas-backend.js` 的 `VALID_SLOTS`、`VALID_DISCOUNTS` **逐字一致**，否則合法報名會被後端白名單擋掉。改一邊就要改另一邊。

同理，`signup.html` 的 `estimateFee()` 是給家長看的試算，規則必須與後端 `calcAmount()` 一致。
