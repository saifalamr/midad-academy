'use client';
import { PopupNotice } from '@/components/FeedbackProvider';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { API_URL } from '@/lib/config';
import './homework.css';
import './notification-settings.css';
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
        if (!r.ok) throw new Error();
        const json = await r.json();
        if (!controller.signal.aborted) setData(json.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('تعذر تحميل التنبيهات الآن. حاول مرة أخرى.');
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
      if (!r.ok) throw new Error();
      const json = await r.json();
      setData(json.data);
      setSaved(true);
    } catch {
      setError('تعذر حفظ اختيارك الآن. حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <main
      className={`homework-page notification-settings${admin ? ' notification-settings--admin' : ''}`}
      dir="rtl"
    >
      <header>
        <span className="eyebrow">التواصل مع الأسرة</span>
        <h1>{admin ? 'إعدادات التنبيهات' : 'رسائل واتساب'}</h1>
        <p>
          {admin
            ? 'حالة الإرسال وسجل الرسائل، مرتّبان للمراجعة.'
            : 'اختر إذا كنت ترغب باستقبال رسائل الأكاديمية.'}
        </p>
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
            <section className="card notification-status">
              <span className="notification-state-dot" aria-hidden="true" />
              <h2>
                {data.enabled && data.configured ? 'الإرسال مفعّل' : 'الإرسال التلقائي غير مفعّل'}
              </h2>
              <p>
                رسائل تأكيد التسجيل وتقارير الحصص ودرجات الواجبات والتذكير قبل الحصة بعشر دقائق.
              </p>
              <ul className="notification-checks" aria-label="جاهزية خدمة واتساب">
                {data.setupChecks?.map((check) => (
                  <li key={check.label}>
                    <span>{check.label}:</span>
                    <b className={check.ready ? 'ready' : ''}>
                      {check.ready ? 'جاهز' : 'يحتاج إعداد'}
                    </b>
                  </li>
                ))}
              </ul>
              <details className="notification-details">
                <summary>ملاحظات تشغيل الخدمة</summary>
                <p>
                  {data.schedulerConfigured
                    ? 'مفتاح تشغيل المجدول جاهز.'
                    : 'مفتاح تشغيل المجدول الخارجي لم يُضبط.'}{' '}
                  التشغيل الدقيق أثناء سكون الخادم يحتاج مجدولًا خارجيًا يعمل باستمرار.
                </p>
                <p>
                  قبول المزود للرسالة لا يؤكد وصولها. حالات التأكيد غير المعروف تحتاج مراجعة المزود.
                </p>
              </details>
              <button className="btn btn-outline" onClick={() => setRevision((n) => n + 1)}>
                تحديث السجل
              </button>
            </section>
            <h2 className="notification-list-title">آخر الرسائل</h2>
            {data.notifications?.length ? (
              data.notifications.map((item) => (
                <article key={item.id} className="card notification-log">
                  <h3>
                    {kindLabels[item.kind] || item.kind} · {item.recipient.name}
                  </h3>
                  <p className="notification-log-status">
                    {statusLabels[item.status] || 'تحتاج مراجعة'}
                  </p>
                  {item.lastError && (
                    <details className="notification-details">
                      <summary>تفاصيل الإخفاق للإدارة</summary>
                      <p>{item.lastError}</p>
                    </details>
                  )}
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
