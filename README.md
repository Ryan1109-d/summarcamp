# 清華大學羽球夏令營 2026 — 報名網站

https://nthu-badminton.stayyounglab.com

主辦單位為**清華大學羽球校隊**。本站刻意維持**獨立品牌**，與 Stay Young 冬令營系列分開，只在左上角放一枚 Stay Young 標誌連回 [stayyounglab.com](https://stayyounglab.com)。

與另外兩個冬令營站（[football-camp](https://github.com/Ryan1109-d/football-camp)、[badminton-camp](https://github.com/Ryan1109-d/badminton-camp)）為完全獨立的專案：獨立 repo、獨立 Apps Script、獨立 Google Sheet。

## 檔案結構

| 檔案 | 用途 |
|---|---|
| `index.html` | 單頁站（介紹／梯次／報名表單），`GAS_URL` 在這個檔案裡 |
| `gas-backend.js` | Apps Script 後端原始碼（納入版控供稽核用，實際執行的是 Apps Script 上那份） |
| `images/` | Logo |
| `robots.txt`、`sitemap.xml` | SEO（本站**沒有** `noindex`，已對外公開） |
| `CNAME` | GitHub Pages 自訂網域，**請勿刪除** |

## 營隊事實

| 項目 | 內容 |
|---|---|
| 期間 | 7/06–8/28，共**八梯次**，每梯週一至週五 09:00–17:00 |
| 班別 | 初階／進階／菁英 |
| 師資 | 甲組選手與持證教練 |
| 主辦 | 清華大學羽球校隊 |
| 聯絡 | stayyoung985@gmail.com |

## 後端部署（Google Apps Script）

1. Google Sheet 需有兩個分頁：`報名資料`（原始報名）與 `自動總表`（程式自動產生，不存在會自動建立）
2. `報名資料` 第一列填**這 28 欄**。程式**按位置**寫入，順序不能動：

   ```
    1 報名時間      2 學員姓名     3 性別        4 年齡         5 年級
    6 電話          7 收信信箱     8 緊急聯絡人   9 緊急聯絡人電話
   10 繳款人姓名   11 繳款人電話  12 繳款人信箱  13 與學員關係
   14 報名梯次     15 時段        16 班別        17 優惠身份
   18 （停用）     19 （停用）
   20 團報成員     21 備註        22 繳費狀態    23 系統訊息
   24 健康狀況     25 健康說明    26 緊急醫療授權 27 法定代理人聲明  28 照片同意
   ```

   > 欄位名稱以現有 Sheet 為準（程式只有 `報名梯次`、`時段` 兩欄是靠名稱查找，其餘按位置）。
   >
   > ⚠️ **第 18、19 欄是已停用的聯電員工編號／姓名，不可刪除。** 前端早已移除這兩個欄位、新報名固定寫「—」，但歷史報名資料還在那兩欄裡，刪掉會遺失既有紀錄，也會讓後面所有欄位錯位。

3. 擴充功能 → Apps Script → 貼上 `gas-backend.js`
4. 填 `SHEET_ID`（repo 內是 `YOUR_SHEET_ID_HERE` 佔位字串，真值只填在 Apps Script）
5. 部署為網頁應用程式（執行身分：我；存取權：所有人），複製 Web App URL 填進 `index.html` 的 `GAS_URL`
6. 函式下拉選 `installDailyBackupTrigger` → 執行，裝每日 23:00–00:00 備份

> ⚠️ **重貼原始碼前先複製 Apps Script 上現有的 `SHEET_ID`。** repo 這份是佔位字串，直接覆蓋會讓後端寫不進 Sheet。

## 主要函式

| 函式 | 作用 |
|---|---|
| `doPost` | 接收報名，寫入 `報名資料`、同步 `自動總表`、寄確認信 |
| `sendConfirmEmail` | 報名確認信 |
| `updateSummary` | 重建 `自動總表`。含「健康狀況」欄，有特殊狀況會帶出說明並加 ⚠️ 前綴 |
| `readManual_` | 保留總表上手填的三欄（繳費狀態／個別 Line 群／繳費回信），鍵為「姓名\|梯次\|時段」 |
| `normBatch_` | 梯次字串正規化 |
| `onOpen` | Sheet 開啟時掛上自訂選單 |
| `testEmail` / `testProgress` | 授權與進度測試 |
| `installDailyBackupTrigger` / `listTriggers` / `dailyBackup` | 每日備份（只留最近 14 份） |

`updateSummary` 只清內容、不動欄寬與格式，手動調過的欄寬會保留。

## 安全機制

`safeCell`（Sheet 公式注入防護，`=` 開頭前置單引號）｜`safeText`（信件標頭注入防護）｜`LockService` 併發鎖｜必填／email／電話格式／重複報名驗證｜寄信失敗只寫進第 23 欄，不讓家長看到「送出失敗」（資料其實已寫入）｜錯誤訊息不原樣回傳前端

**已移除的端點**：舊版有 `action === 'updateStatus'`，任何人知道 Web App 網址就能改任意一列的狀態與備註，零驗證，且前端早已無人呼叫。已刪除，要改狀態請直接開 Sheet。

## 待處理

- `index.html` 內有**公開的 LINE 家長群組邀請連結**（`LINE_GROUP_URL`）。移除連結之外，還要到 LINE 後台關閉「允許使用邀請網址加入」，否則舊連結仍然有效。
- git 歷史仍含舊管理密碼與 Web3Forms 金鑰，需確認已在對應後台作廢。
- 電話格式驗證為 `/^0\d{1,3}-?\d{6,8}$/`。舊版完全沒驗證，家長可能填過 `0912 345 678`（含空格）或 `+886` 開頭，這類格式現在會被擋下。

## 部署

GitHub Pages（`main` / root）。push 後約 1–3 分鐘生效，用 curl 輪詢驗證。修改前先 `git pull`。
