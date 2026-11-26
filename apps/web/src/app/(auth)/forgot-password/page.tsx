'use client';
import { PopupNotice } from '@/components/FeedbackProvider';
import Icon from '@/components/Icon';
import { useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="midad wrap" dir="rtl" style={{ maxWidth: 520, padding: '80px 24px' }}>
      <Link href="/login">
        <Icon name="left" /> العودة إلى تسجيل الدخول
      </Link>
      <h1 className="sec-h2">استعادة كلمة المرور</h1>
      <form
        className="card pad"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            setMessage(res.ok
              ? 'إذا كان البريد مسجلًا، ستصلك رسالة برابط استعادة كلمة المرور.'
              : res.status === 429
                ? 'تكررت المحاولات. انتظر قليلًا ثم أعد المحاولة.'
                : 'تعذر إرسال طلب الاستعادة الآن. أعد المحاولة بعد قليل.');
          } catch {
            setMessage('تعذر الاتصال. تحقق من اتصالك ثم أعد المحاولة.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          البريد الإلكتروني لحسابك
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="btn btn-gold" disabled={busy}>
          {busy ? 'جارٍ الإرسال…' : 'إرسال رابط الاستعادة'}
        </button>
        {message && <PopupNotice title="رسالة الحساب">{message}</PopupNotice>}
      </form>
    </main>
  );
}
