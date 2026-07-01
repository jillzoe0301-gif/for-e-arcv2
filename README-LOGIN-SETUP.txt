ARC V13 登入帳號快速建立

1. 把這包解壓縮後，將 scripts/seed-users.mjs 複製到你的專案 scripts/seed-users.mjs，覆蓋原本檔案。
2. 在 VS Code 終端機確認目前位置是專案根目錄，也就是看得到 package.json。
3. 先執行：
   printf "\n.env\n.env.local\nnode_modules\ndist\n" >> .gitignore
4. 再執行：
   npm run seed:users
5. 依畫面貼上 Supabase Project URL。
6. 依畫面貼上 Supabase service_role key 或 sb_secret_ 開頭的 Secret key。
7. 完成後用以下帳號登入：
   Email：jillzoe@forwardhrm.com.tw
   密碼：123456

注意：
- 請先在 Supabase SQL Editor 執行正式版 schema SQL。
- .env 不可 commit 到 GitHub。
- service_role / secret key 不可放到 Vercel 前端環境變數。
