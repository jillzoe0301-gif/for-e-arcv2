# ARC V13.50.3

本版以 V13.50.2 為基礎，修正 Vercel 仍未部署成功時可能遇到的建置快取與 `tsconfig.tsbuildinfo` 干擾問題。

## 本次部署修正

- build 指令改為 `tsc --noEmit --pretty false && vite build`。
- 新增 `.gitignore`，避免提交 `node_modules`、`dist`、`.vercel`、`.vite`、`tsconfig.tsbuildinfo`。
- 保留 V13.50.2 已修正的 TypeScript 型別錯誤。
- 保留 V13.50 / V13.50.1 已完成功能：簽收單張數加總、傳真領件紀錄批次列印簽收單、居留證繳費移入傳真/領件、財務對帳備註。

## SQL

如果已執行 V13.50 SQL，V13.50.3 不需新增 SQL。

若尚未執行 V13.50 SQL，請先執行：

```text
supabase/migrations/202607030018_arc_v13_v50_payment_note.sql
```

## 本機檢查

```bash
rm -rf node_modules dist .vite .vercel tsconfig.tsbuildinfo
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
```

## Git / Vercel 部署

```bash
git status
git add -A
git commit -m "fix ARC V13.50.3 vercel deployment cache build"
git push origin main
```

Vercel 若仍顯示舊 commit，請到 Vercel 重新 Deploy 最新 commit，並選擇不使用快取。
