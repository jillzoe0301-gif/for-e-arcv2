import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { clearRememberLogin, hasSupabaseEnv, setRememberLogin, supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  changeOwnPassword: (oldPassword: string, newPassword: string) => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId || !hasSupabaseEnv) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    setProfile(data as Profile | null);
  }, []);

  const reloadProfile = useCallback(async () => {
    await loadProfile(user?.id);
  }, [loadProfile, user?.id]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        if (!hasSupabaseEnv) return;
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        await loadProfile(data.session?.user.id);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) loadProfile(nextSession.user.id).catch(console.error);
      else setProfile(null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    if (!hasSupabaseEnv) throw new Error('尚未設定 Supabase 環境變數。');
    setRememberLogin(remember);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const displayName = data.user?.user_metadata?.display_name ?? email;
    if (data.user) {
      const { data: profileRow, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profileRow || !profileRow.is_active || profileRow.deleted_at) {
        await supabase.auth.signOut();
        clearRememberLogin();
        throw new Error('此帳號已停用或刪除，請聯絡管理員。');
      }
      await supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id);
      await supabase.from('audit_logs').insert({
        action_type: '登入',
        actor_id: data.user.id,
        actor_name: profileRow.display_name ?? displayName,
        page_name: '登入',
        new_data: { email }
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    if (user) {
      await supabase.from('audit_logs').insert({
        action_type: '登出',
        actor_id: user.id,
        actor_name: profile?.display_name ?? user.email,
        page_name: '登出',
        old_data: { email: user.email }
      });
    }
    clearRememberLogin();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, [profile?.display_name, user]);


  const changeOwnPassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!hasSupabaseEnv) throw new Error('尚未設定 Supabase 環境變數。');
    if (!user?.email) throw new Error('找不到目前登入帳號。');
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
    if (verifyError) throw new Error('原密碼不正確。');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    await supabase.from('audit_logs').insert({
      action_type: '修改自己的密碼',
      actor_id: user.id,
      actor_name: profile?.display_name ?? user.email,
      page_name: '個人設定',
      record_table: 'profiles',
      record_id: profile?.id ?? user.id,
      new_data: { email: user.email, message: '使用者已修改自己的密碼，未保存明文密碼。' }
    });
  }, [profile?.display_name, profile?.id, user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    profile,
    loading,
    signIn,
    signOut,
    changeOwnPassword,
    reloadProfile
  }), [changeOwnPassword, loading, profile, reloadProfile, session, signIn, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
