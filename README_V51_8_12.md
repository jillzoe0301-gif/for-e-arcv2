# ARC V13.51.8.12

## 財務對帳確認｜修改扣款帳戶
- 待對帳批次可修改扣款帳戶。
- 新帳戶限定為同仲介的啟用帳戶。
- 已對帳完成批次不可修改。
- 修改時同步：
  1. 原扣款帳戶沖回此批次實際帳務金額。
  2. 新扣款帳戶扣除相同帳務金額。
  3. payment_batches.account_id 更新。
  4. 批次內 arc_cases.payment_account_id 同步更新。
  5. 建立兩筆 account_transactions 與操作紀錄。
- 不需要 Supabase SQL。
