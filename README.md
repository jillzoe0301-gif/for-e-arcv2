# ARC V13.38 更新

本版重點：繳費批次明細增減、批次狀態簡化、傳真領件欄位與首頁版本顯示修正。

## 必跑 SQL
先到 Supabase SQL Editor 執行：

`supabase/migrations/202607020007_arc_v13_v38_batch_fax_version.sql`

## 部署

```bash
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
git add -A
git commit -m "update ARC V13.38 batch detail fax fields version"
git push origin main
```
