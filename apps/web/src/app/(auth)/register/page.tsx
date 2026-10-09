'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role: 'parent', whatsappPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message || 'Registration failed');
        return;
      }

      router.push('/login');
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
          <img
            src="/midad-logo-transparent.png"
            alt="Midad Academy"
            className="logo-full logo-white"
          />
        </Link>

        <div className="auth-side-body">
          <h2 className="auth-head">Begin the journey today.</h2>
          <p className="ar auth-head-ar">ابدأ رحلة التعلّم اليوم</p>
          <ul className="auth-perks">
            <li>Browse available courses before enrolling</li>
            <li>Live lessons with your course teacher</li>
            <li>Monthly courses managed by the academy</li>
            <li>Parent dashboard for linked children</li>
          </ul>
        </div>

        <div className="auth-side-foot">© 2026 Midad Academy</div>
      </aside>

      {/* ── Right side ──────────────────────────────────────── */}
      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-top-link">
            Already a member? <Link href="/login">Log in</Link>
          </div>

          <h1 className="auth-title">إنشاء حساب ولي الأمر</h1>
          <p className="auth-sub">
            بعد التسجيل والتواصل مع الأكاديمية، تضيف الإدارة أبناءك وتمنحهم حساباتهم الخاصة.
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="name">
                Full name <span className="ar muted">الاسم الكامل</span>
              </label>
              <input
                id="name"
                className="input"
                type="text"
                required
                placeholder="e.g. Sara Al-Amin"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

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

            <div className="grid-2">
              <div className="field">
                <label htmlFor="password">
                  Password <span className="ar muted">كلمة المرور</span>
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="whatsappPhone">رقم واتساب مع مفتاح الدولة</label>
                <input
                  id="whatsappPhone"
                  className="input"
                  dir="ltr"
                  type="tel"
                  autoComplete="tel"
                  required
                  pattern="\+[1-9][0-9]{7,14}"
                  placeholder="+9665XXXXXXXX"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value.replace(/[\s()-]/g, ''))}
                />
                <small>مثال: +966 ثم الرقم، بدون صفر البداية.</small>
              </div>
            </div>

            <label className="check check-block">
              <input type="checkbox" required />I agree to the{' '}
              <Link href="/terms" className="link-gold">
                Terms
              </Link>{' '}
              &amp;{' '}
              <Link href="/privacy" className="link-gold">
                Privacy Policy
              </Link>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-gold btn-block btn-lg"
              style={{ opacity: loading ? 0.65 : 1 }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
