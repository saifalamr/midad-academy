'use client';

import { AuthIdentity, AuthBackdrop } from '@/components/AuthIdentity';
import { PopupNotice } from '@/components/FeedbackProvider';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import HomeThemeToggle from '@/components/HomeThemeToggle';
import '../auth-glass.css';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Midad-Client': 'browser' },
        body: JSON.stringify({
          name,
          email,
          password,
          role: 'parent',
          whatsappPhone,
          whatsappOptIn,
        }),
      });

      if (!res.ok) {
        setError(
          res.status === 409
            ? 'هذا البريد مسجل بالفعل. سجّل الدخول أو استعد كلمة المرور.'
            : res.status === 429
              ? 'تكررت محاولات التسجيل. انتظر قليلًا ثم أعد المحاولة.'
              : 'تعذر إنشاء الحساب الآن. راجع البيانات ثم أعد المحاولة.'
        );
        return;
      }

      // Finish the response before navigating, so the registration request is not aborted.
      await res.json();
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      localStorage.setItem('token', 'cookie');
      window.dispatchEvent(new Event('midad-auth'));
      const pending = sessionStorage.getItem('midad-return-to');
      sessionStorage.removeItem('midad-return-to');
      router.replace(
        pending && /^\/academy\?course=[a-zA-Z0-9_-]+$/.test(pending) ? pending : '/academy?start=1'
      );
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="midad auth auth-page auth-page--register"
      lang="ar"
      dir="rtl"
      data-home-theme="light"
    >
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
          <h2 className="auth-head">ابدأ رحلة طفلك مع مداد</h2>
          <p className="ar auth-head-ar">العربية أقرب، والتعلّم أجمل</p>
          <ul className="auth-perks">
            <li>استعرض الدورات واختر ما يناسب طفلك</li>
            <li>حصص مباشرة مع معلم طفلك</li>
            <li>دورات شهرية تنظمها الأكاديمية</li>
            <li>تابع حضور أبنائك وتقارير تقدّمهم</li>
          </ul>
        </div>

        <div className="auth-side-foot">مداد أكاديمي · تعلّم العربية بثقة</div>
      </aside>

      {/* ── Right side ──────────────────────────────────────── */}
      <div className="auth-main">
        <AuthBackdrop />
        <div className="auth-topbar">
          <Link href="/">العودة للرئيسية</Link>
          <HomeThemeToggle />
        </div>
        <div className="auth-card" dir="rtl">
          <AuthIdentity />
          <h1 className="auth-title">إنشاء حساب ولي الأمر</h1>
          <p className="auth-sub">
            بعدها تختار الدورة وتضيف طفلك في طلب واحد. سنوضح لك حالة الطلب والخطوة التالية.
          </p>

          {error && <PopupNotice className="auth-error">{error}</PopupNotice>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="name">الاسم الكامل</label>
              <input
                id="name"
                className="input"
                type="text"
                autoComplete="name"
                required
                placeholder="مثال: سارة الأمين"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="email">البريد الإلكتروني</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="password">كلمة المرور</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
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
                <small>مثال: +966 ثم الرقم دون صفر البداية.</small>
              </div>
            </div>

            <label className="check check-block">
              <input
                type="checkbox"
                checked={whatsappOptIn}
                onChange={(e) => setWhatsappOptIn(e.target.checked)}
              />{' '}
              أوافق على استلام تذكيرات الحصص وتقارير أبنائي ونتائج واجباتهم عبر واتساب. أقدر أوقفها
              من إعدادات الإشعارات.
            </label>
            <label className="check check-block">
              <input type="checkbox" required />
              أوافق على{' '}
              <Link href="/terms" className="link-gold">
                الشروط
              </Link>{' '}
              و{' '}
              <Link href="/privacy" className="link-gold">
                سياسة الخصوصية
              </Link>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-gold btn-block btn-lg"
              style={{ opacity: loading ? 0.65 : 1 }}
            >
              {loading ? 'جارٍ تجهيز حسابك…' : 'إنشاء الحساب ومتابعة تسجيل الطفل'}
            </button>
          </form>
          <p className="auth-bottom-link">
            لديك حساب بالفعل؟ <Link href="/login">تسجيل الدخول</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
