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

## 個資保護

報名資料含姓名、電話、信箱、緊急聯絡人，以及**健康狀況**——後者屬於敏感個資，外洩的代價比一般欄位高。以下是目前的防護與你該定期做的事。

### 對外只有一個入口

| 端點 | 開放對象 | 回傳什麼 |
|---|---|---|
| `doPost`（報名） | 所有人（必要，否則收不到報名） | 只回成功／失敗與是否候補 |
| `doPost` + `action:'progress'` | 所有人 | **只有各時段人數**，不含任何個資 |
| `doGet` | 所有人 | 固定字串 `API alive` |

**後端沒有任何「讀取報名資料」的對外端點。** 拿到 Web App 網址的人只能送報名，不能撈資料。日後要加後台，務必走 Google 帳號授權，不要做成「知道網址就能看」。

### 防濫用

| 機制 | 擋什麼 |
|---|---|
| honeypot 欄位 | 自動填表機器人 |
| 全域流量上限（`MAX_SUBMITS_PER_MINUTE`，預設 12） | 有人寫腳本狂送，把 Sheet 灌爆 |
| 重複送出冷卻（10 分鐘） | 同一人重複點送出 |
| 白名單驗證（時段、優惠資格） | 竄改前端後送出不合法的值 |
| `safeCell()` | Google Sheets 公式注入（`=IMPORTXML(...)` 偷資料） |
| `safeText()` | 信件標頭注入 |
| `LockService` | 兩人同時送出造成漏算 |

### 要定期執行的函式

| 函式 | 什麼時候跑 | 會不會動到資料 |
|---|---|---|
| `checkPrivacy()` | **每隔一陣子跑一次**，尤其在把 Sheet 分享給別人之後 | 唯讀，安全 |
| `lockDownSharing()` | `checkPrivacy()` 報紅的時候 | 會改共用設定 |
| `purgeOldData()` | 到期後 | 試算模式，不刪 |
| `purgeOldData(true)` | 確認試算結果後 | **會真的刪，不可逆** |

`checkPrivacy()` 檢查三件事：報名 Sheet 有沒有被設成「知道連結的人可以看」、每日備份的副本有沒有跟著外流、除了你以外還有誰有存取權。

**備份副本是最容易漏掉的破口**——它會繼承來源 Sheet 的共用設定。來源只要曾經開放過一次，之後每天的備份都會跟著開放。`dailyBackup()` 現在每次都明確把副本壓成私有，不倚賴繼承。

### 保留期限

報名表上寫「活動結束後六個月內刪除」。這個承諾由 `CONFIG.DATA_PURGE_AFTER` 記錄（`2027-07-29`，營期結束 + 6 個月），`purgeOldData()` 拿它當基準，未到期不會執行。

到期後請執行 `purgeOldData()` 看試算，確認筆數無誤再執行 `purgeOldData(true)`。刪除後 Drive 垃圾桶內仍留有副本，確定不需要請一併清空。

### 前端

兩頁都有 Content-Security-Policy，限制可載入與可連線的來源——萬一頁面被塞進第三方腳本，它也連不出去，報名資料帶不走。**換字型、換圖床、換 GAS 網址時要同步更新 CSP**，否則資源會被瀏覽器擋掉。

`frame-ancestors` 只能透過 HTTP 標頭設定，GitHub Pages 設不了，因此未納入。

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
