# ARC V13 Formal｜V32 團號必填與已領件功能

## 本版重點

- 居留案件登記的團號改為必填。
- 單筆案件登記、批次送件、現場申請都會檢查團號。
- 批次送件逐列檢查，有錯誤列時不會送出任何資料。
- 傳真/領件的「移民署傳真領件」明細新增「已領件」按鈕。
- 已領件會要求輸入領件日，支援西元與民國日期格式，最後統一為 `yyyy-mm-dd`。
- 已領件後會把案件從待傳真/領件與預計領件區移除，案件保留於案件查詢，狀態顯示為「已領件」。
- 案件查詢新增顯示收費日期、傳真日期、領件日。
- 已領件動作會寫入操作紀錄。

## Supabase SQL

本版新增案件實際領件日欄位，請先執行：

```txt
supabase/migrations/202607020006_arc_v13_v32_group_pickup_done.sql
```

## 部署

```bash
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build

git add -A
git commit -m "update ARC V13 V32 group required pickup done"
git push origin main
```
