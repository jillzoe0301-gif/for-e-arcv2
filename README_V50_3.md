# ARC V13.50.3｜Vercel 部署流程修正版

此版接續 ARC V13.50.2，功能內容不新增，主要處理 Vercel 仍未部署成功時可能遇到的舊快取 / tsbuildinfo / 舊 commit 問題。

## 本版調整

1. `package.json` 的 build 指令由：

```bash
tsc -b && vite build
```

調整為：

```bash
tsc --noEmit --pretty false && vite build
```

避免 Vercel 使用或產生 `tsconfig.tsbuildinfo` 造成快取干擾。

2. 新增 `.gitignore`，排除：

- `node_modules/`
- `dist/`
- `.vercel/`
- `.vite/`
- `tsconfig.tsbuildinfo`
- `.env` / `.env.local`

3. 保留 V13.50.2 已修正項目：

- 簽收單 / 領件單依「張數」加總
- 傳真領件紀錄批次只保留一個「列印簽收單」
- 居留證繳費可移入傳真/領件
- 財務對帳完成可輸入備註
- Vercel TypeScript 型別錯誤修正

## SQL

不需新增 SQL。

若尚未執行 V13.50 SQL，才需要先執行：

```text
supabase/migrations/202607030018_arc_v13_v50_payment_note.sql
```

## 部署前建議

請先刪除本機殘留建置檔，再重新安裝與建置：

```bash
rm -rf node_modules dist .vite .vercel tsconfig.tsbuildinfo
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
```

## Commit 建議

```bash
git status
git add -A
git commit -m "fix ARC V13.50.3 vercel deployment cache build"
git push origin main
```
