# ARC 居留證控管系統 V13 Formal

這是一版乾淨重做的正式版專案，不沿用前面補丁覆蓋狀態。前端使用 React / Vite，正式資料使用 Supabase，不把案件、批次、財務、傳真領件等正式資料存在 localStorage。

## 已包含

- Email + 密碼登入
- 下次打開直接登入（只保存 Supabase session，不保存明文密碼）
- 管理員 / 行政 / 會計權限分流
- 居留案件登記：單筆、批次、Excel / Google Sheet 貼上、每次新增 5 列
- 案件編號：`ARC + 仲介代碼 + YYYYMMDD + 001`
- 居留證繳費：待繳案件搜尋、同一批只能同仲介、依仲介篩扣款帳號、取消繳費、恢復待繳
- 繳費批次編號：`仲介代碼 + YYYYMMDD + 001`
- 財務對帳確認：批次明細、對帳完成、項目金額錯誤單筆修正
- 財務查詢：預設全部資料、月份篩選、雇主 / 工人查詢，版面不壓縮
- 傳真/領件：Asia/Taipei 提醒、收據順序防重、預計領件區、單筆領件、批次領件、傳真領件紀錄
- 傳真領件紀錄編號：`PYYYYMMDD-01`
- 案件查詢：案件編號、雇主、工人、團號、申請項目、收件編號、外字五碼
- 統計數據：每月每個人申請件數、各項目本月 / 本年、年度累計，維持表格呈現
- 匯出 CSV
- 仲介與扣款帳號：灃康不同帳戶餘額分開，不合併
- 操作紀錄與刪除救回資料表
- 系統設定：帳號、人員、送件項目、手續費、仲介、帳戶、傳真/領件、提醒、列印、移民署服務站、專勤隊
- 搜尋元件：compositionstart / compositionupdate / compositionend / input / paste / blur / Enter / clear 完整處理，搜尋只更新結果區，不重建 input

## 重要限制

這份專案是依文字規格重建 V13 樣式與流程。因本對話沒有提供原始 V13 demo HTML / icon 檔，所以 icon 以白色單色 inline SVG 重建；如果要 100% 比對原 V13 icon，需要再把原始 V13 檔案或 icon 資料放入專案替換。

## 1. 建立 Supabase

1. 到 Supabase 建立新專案
2. 開啟 SQL Editor
3. 執行：

```sql
-- 貼上並執行：supabase/migrations/202607010001_arc_v13_formal_schema.sql
```

此 SQL 會建立：

- profiles
- person_options
- broker_companies
- bank_accounts
- application_items
- fee_settings
- arc_settings
- serial_counters
- arc_cases
- payment_batches
- payment_batch_items
- account_transactions
- fax_pickup_items
- pickup_records
- pickup_record_items
- immigration_service_stations
- task_force_contacts
- audit_logs
- deleted_records

並建立預設仲介、帳戶、申請項目、人員選項、提醒設定與 RLS 權限。

## 2. 建立預設帳號

先複製環境變數：

```bash
cp .env.example .env
```

在 `.env` 填入：

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

執行：

```bash
npm install
npm run seed:users
```

預設帳號：

| 使用者 | 權限 | Email | 初始密碼 |
|---|---|---|---|
| 若儀 | 管理員 | jillzoe@forwardhrm.com.tw | 123456 |
| 嘉陽 | 管理員 | patty@forwardhrm.com.tw | 123456 |
| 明書 | 管理員 | mint@forwardhrm.com.tw | 123456 |
| 詩涵 | 行政 | rachel@forwardhrm.com.tw | 123456 |
| 佩珊 | 行政 | penny@forwardhrm.com.tw | 123456 |
| 晏婷 | 行政 | helen@forwardhrm.com.tw | 123456 |
| 奕君 | 行政 | jean_guo@forwardhrm.com.tw | 123456 |
| 莞莞 | 行政 | maru@forwardhrm.com.tw | 123456 |
| 芸瑄 | 會計 | nina@forwardhrm.com.tw | 123456 |
| 淑娥 | 會計 | joy@forwardhrm.com.tw | 123456 |

正式上線後建議首次登入強制改密碼，目前資料表已保留 `must_change_password` 欄位。

## 3. 部署帳號管理 Edge Function

