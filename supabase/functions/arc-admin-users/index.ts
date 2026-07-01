// Supabase Edge Function: arc-admin-users
// 作用：管理員帳號新增、停用、刪除、密碼重設。
// 部署：supabase functions deploy arc-admin-users --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase function secrets.');

    const authorization = req.headers.get('authorization') ?? '';
    const token = authorization.replace('Bearer ', '');
    if (!token) throw new Error('Missing authorization token.');

    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userResult, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userResult.user) throw new Error('Invalid user token.');

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userResult.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'admin' || !profile.is_active) throw new Error('Only admin can manage users.');

    const body = await req.json();
    const action = body.action;

    if (action === 'createUser') {
      const { email, password, display_name, role } = body;
      if (!email || !password || !display_name || !role) throw new Error('Missing createUser fields.');
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name }
      });
      if (error) throw error;
      const userId = data.user.id;
      const { error: upsertError } = await adminClient.from('profiles').upsert({
        id: userId,
        email,
        display_name,
        role,
        is_active: true,
        must_change_password: true
      });
      if (upsertError) throw upsertError;
      await writeAudit(adminClient, profile, '新增帳號', '帳號設定', 'profiles', userId, null, { email, display_name, role });
      return json({ ok: true, userId });
    }

    if (action === 'updateProfile') {
      const { userId, profile: patch } = body;
      if (!userId || !patch) throw new Error('Missing updateProfile fields.');
      const { data: oldData } = await adminClient.from('profiles').select('*').eq('id', userId).maybeSingle();
      const { error } = await adminClient.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
      await writeAudit(adminClient, profile, '修改帳號', '帳號設定', 'profiles', userId, oldData, patch);
      return json({ ok: true });
    }

    if (action === 'resetPassword') {
      const { userId, password } = body;
      if (!userId || !password) throw new Error('Missing resetPassword fields.');
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await adminClient.from('profiles').update({ must_change_password: true }).eq('id', userId);
      await writeAudit(adminClient, profile, '密碼重設', '帳號設定', 'profiles', userId, null, { must_change_password: true });
      return json({ ok: true });
    }

    if (action === 'deleteUser') {
      const { userId } = body;
      if (!userId) throw new Error('Missing deleteUser fields.');
      const { data: oldData } = await adminClient.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (oldData) {
        await adminClient.from('deleted_records').insert({
          table_name: 'profiles',
          record_id: userId,
          data: oldData,
          deleted_by: profile.id,
          deleted_by_name: profile.display_name
        });
      }
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      await writeAudit(adminClient, profile, '刪除帳號', '帳號設定', 'profiles', userId, oldData, null);
      return json({ ok: true });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function writeAudit(client: ReturnType<typeof createClient>, actor: Record<string, unknown>, actionType: string, pageName: string, table: string, recordId: string, oldData: unknown, newData: unknown) {
  await client.from('audit_logs').insert({
    action_type: actionType,
    actor_id: actor.id,
    actor_name: actor.display_name,
    page_name: pageName,
    record_table: table,
    record_id: recordId,
    old_data: oldData,
    new_data: newData
  });
}
