# ARC V13.49｜正式穩定整理版

本版在 V13.48 基礎上整理為正式穩定版，並加入本次修正：

- 簽收單下方「本承辦總領件數」改為「本承辦總張數」，數字改依案件張數加總。
- 單筆簽收單若該案張數為 2，會顯示本承辦總張數：2 張。
- 批次簽收單依承辦分組後，各承辦區塊分別加總該承辦案件張數。
- 傳真領件紀錄列表新增單一「列印簽收單」按鈕，可直接依該批次列印整批簽收單。
- 傳真領件紀錄明細不新增多個簽收單按鈕，避免操作重複。

## 部署

本版不需要新增 Supabase SQL。若前面 V45 的 copy_count SQL 已跑過，可直接更新前端。

```bash
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
git add -A
git commit -m "update ARC V13.49 stable signature print"
git push origin main
```
