# ARC V32 Cleanup Tool

這個工具只清理正式專案根目錄中的舊版、暫存、zip、patch、backup、test 殘留檔案，並檢查 SearchInput 中文注音邏輯、npm registry、build 狀態。

## 使用方式

1. 將 `arc-v32-cleanup-tool.zip` 上傳到 Codespaces 專案根目錄。
2. 解壓縮。
3. 執行：

```bash
bash scripts/arc-cleanup-v32.sh
```

成功後再執行：

```bash
git status
git add -A
git commit -m "cleanup ARC formal project old files and patches"
git push origin main
```

## 安全機制

- 執行前會確認正式專案必要檔案存在。
- 會建立 `.arc-cleanup-backup/arc-before-cleanup-時間.tar.gz` 本機備份。
- 會建立 `backup/arc-cleanup-時間` git 備份分支。
- 不會清除 `.env`，且會將 `.env`、`node_modules`、`dist`、`*.zip` 加入 `.gitignore`。
- 清理後會執行 `npm run build`。
