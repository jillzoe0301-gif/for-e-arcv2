# ARC V51.1 Codespaces 重新部署

本更新包為完整專案檔，可直接覆蓋目前 Codespaces 的 `/workspaces/for-e-arcv2`。

## 使用方式

1. 將壓縮檔上傳到 `/workspaces/for-e-arcv2` 根目錄。
2. 在 bash 終端機執行：

```bash
cd /workspaces/for-e-arcv2
rm -rf /tmp/arc-v51-1-full
mkdir -p /tmp/arc-v51-1-full
unzip -o arc-v13-formal-v51-1-full-redeploy.zip -d /tmp/arc-v51-1-full
bash /tmp/arc-v51-1-full/deploy-v51-1.sh /workspaces/for-e-arcv2
```

腳本會自動：
- 覆蓋完整程式檔
- 檢查版本
- 執行 npm install
- 執行 npm run build
- git add / commit
- push 到 origin main

部署後系統版本應顯示 `ARC V13.51`。
