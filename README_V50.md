# ARC V13.50｜正式穩定整理版：簽收單張數、移入傳真領件、財務備註

> V13.50.4 補強：移除移民署傳真領件列表每筆案件的「列印簽收單」按鈕；保留批次列印。

本版包含 V13.49 與 V13.50 修正：

- 簽收單 / 領件單「本承辦總領件數」改為「本承辦總張數」，依案件張數加總。
- 單筆簽收單依該筆案件張數顯示本承辦總張數。
- 批次簽收單依承辦分組，每位承辦各自加總張數。
- 傳真領件紀錄每個批次只保留一個「列印簽收單」按鈕，依整批列印。
- 居留證繳費每筆待繳案件新增「移入傳真/領件」按鈕。
- 移入傳真/領件不建立繳費批次、不扣款、不進財務對帳確認，案件直接進移民署傳真領件。
- 財務對帳確認點選「對帳完成」時可輸入備註，備註非必填。
- 財務查詢批次摘要可看到對帳備註。

## Supabase

請先執行：

```text
supabase/migrations/202607030018_arc_v13_v50_payment_note.sql
```

## 部署

```bash
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
git add -A
git commit -m "update ARC V13.50 stable finance note and fax flow"
git push origin main
```
