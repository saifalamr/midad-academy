'use client';

import { AuthIdentity, AuthBackdrop } from '@/components/AuthIdentity';
import { PopupNotice } from '@/components/FeedbackProvider';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'تعذر تسجيل الدخول');
        return;
      }

      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      (remember ? localStorage : sessionStorage).setItem('token', json.data.token);
      window.dispatchEvent(new Event('midad-auth'));

      const role: string = json.data.user?.role?.toLowerCase() ?? '';
      if (role === 'admin') router.push('/admin');
      else if (role === 'teacher') router.push('/teacher');
      else if (role === 'parent') {
        const pending = sessionStorage.getItem('midad-return-to');
        sessionStorage.removeItem('midad-return-to');
        router.push(pending && /^\/academy(?:\?|$)/.test(pending) ? pending : '/parent');
      }
      else router.push('/student');
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="midad auth" lang="ar">
      {/* ── Left side ───────────────────────────────────────── */}
      <aside className="auth-side geo-navy" dir="rtl">
        <Link className="brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/midad-logo-transparent.png"
            alt="Midad Academy"
            className="logo-full logo-white"
          />
        </Link>

        <div className="auth-side-body">
          <h2 className="auth-head">أهلاً بعودتك إلى مداد</h2>
          <p className="ar auth-head-ar">نلتقي لنكتشف ونتعلّم</p>
          <p className="auth-side-p">
            حصصك، واجباتك وتقدّمك، كلها في مكان واحد.
          </p>
          <div className="card-glass auth-quote">
            <p>كل حرف بداية، وكل درس خطوة جديدة.</p>
          </div>
        </div>

        <div className="auth-side-foot">© 2026 Midad Academy</div>
      </aside>

      {/* ── Right side ──────────────────────────────────────── */}
      <div className="auth-main">
        <AuthBackdrop />
        <div className="auth-card" dir="rtl">
          <AuthIdentity />
          <div className="auth-top-link">
            جديد في مداد؟ <Link href="/register">إنشاء حساب ولي أمر</Link>
          </div>

          <h1 className="auth-title">تسجيل الدخول</h1>
          <p className="auth-sub">
            أدخل بياناتك لنكمل رحلة التعلّم.
          </p>

          {error && <PopupNotice className="auth-error">{error}</PopupNotice>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">
                البريد الإلكتروني أو اسم المستخدم
              </label>
              <input
                id="email"
                className="input"
                type="text"
                autoComplete="username"
                required
                placeholder="البريد الإلكتروني أو اسم المستخدم"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="password">
                كلمة المرور
              </label>
              <div className="input-wrap">
                <input
                  id="password"
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  className="eye"
                  aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="auth-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />{' '}
                تذكّرني
              </label>
              <Link className="link-gold" href="/forgot-password">
                نسيت كلمة المرور؟
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-gold btn-block btn-lg"
              style={{ opacity: loading ? 0.65 : 1 }}
            >
              {loading ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          textAlign: 'center',
          padding: '8px',
          fontSize: '12px',
          color: '#fff',
          background: 'rgba(16,30,52,0.9)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
          borderTop: '1px solid var(--line)',
        }}
      >
        made by DOPIXA
      </div>
    </div>
  );
}
