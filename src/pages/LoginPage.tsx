import { FormEvent, useState } from 'react';
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { hasSupabaseEnv, REMEMBER_LOGIN_KEY } from '../lib/supabase';

export function LoginPage() {
  const { signIn } = useAuth();
  const { pushToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => window.localStorage.getItem(REMEMBER_LOGIN_KEY) === '1');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email.trim(), password, remember);
      pushToast({ type: 'success', title: '登入成功' });
    } catch (err) {
      pushToast({ type: 'error', title: '登入失敗', message: err instanceof Error ? err.message : '請確認帳號密碼' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-logo large"><img src="/arc-logo.png" alt="ARC" /></div>
          <div>
            <h1>ARC 居留證控管系統</h1>
            <p>案件登記・繳費・財務對帳・傳真領件・統計匯出</p>
          </div>
        </div>
        {!hasSupabaseEnv ? (
          <div className="alert warning">尚未設定 .env，請填入 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。</div>
        ) : null}
        <form onSubmit={submit} className="login-form">
          <label>
            <span>Email</span>
            <div className="input-with-icon"><Mail size={18} /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required /></div>
          </label>
          <label>
            <span>密碼</span>
            <div className="input-with-icon"><LockKeyhole size={18} /><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required /></div>
          </label>
          <label className="checkbox-line">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>下次打開直接登入</span>
          </label>
          <button className="primary-button full" type="submit" disabled={submitting}>{submitting ? '登入中...' : '登入'}</button>
        </form>
        <div className="login-note">
          <ShieldCheck size={16} /> 不會明文儲存密碼；自動登入只保存 Supabase session。
        </div>
      </section>
    </div>
  );
}
