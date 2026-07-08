# ARC V13.50.2｜Vercel TypeScript 建置修正版

此版接續 ARC V13.50.1，功能內容不新增，主要修正 Vercel Build Logs 顯示的 TypeScript 型別錯誤。

## 修正內容

1. `src/api/repository.ts`
   - 修正 `pending_payment` / `pending_pickup` 狀態判斷在 Vercel tsc 建置時被判定為 no overlap 的型別錯誤。
   - 不改變「移入傳真/領件」流程邏輯。

2. `src/utils/print.ts`
   - 統一列印資料型別 `SignaturePrintRow` / `PrintRow`。
   - 確保 `appItem` 欄位即使查無申請項目也會以 `undefined` 明確帶入，避免 optional / required 型別不一致。

3. `src/pages/FaxPickupPage.tsx`
   - 預計領件列印 rows 與傳真領件紀錄列印 rows 改用統一列印型別。
   - 修正批次列印簽收單、傳真單 + 簽收單的型別建置錯誤。

## SQL

V13.50.2 不需新增 SQL。

若尚未執行 V13.50 SQL，才需要先執行：

```text
supabase/migrations/202607030018_arc_v13_v50_payment_note.sql
```

## 建置檢查

已通過：

```bash
npx tsc --noEmit --pretty false
npm run build
```
