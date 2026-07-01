import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const REMEMBER_LOGIN_KEY = 'arc_v13_remember_login';

const hybridStorage: Storage = {
  get length() {
    return window.localStorage.length + window.sessionStorage.length;
  },
  clear() {
    window.localStorage.clear();
    window.sessionStorage.clear();
  },
  getItem(key: string) {
    const remember = window.localStorage.getItem(REMEMBER_LOGIN_KEY) === '1';
    return remember ? window.localStorage.getItem(key) : window.sessionStorage.getItem(key);
  },
  key(index: number) {
    return window.localStorage.key(index) ?? window.sessionStorage.key(index);
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
  setItem(key: string, value: string) {
    const remember = window.localStorage.getItem(REMEMBER_LOGIN_KEY) === '1';
    if (remember) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  }
};

export function setRememberLogin(remember: boolean): void {
  if (remember) window.localStorage.setItem(REMEMBER_LOGIN_KEY, '1');
  else window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
}

export function clearRememberLogin(): void {
  window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
}

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseAnonKey || 'anon-key', {
  auth: {
    storage: hybridStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
