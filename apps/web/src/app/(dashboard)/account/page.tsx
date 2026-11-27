'use client';

import Icon from '@/components/Icon';
import { PopupNotice, showPopup } from '@/components/FeedbackProvider';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import './account.css';

type Profile = { name: string; email: string; role: string };

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
  });
  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/auth/me`, { headers: headers(), cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()).data as Profile;
      })
      .then((profile) => {
        if (active) {
          setUser(profile);
          setName(profile.name);
        }
      })
      .catch(() => {
        if (active) setError('تعذر تحميل الحساب. حدّث الصفحة وحاول مرة أخرى.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch(`${API_URL}/api/account/profile`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) throw new Error();
      setSaved(true);
      setUser((current) => (current ? { ...current, name: name.trim() } : current));
      window.dispatchEvent(new Event('midad-auth'));
    } catch {
      setError('تعذر حفظ الاسم الآن. تحقق منه وحاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('كلمتا المرور الجديدتان غير متطابقتين.');
      return;
    }
    setPasswordBusy(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ currentPassword, password }),
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? 'كلمة المرور الحالية غير صحيحة.'
            : response.status === 429
              ? 'تكررت المحاولات. انتظر قليلًا ثم أعد المحاولة.'
              : 'تعذر تغيير كلمة المرور الآن. حاول مرة أخرى.'
        );
        return;
      }
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      showPopup('تم تغيير كلمة المرور. سجّل الدخول مجددًا بالكلمة الجديدة.');
      window.dispatchEvent(new Event('midad-auth'));
      router.replace('/login');
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <main className="midad account-page" dir="rtl">
      <Link href={user ? `/${user.role.toLowerCase()}` : '/'} className="account-back">
        <Icon name="right" /> العودة للوحة التحكم
      </Link>
      <header className="account-heading">
        <span className="eyebrow">إعدادات الحساب</span>
        <h1>حسابي</h1>
        <p>بياناتك وأمان حسابك، في مكان واحد.</p>
      </header>
      {error && (
        <PopupNotice role="alert" className="account-error">
          {error}
        </PopupNotice>
      )}
      {saved && (
        <p role="status" className="account-saved">
          تم حفظ الاسم بنجاح.
        </p>
      )}
      <div className="account-grid">
        <section className="card account-panel">
          <span className="account-panel-icon">
            <Icon name="family" />
          </span>
          <h2>البيانات الأساسية</h2>
          <p>حدّث الاسم الذي يظهر في الأكاديمية.</p>
          <form onSubmit={saveProfile}>
            <label className="field">
              الاسم
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </label>
            <label className="field">
              البريد الإلكتروني
              <input className="input" value={user?.email ?? ''} readOnly dir="ltr" />
            </label>
            <button className="btn btn-gold" disabled={busy || !user}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ الاسم'}
            </button>
          </form>
        </section>
        <section className="card account-panel">
          <span className="account-panel-icon">
            <Icon name="lock" />
          </span>
          <h2>تغيير كلمة المرور</h2>
          <p>بعد التغيير، ستسجّل الدخول مجددًا لحماية حسابك.</p>
          <form onSubmit={changePassword}>
            <label className="field">
              كلمة المرور الحالية
              <input
                className="input"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <label className="field">
              كلمة المرور الجديدة
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              تأكيد كلمة المرور الجديدة
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <button className="btn btn-outline" disabled={passwordBusy || !user}>
              {passwordBusy ? 'جارٍ التغيير…' : 'تغيير كلمة المرور'}
            </button>
          </form>
        </section>
      </div>
      {user?.role === 'STUDENT' && (
        <section className="card account-family">
          <h2>حساب الأسرة</h2>
          <p>إدارة الأكاديمية تتولى ربط حسابك بولي أمرك وتسجيلك في الدورات.</p>
        </section>
      )}
    </main>
  );
}
