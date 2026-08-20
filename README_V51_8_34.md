# ARC V13.51.8.34｜案件重複新增修正

## 原因
單筆／批次送出原本只靠 React `submitting` state 控制按鈕 disabled。state 更新需要一次 render，快速連點、Enter 重複送出或極短時間內第二次事件仍可能在鎖定前再次呼叫 `createCases`。資料庫端也沒有短時間 idempotency 防護。

## 修正
- 所有案件送出入口共用 `useRef` 同步鎖，同一次送出尚未完成時立即阻止第二次送出。
- 批次送件在送出前檢查同批完全相同的案件列。
- Supabase `arc_cases` 新增 20 秒快速重複防護 trigger，使用 advisory lock，避免兩個近乎同時的請求寫入相同案件。
- 正式 Supabase 已由 ChatGPT 套用 migration；ZIP 仍保留 migration 檔供 Git 版本追蹤。

不需再手動執行 Supabase SQL。
