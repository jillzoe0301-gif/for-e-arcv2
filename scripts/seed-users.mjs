import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('請先設定 VITE_SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const users = [
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

for (const user of users) {
  const { data: existingList, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = existingList.users.find((entry) => entry.email?.toLowerCase() === user.email.toLowerCase());
  let userId = existing?.id;
  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: '123456',
      email_confirm: true,
      user_metadata: { display_name: user.display_name }
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`created auth user: ${user.email}`);
  } else {
    await supabase.auth.admin.updateUserById(userId, {
      password: '123456',
      email_confirm: true,
      user_metadata: { display_name: user.display_name }
    });
    console.log(`updated auth user: ${user.email}`);
  }

  const { error: upsertError } = await supabase.from('profiles').upsert({
    id: userId,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    is_active: true,
    must_change_password: true
  }, { onConflict: 'id' });
  if (upsertError) throw upsertError;
}

console.log('ARC 預設帳號已建立完成，初始密碼皆為 123456。');
