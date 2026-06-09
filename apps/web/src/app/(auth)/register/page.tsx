'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:4000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Registration failed');
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
        <Link className="brand brand-light" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/midad-mark.png" alt="Midad Academy" />
          <span className="bn"><b style={{ color: '#fff', fontSize: 20 }}>Midad</b><span style={{ color: 'var(--gold-200)' }}>ACADEMY</span></span>
        </Link>

        <div className="auth-side-body">
          <h2 className="auth-head">Begin the journey today.</h2>
          <p className="ar auth-head-ar">ابدأ رحلة التعلّم اليوم</p>
          <ul className="auth-perks">
            <li>First week completely free</li>
            <li>Certified native-speaking teachers</li>
            <li>Cancel anytime — no contracts</li>
            <li>Parent dashboard included on every plan</li>
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

          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">A few details and you&apos;re in. <span className="ar">إنشاء حساب جديد</span></p>

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
                <label htmlFor="role">
                  I am a… <span className="ar muted">الدور</span>
                </label>
                <select
                  id="role"
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="parent">Parent — وليّ أمر</option>
                  <option value="student">Student — طالب</option>
                  <option value="teacher">Teacher — معلّم</option>
                </select>
              </div>
            </div>

            <label className="check check-block">
              <input type="checkbox" required />
              I agree to the <a href="#" className="link-gold">Terms</a> &amp; <a href="#" className="link-gold">Privacy Policy</a>
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
