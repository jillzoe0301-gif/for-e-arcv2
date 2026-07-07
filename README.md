# ARC V13.43 更新說明

本版修正【居留案件登記】與【傳真/領件】欄位與輸入邏輯。

## 本版重點

- 居留案件登記新增「張數」欄位。
- 單筆案件登記、批次送件、現場申請都可輸入張數。
- 張數預設為 1，只允許正整數。
- 舊案件若沒有張數，資料庫會自動補 1。
- 張數會帶入移民署傳真領件、預計領件區、列印、傳真領件紀錄與案件查詢。
- 傳真領件頁尚未正式加入預計領件區的手動 keyin 欄位，重新整理後會清空。
- 收件編號、外字五碼、收據順序、經手人後四碼、舊卡、收費日期等測試登打資料，不再永久殘留。
- 已加入預計領件區或已建立傳真領件紀錄的正式資料仍會保存。
- 收據順序輸入 10、11、12 等雙位數時，不會在輸入第一個 1 時就被擋住。
- 收據順序防重改為 blur、Enter、加入預計、一鍵加入、單筆領件、已領件等完成輸入後再檢查完整值。
- 收據順序防重仍排除自己本身，不會抓到張數欄位。
- 首頁版本更新為 ARC V13.43。

## 需要執行 Supabase SQL

請先到 Supabase SQL Editor 執行：

```sql
supabase/migrations/202607030012_arc_v13_v43_copy_count_fax_drafts.sql
```

此 SQL 會新增 `copy_count` 欄位，並補齊舊資料預設張數 1，同時清除未正式加入預計領件區的舊版傳真 keyin 暫存資料。

## 建議部署指令

```bash
ls -la arc-v13-formal-v43-update.zip

printf "\n.env\n.env.local\nnode_modules\ndist\n*.zip\ntsconfig.tsbuildinfo\n*.tsbuildinfo\n" >> .gitignore

rm -rf src public supabase scripts dist node_modules
rm -f package-lock.json package.json index.html tsconfig.json vite.config.ts README.md BUILD_CHECK.txt

unzip -o arc-v13-formal-v43-update.zip

test -f package.json && echo "package.json OK"
test -f src/pages/CaseRegistrationPage.tsx && echo "居留案件登記 OK"
test -f src/pages/FaxPickupPage.tsx && echo "傳真領件 OK"
test -f supabase/migrations/202607030012_arc_v13_v43_copy_count_fax_drafts.sql && echo "SQL OK"

npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build

git status
git add -A
git commit -m "update ARC V13.43 copy count fax draft input"
git push origin main
```
