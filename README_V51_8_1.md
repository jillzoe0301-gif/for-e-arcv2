# ARC V13.51.8.1 Build Repair

修復 V13.51.8 部署時 Vite / Rolldown build 失敗問題。

- 財務對帳版面調整
- 居留證繳費三仲介色塊
- 單筆案件登記重新分組
- 補入 sortCasesByApplicationDateAndGroup
- 部署前清除 node_modules / dist，使用 npm ci 重新安裝鎖定相依套件
- build 成功才 commit / push