帳號新增、刪除、停用、密碼重設需要 service role 權限，不能放在前端。因此提供 Supabase Edge Function。

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy arc-admin-users --no-verify-jwt
```

Supabase Edge Function 需要下列 secrets，通常 Supabase 會自帶；若沒有請設定：

```bash
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

## 4. 本機開發

```bash
npm install
npm run dev
```

## 5. 建置檢查

```bash
npm run build
```

## 6. GitHub / Vercel 部署

```bash
git init
git add .
git commit -m "update ARC V13 formal version"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

到 Vercel 匯入 GitHub repo，並設定：

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

之後每次更新：

```bash
git add .
git commit -m "update ARC V13 formal version"
git push origin main
```

Vercel 會自動部署。

## 搜尋 / 中文注音架構

所有搜尋欄使用 `src/components/SearchInput.tsx`，重點：

- compositionstart：isComposing = true，不搜尋
- compositionupdate：不搜尋、不 render、不重設 value
- compositionend：isComposing = false，立刻用最終 value 搜尋
- input：注音中只更新 inputText；完成輸入才 debounce 300ms 搜尋
- paste：解除 composing，貼上後搜尋
- blur：解除 composing
- Enter：解除 composing 並搜尋
- clear：清空 inputText / searchKeyword 並更新結果

搜尋時只更新 React state 與結果區，不使用 `container.innerHTML = renderFullPage()`。

## Supabase SQL 是否需要重跑

- 只改前端顯示、搜尋、流程 JSON：不用重跑 SQL
- 新增資料表、欄位、RPC、RLS：要先在 Supabase SQL Editor 執行 SQL


## 2026-07-01 V25 修正包

本次更新包含：

- 居留案件登記單筆新增「現場申請」按鈕，儲存後直接進入傳真/領件，不進待繳。
- 申請日期支援西元、民國年、斜線、橫線、點號與「民國115年3月1日」，統一儲存 yyyy-mm-dd。
- 傳真領件紀錄刪除改為管理員限定，刪除明細但不刪原始案件，並寫入異動紀錄與刪除救回資料。
- checkbox 縮小、全系統畫面字體縮小約 2pt，不影響列印格式。
- 統計頁改為：每月每人總件數、每年每人總件數、各項目本月/本年、年度每月、各仲介統計。
- 首頁新增常用外部連結區。
- 案件查詢、財務對帳確認、財務查詢新增管理員刪除；財務刪除會建立帳戶沖正紀錄。
- 會計可查看仲介與扣款帳號、餘額，但不可任意調整餘額。
- 居留證繳費頁新增仲介銀行帳戶餘額區塊，依帳戶分開顯示。
- 新增 `supabase/migrations/202607010002_arc_v13_formal_update.sql`，可導入移民署服務站、專勤隊聯絡資訊與晶片居留證查詢連結設定。

若已經部署過舊版，請先覆蓋檔案後執行：

```bash
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
git add .
git commit -m "update ARC V13 V25 fixes"
git push origin main
```

若要導入官方聯絡資訊，請到 Supabase SQL Editor 執行：

```sql
-- 執行 supabase/migrations/202607010002_arc_v13_formal_update.sql
```

## V28 更新：Icon、提醒事項、公告事項

本版新增與調整：

- 將系統 icon 統一放入 `public/icons/`，由 `src/utils/icons.tsx` 的 `iconMap` 統一讀取。
- 左側選單、總覽卡片、提醒事項、公告事項、系統設定分類項目改用新 icon。
- 提醒事項改為精緻卡片式設計，仍以 Asia/Taipei 判斷週一 / 週二 / 週四的「今天」狀態。
- 新增公告事項功能，公告會顯示在總覽、居留案件登記、居留證繳費頁面上方。
- 新增「公告事項」左側入口，行政與管理員可新增、修改、停用、刪除公告；其他角色僅可查看公告。
- 公告異動會寫入 `audit_logs`，刪除走軟刪除與 `deleted_records`。

### Supabase SQL

V28 新增公告事項資料表，請先在 Supabase SQL Editor 執行：

```txt
supabase/migrations/202607020004_arc_v13_v28_announcements.sql
```

### Vercel / GitHub

建議使用完整包覆蓋根目錄，確認根目錄存在 `package.json`、`src/`、`public/icons/` 後再執行：

```bash
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
git add -A
git commit -m "update ARC V13 V28 icons reminders announcements"
git push origin main
```
