'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
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
        setError(json.error || 'Login failed');
        return;
      }

      localStorage.setItem('token', json.data.token);

      const role: string = json.data.user?.role?.toLowerCase() ?? '';
      if (role === 'teacher') router.push('/teacher');
      else if (role === 'parent') router.push('/parent');
      else router.push('/student');
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="midad auth">
      {/* ── Left side ───────────────────────────────────────── */}
      <aside className="auth-side geo-navy">
        <Link className="brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/midad-logo-transparent.png" alt="Midad Academy" className="logo-full logo-white" />
        </Link>

        <div className="auth-side-body">
          <h2 className="auth-head">Welcome back to the academy.</h2>
          <p className="ar auth-head-ar">أهلاً بعودتك إلى مداد</p>
          <p className="auth-side-p">Pick up right where you left off — your classes, progress and badges are waiting.</p>
          <div className="card-glass auth-quote">
            <p>&ldquo;My daughter asks to log in every single day. The teachers are wonderful.&rdquo;</p>
            <div className="aq-by">
              <span className="avatar" style={{ width: 34, height: 34 }}>ر</span>
              Rana · Parent of 2
            </div>
          </div>
        </div>

        <div className="auth-side-foot">© 2026 Midad Academy</div>
      </aside>

      {/* ── Right side ──────────────────────────────────────── */}
      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-top-link">
            New here? <Link href="/register">Create an account</Link>
          </div>

          <h1 className="auth-title">Log in</h1>
          <p className="auth-sub">Enter your details to continue. <span className="ar">تسجيل الدخول</span></p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">
                Email address <span className="ar muted">البريد الإلكتروني</span>
              </label>
              <input
                id="email"
                className="input"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="password">
                Password <span className="ar muted">كلمة المرور</span>
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
                <button type="button" className="eye" aria-label="Toggle password" onClick={() => setShowPw((v) => !v)}>
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <div className="auth-row">
              <label className="check">
                <input type="checkbox" defaultChecked /> Remember me
              </label>
              <a href="#" className="link-gold">Forgot password?</a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-gold btn-block btn-lg"
              style={{ opacity: loading ? 0.65 : 1 }}
            >
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>

          <div className="auth-or"><span>or continue with</span></div>
          <div className="auth-social">
            <button className="social-btn">Google</button>
            <button className="social-btn">Apple</button>
          </div>
        </div>
      </div>
    </div>
  );
}
