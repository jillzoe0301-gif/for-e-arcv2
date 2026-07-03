# ARC V13.42

本版修正傳真/領件收據順序誤判重複問題，重點：

- 防重判斷排除目前正在編輯的同一案件。
- 防重只讀取 receipt_order 欄位，不讀張數、IC卡、經手人後四碼等數字欄位。
- 已移除、已作廢、已刪除、已領件完成的資料不再占用收據順序。
- 從預計領件區移除後，原收據順序會釋放，可重新輸入。
- 防重錯誤時 console.table 顯示占用來源，方便查出是哪筆資料。

請先執行 Supabase SQL：

`supabase/migrations/202607030011_arc_v13_v42_receipt_order_duplicate_fix.sql`

# ARC V13.41 更新說明

## 本版修正

- 預計領件區移除案件後，案件回到移民署傳真領件待處理區。
- 預計領件區移除後，原本占用的同日收據順序會釋放。
- 收據順序防重只檢查目前有效的 pending 預計領件與有效待處理草稿。
- 防重判斷會排除同一案件自己的舊值。
- 領件日預設修正為「下一個週四」：若今天是週四，才抓下一週週四；週一、二、三會抓本週四。
- 從預計領件區移除後，收據順序會清空，收件編號、外字五碼、舊卡、經手人後四碼會保留。
- 首頁版本更新為 ARC V13.41。

## 需要執行 Supabase SQL

請先到 Supabase SQL Editor 執行：

```sql
supabase/migrations/202607030010_arc_v13_v41_pickup_receipt_release.sql
```

此 SQL 會將舊版收據順序唯一索引改為只限制有效待領件資料，避免已移除 / 已作廢資料繼續占用序號。

## 部署指令

```bash
ls -la arc-v13-formal-v41-update.zip

printf "\n.env\n.env.local\nnode_modules\ndist\n*.zip\ntsconfig.tsbuildinfo\n*.tsbuildinfo\n" >> .gitignore

rm -rf src public supabase scripts dist node_modules
rm -f package-lock.json package.json index.html tsconfig.json vite.config.ts README.md BUILD_CHECK.txt

unzip -o arc-v13-formal-v41-update.zip

test -f package.json && echo "package.json OK"
test -f src/pages/FaxPickupPage.tsx && echo "傳真領件 OK"
test -f src/api/repository.ts && echo "repository OK"
test -f src/utils/date.ts && echo "日期工具 OK"
test -f supabase/migrations/202607030010_arc_v13_v41_pickup_receipt_release.sql && echo "SQL OK"

npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build

git status
git add -A
git commit -m "update ARC V13.41 pickup receipt release"
git push origin main
```
