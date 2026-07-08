# ARC V13.50.4

本版以 V13.50.3 為基礎，修正【傳真/領件】→【移民署傳真領件】列表操作欄。

## 本次修正

- 移除【移民署傳真領件】每筆案件後方的「列印簽收單」按鈕。
- 每筆案件操作保留：
  - 加入預計
  - 單筆領件
  - 已領件
- 保留【預計領件區】上方整批「列印簽收單」按鈕。
- 保留【傳真領件紀錄】每個批次一個「列印簽收單」按鈕。
- 不異動 SQL。

## 建置

```bash
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run build
```

## 部署

```bash
git status
git add -A
git commit -m "fix ARC V13.50.4 remove row signature print button"
git push origin main
```
