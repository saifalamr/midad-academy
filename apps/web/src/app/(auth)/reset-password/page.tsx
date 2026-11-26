'use client';
import { PopupNotice } from '@/components/FeedbackProvider';
import Icon from '@/components/Icon';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
export default function ResetPassword() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get('token') ?? '';
    setToken(resetToken);
    if (resetToken) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);
  return (
    <main className="midad wrap" dir="rtl" style={{ maxWidth: 520, padding: '80px 24px' }}>
      <Link href="/login">
        <Icon name="left" /> العودة إلى تسجيل الدخول
      </Link>
      <h1 className="sec-h2">اختيار كلمة مرور جديدة</h1>
      <form
        className="card pad"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const res = await fetch(`${API_URL}/api/auth/reset-password`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, password }),
            });
            setMessage(res.ok
              ? 'تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.'
              : res.status === 400
                ? 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.'
                : res.status === 429
                  ? 'تكررت المحاولات. انتظر قليلًا ثم أعد المحاولة.'
                  : 'تعذر تحديث كلمة المرور الآن. أعد المحاولة بعد قليل.');
            if (res.ok) {
              setDone(true);
              localStorage.removeItem('token');
              sessionStorage.removeItem('token');
            }
          } catch {
            setMessage('تعذر الاتصال. تحقق من اتصالك ثم أعد المحاولة.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          كلمة المرور الجديدة
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn btn-gold" disabled={busy || done || !token}>
          تحديث كلمة المرور
        </button>
        {message && <PopupNotice title="رسالة الحساب">{message}</PopupNotice>}
        {done && (
          <Link href="/login">
            تسجيل الدخول بكلمة المرور الجديدة <Icon name="right" />
          </Link>
        )}
      </form>
    </main>
  );
}
