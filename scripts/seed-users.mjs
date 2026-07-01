import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const USERS = [
  { display_name: '若儀', role: 'admin', email: 'jillzoe@forwardhrm.com.tw' },
  { display_name: '嘉陽', role: 'admin', email: 'patty@forwardhrm.com.tw' },
  { display_name: '明書', role: 'admin', email: 'mint@forwardhrm.com.tw' },
  { display_name: '詩涵', role: 'staff', email: 'rachel@forwardhrm.com.tw' },
  { display_name: '佩珊', role: 'staff', email: 'penny@forwardhrm.com.tw' },
  { display_name: '晏婷', role: 'staff', email: 'helen@forwardhrm.com.tw' },
  { display_name: '奕君', role: 'staff', email: 'jean_guo@forwardhrm.com.tw' },
  { display_name: '莞莞', role: 'staff', email: 'maru@forwardhrm.com.tw' },
  { display_name: '芸瑄', role: 'finance', email: 'nina@forwardhrm.com.tw' },
  { display_name: '淑娥', role: 'finance', email: 'joy@forwardhrm.com.tw' }
];

function parseEnv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readEnvFile() {
  if (!fs.existsSync('.env')) return {};
  return parseEnv(fs.readFileSync('.env', 'utf8'));
}

function mergeEnvFile(values) {
  const current = readEnvFile();
  const next = { ...current, ...values };
  const lines = Object.entries(next)
    .filter(([_, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${key}=${String(value).trim()}`);
  fs.writeFileSync('.env', `${lines.join('\n')}\n`, 'utf8');
}

function maskKey(key) {
  if (!key) return '';
  if (key.length <= 12) return '********';
  return `${key.slice(0, 8)}...${key.slice(-6)}`;
}

async function ensureRequiredInput() {
  const fileEnv = readEnvFile();
  let url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || fileEnv.SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SECRET_KEY;

  const rl = readline.createInterface({ input, output });
  try {
    if (!url) {
      url = (await rl.question('請貼上 Supabase Project URL，例如 https://xxxxx.supabase.co：')).trim();
    }
    if (!serviceKey) {
      serviceKey = (await rl.question('請貼上 Supabase service_role key 或 sb_secret_ 開頭的 Secret key：')).trim();
    }
  } finally {
    rl.close();
  }

  if (!url || !/^https:\/\/[^\s]+\.supabase\.co\/?$/.test(url)) {
    console.error('\n❌ Supabase URL 格式看起來不正確。');
    process.exit(1);
  }

  if (!serviceKey || serviceKey.length < 40) {
    console.error('\n❌ service_role / secret key 看起來不正確。');
    process.exit(1);
  }

  mergeEnvFile({
    VITE_SUPABASE_URL: url.replace(/\/$/, ''),
    SUPABASE_SERVICE_ROLE_KEY: serviceKey
  });

  return { url: url.replace(/\/$/, ''), serviceKey };
}

async function main() {
  console.log('\nARC V13 預設登入帳號建立工具');
  console.log('--------------------------------');
  console.log('會建立 / 更新 Supabase Auth 使用者與 public.profiles。');
  console.log('初始密碼全部是：123456\n');

  const { url, serviceKey } = await ensureRequiredInput();
  console.log(`Supabase URL：${url}`);
  console.log(`Secret Key：${maskKey(serviceKey)}\n`);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: existingList, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    console.error('❌ 無法讀取 Supabase Auth users。請確認 service_role / secret key 是否正確。');
    throw listError;
  }

  const existingByEmail = new Map(
    existingList.users
      .filter((user) => user.email)
      .map((user) => [user.email.toLowerCase(), user])
  );

  for (const user of USERS) {
    const existing = existingByEmail.get(user.email.toLowerCase());
    let authUser = existing;

    if (!authUser) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: '123456',
        email_confirm: true,
        user_metadata: { display_name: user.display_name }
      });
      if (error) {
        console.error(`❌ 建立 Auth 使用者失敗：${user.email}`);
        throw error;
      }
      authUser = data.user;
      console.log(`✅ 建立 Auth：${user.display_name}｜${user.email}`);
    } else {
      const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: '123456',
        user_metadata: { display_name: user.display_name }
      });
      if (error) {
        console.error(`❌ 更新 Auth 使用者失敗：${user.email}`);
        throw error;
      }
      console.log(`✅ 更新 Auth：${user.display_name}｜${user.email}`);
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: authUser.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      is_active: true,
      must_change_password: true
    }, { onConflict: 'id' });

    if (profileError) {
      console.error(`❌ 寫入 public.profiles 失敗：${user.email}`);
      console.error('請先確認你已經在 Supabase SQL Editor 執行正式版 schema SQL。');
      throw profileError;
    }
  }

  console.log('\n完成！現在可以登入：');
  console.log('Email：jillzoe@forwardhrm.com.tw');
  console.log('密碼：123456');
  console.log('\n提醒：.env 內的 service_role / secret key 不可以 commit 到 GitHub，也不要放到 Vercel 前端環境變數。');
}

main().catch((error) => {
  console.error('\n完整錯誤：');
  console.error(error);
  process.exit(1);
});
