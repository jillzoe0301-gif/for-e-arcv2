# ARC V13 V37.2 財務明細欄位 Build 修正版

本版修正 V37.1 在 `src/api/repository.ts` 中誤把「項目金額修正紀錄」欄位插入到取消繳費、恢復待繳、刪除待繳與通用刪除流程，造成 Vercel build 出現 `Cannot find name 'batch'`、`correctedAmount` 等錯誤。

## 已保留 V37.1 明細欄位

財務對帳確認與財務查詢明細欄位維持：

- 案件編號
- 團號
- 雇主
- 工人
- 入境日
- 申請項目
- 項目金額
- 繳費日期
- 承辦
- 修正紀錄

## 本次修正

- 取消繳費、恢復待繳、刪除待繳、softDelete 回復為正確 audit new_data。
- 保留 correctPaymentItem 裡面的修正紀錄與批次總額重算。
- 不新增 Supabase SQL。

## 建議部署

```bash
ls -la arc-v13-formal-v37-2-update.zip

printf "\n.env\n.env.local\nnode_modules\ndist\n*.zip\ntsconfig.tsbuildinfo\n*.tsbuildinfo\n" >> .gitignore

rm -rf src public supabase scripts dist node_modules
rm -f package-lock.json package.json index.html tsconfig.json vite.config.ts README.md BUILD_CHECK.txt

unzip -o arc-v13-formal-v37-2-update.zip

test -f package.json && echo "package.json OK"
test -f src/api/repository.ts && echo "repository OK"
test -f src/pages/FinanceConfirmPage.tsx && echo "財務對帳確認 OK"
test -f src/pages/FinanceSearchPage.tsx && echo "財務查詢 OK"

npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build

git status
git add -A
git commit -m "fix ARC V13 V37.2 finance detail build"
git push origin main
```
