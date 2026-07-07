# ARC V13.43.2 更新說明

本版修正傳真/領件收據序號誤判重複：

- 收據序號只依「同一領件日 + 收據序號 + 不同案件」判斷重複。
- 防重判斷不讀取張數、IC卡、經手人後四碼、收件編號、外字五碼等其他數字欄位。
- 已從預計領件區移除、已作廢、已刪除、或已回到移民署傳真領件的舊紀錄不再占用序號。
- 重新移入待領件的案件，原本 14、15 號移出後可再次使用 14、15 號。
- 預計領件區顯示與防重判斷統一只看有效 pending 且案件 pickup_status 為 pending 的資料。
- 首頁版本更新為 ARC V13.43.2。

## 需要執行 SQL

請先在 Supabase SQL Editor 執行：

```txt
supabase/migrations/202607030014_arc_v13_v43_2_receipt_order_release_fix.sql
```

## 部署指令

```bash
ls -la arc-v13-formal-v43-2-receipt-order-release-update.zip

printf "\n.env\n.env.local\nnode_modules\ndist\n*.zip\ntsconfig.tsbuildinfo\n*.tsbuildinfo\n" >> .gitignore

rm -rf src public supabase scripts dist node_modules
rm -f package-lock.json package.json index.html tsconfig.json vite.config.ts README.md BUILD_CHECK.txt

unzip -o arc-v13-formal-v43-2-receipt-order-release-update.zip

test -f package.json && echo "package.json OK"
test -f src/pages/FaxPickupPage.tsx && echo "傳真領件 OK"
test -f src/api/repository.ts && echo "repository OK"
test -f supabase/migrations/202607030014_arc_v13_v43_2_receipt_order_release_fix.sql && echo "SQL OK"

npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build

git status
git add -A
git commit -m "update ARC V13.43.2 receipt order release fix"
git push origin main
```
