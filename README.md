# ARC V13.39

本版更新：傳真領件收費日期修改、收據順序防重、預計領件區移除、已填資訊一鍵加入預計，以及登入者修改自己的密碼。

## 部署

1. 先在 Supabase SQL Editor 執行：
   `supabase/migrations/202607020008_arc_v13_v39_fax_password.sql`
2. 覆蓋專案檔案後執行：
   `npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund`
   `npm run build`
3. Git commit / push 後由 Vercel 自動部署。

`service_role` 或 `sb_secret` 不可放入前端或 GitHub。
