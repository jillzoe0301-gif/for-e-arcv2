# ARC V13.40 更新說明

本版優先修正「系統設定」內新增、修改、停用、刪除與帳號密碼重設失敗問題。

## 本版修正重點

- 帳號設定：密碼重設、停用、啟用、刪除修正。
- 帳號停用 / 刪除後不可登入。
- 不可停用 / 刪除目前登入中的帳號。
- 不可停用 / 刪除唯一啟用中的管理員帳號。
- 帳號刪除改為軟刪除，保留歷史資料。
- 人員選項設定刪除修正。
- 送件項目設定刪除修正。
- 手續費、仲介公司、帳戶、傳真/領件、提醒事項、列印設定、移民署服務站、專勤隊聯絡資訊等系統設定刪除修正。
- 系統設定項目新增「停用 / 啟用」操作。
- 刪除與停用統一寫入操作紀錄。
- 密碼重設不會將密碼明文寫入操作紀錄。
- 登入時會檢查 profiles.is_active / deleted_at，停用或刪除帳號會被阻擋。
- 首頁版本更新為 ARC V13.40。

## Supabase SQL

本版需要先在 Supabase SQL Editor 執行：

```txt
supabase/migrations/202607020009_arc_v13_v40_settings_admin_ops.sql
```

## Edge Function

帳號新增與密碼重設需要部署 Supabase Edge Function：

```bash
supabase functions deploy arc-admin-users --no-verify-jwt
```

Edge Function Secret 需設定：

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## 部署

```bash
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
git add -A
git commit -m "update ARC V13.40 settings operations"
git push origin main
```
