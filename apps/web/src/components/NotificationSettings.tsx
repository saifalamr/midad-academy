'use client';
import { PopupNotice } from '@/components/FeedbackProvider';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { API_URL } from '@/lib/config';
import './homework.css';
const statusLabels: Record<string, string> = {
  PENDING: 'بانتظار الإرسال',
  SENDING: 'جارٍ الإرسال',
  ACCEPTED: 'قبلها مزود واتساب',
  SKIPPED: 'لم تُرسل',
  FAILED: 'رفضها المزود',
  UNKNOWN: 'تحتاج فحص تأكيد الإرسال',
};
const kindLabels: Record<string, string> = {
  ENROLLMENT: 'تأكيد التسجيل',
  REPORT: 'تقرير الحصة',
  GRADE: 'نتيجة الواجب',
  REMINDER: 'تذكير الحصة',
};
type Data = {
  whatsappOptIn?: boolean;
  whatsappPhone?: string;
  enabled?: boolean;
  configured?: boolean;
  schedulerConfigured?: boolean;
  setupChecks?: { label: string; ready: boolean }[];
  notifications?: {
    id: string;
    kind: string;
    status: string;
    lastError: string;
    createdAt: string;
    recipient: { name: string };
  }[];
};
export default function NotificationSettings() {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [data, setData] = useState<Data>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setError('');
    fetch(`${API_URL}/api/notifications/${admin ? 'status' : 'preferences'}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
      },
      cache: 'no-store',
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw Error(json.error);
        if (!controller.signal.aborted) setData(json.data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [admin, user, revision]);
  async function toggle() {
    if (!data || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const r = await fetch(`${API_URL}/api/notifications/preferences`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ whatsappOptIn: !data.whatsappOptIn }),
      });
      const json = await r.json();
      if (!r.ok) throw Error(json.error);
      setData(json.data);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="homework-page" dir="rtl">
      <header>
        <span className="tag">التواصل مع الأسرة</span>
        <h1>{admin ? 'سجل رسائل واتساب' : 'رسائل واتساب'}</h1>
      </header>
      {error && (
        <PopupNotice role="alert" className="homework-error">
          {error} <button onClick={() => setRevision((n) => n + 1)}>إعادة المحاولة</button>
        </PopupNotice>
      )}
      {!data && !error && <p role="status">جارٍ التحميل…</p>}
      {data &&
        (admin ? (
          <>
            <section className="card">
              <h2>
                {data.enabled && data.configured ? 'الإرسال مفعّل' : 'الإرسال التلقائي غير مفعّل'}
              </h2>
              <p>
                رسائل تأكيد التسجيل وتقارير الحصص ودرجات الواجبات والتذكير قبل الحصة بعشر دقائق.
              </p>
              <ul aria-label="جاهزية خدمة واتساب">
                {data.setupChecks?.map((check) => (
                  <li key={check.label}>
                    {check.label}: {check.ready ? 'جاهز' : 'يحتاج إعداد'}
                  </li>
                ))}
              </ul>
              <p>
                {data.schedulerConfigured
                  ? 'مفتاح تشغيل المجدول جاهز.'
                  : 'مفتاح تشغيل المجدول الخارجي لم يُضبط.'}{' '}
                التشغيل الدقيق أثناء سكون الخادم يحتاج مجدولًا خارجيًا يعمل باستمرار.
              </p>
              <p>
                قبول المزود للرسالة لا يؤكد وصولها. حالات التأكيد غير المعروف تحتاج مراجعة المزود.
              </p>
              <button className="btn btn-outline" onClick={() => setRevision((n) => n + 1)}>
                تحديث السجل
              </button>
            </section>
            {data.notifications?.length ? (
              data.notifications.map((item) => (
                <article key={item.id} className="card">
                  <h3>
                    {kindLabels[item.kind] || item.kind} · {item.recipient.name}
                  </h3>
                  <p>{statusLabels[item.status] || item.status}</p>
                  {item.lastError && <p>{item.lastError}</p>}
                  <time>{new Date(item.createdAt).toLocaleString('ar')}</time>
                </article>
              ))
            ) : (
              <p>لا توجد رسائل مسجلة بعد.</p>
            )}
          </>
        ) : (
          <section className="card">
            <h2>إشعارات أبنائك</h2>
            <p>
              رقم واتساب المسجل: <b dir="ltr">{data.whatsappPhone || 'لم يُضف رقم'}</b>
            </p>
            <p>
              يمكن للأكاديمية إرسال تأكيد التسجيل وتذكير الحصة وتقرير المعلم ونتيجة الواجب إلى هذا
              الرقم بعد تفعيل خدمة الإرسال.
            </p>
            <p>حالة الموافقة: {data.whatsappOptIn ? 'موافق على الرسائل' : 'الرسائل متوقفة'}</p>
            <button className="btn btn-gold" disabled={saving} onClick={toggle}>
              {saving
                ? 'جارٍ الحفظ…'
                : data.whatsappOptIn
                  ? 'إيقاف الرسائل'
                  : 'أوافق على رسائل واتساب'}
            </button>
            {saved && <p role="status">تم حفظ اختيارك.</p>}
          </section>
        ))}
    </main>
  );
}
