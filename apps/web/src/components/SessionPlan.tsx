'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import Icon from './Icon';
import './session-plan.css';

type Material = {
  id: string;
  contentId: string;
  title: string;
  type: string;
  description: string;
  contentUrl: string;
};
type LibraryItem = { id: string; title: string; type: string; description: string };
type Session = {
  id: string;
  title: string;
  courseId: string;
  status: string;
  scheduledAt: string;
  materialsVersion: number;
  materials: Material[];
  course?: { title: string; timeZone: string };
};
async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.issues?.[0]?.message || json.error || 'تعذر تحميل الخطة');
  return json.data;
}
export default function SessionPlan({
  sessionId,
  editable,
}: {
  sessionId: string;
  editable: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const base = editable ? '/api/admin/sessions' : '/api/sessions';
  const dirty =
    !!session && JSON.stringify(ids) !== JSON.stringify(session.materials.map((m) => m.contentId));
  const canEdit = editable && session?.status === 'SCHEDULED';
  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const data = await request(`${base}/${sessionId}/materials`, { signal });
        if (signal.aborted) return;
        const item: Session = editable ? data.session : data;
        setSession(item);
        setLibrary(editable ? data.library : []);
        setIds(item.materials.map((m) => m.contentId));
      } catch (e) {
        if (!signal.aborted) setError(e instanceof Error ? e.message : 'تعذر التحميل');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [base, editable, sessionId]
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reload]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const byId = new Map(library.map((item) => [item.id, item]));
  const snapshots = new Map(session?.materials.map((item) => [item.contentId, item]));
  function move(index: number, offset: number) {
    setIds((previous) => {
      const next = [...previous];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
    setMessage('');
  }
  async function save() {
    if (!session || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated: Session = await request(`${base}/${sessionId}/materials`, {
        method: 'PUT',
        body: JSON.stringify({ version: session.materialsVersion, contentIds: ids }),
      });
      setSession(updated);
      setMessage('حُفظت مواد الحصة وترتيبها');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ؛ اختياراتك باقية');
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="session-plan" dir="rtl">
      <Link
        className="btn btn-outline btn-sm"
        href={editable ? '/admin' : '/teacher'}
        onClick={(e) => {
          if (dirty && !window.confirm('عندك تعديلات لم تُحفظ. تخرج من الصفحة؟'))
            e.preventDefault();
        }}
      >
        العودة إلى {editable ? 'الإدارة' : 'حصصي'}
      </Link>
      <header>
        <span className="tag">
          <Icon name="book" /> منهج الحصة
        </span>
        <h1>{session?.title || 'مواد الحصة'}</h1>
        <p>مواد تجهزها الإدارة للمعلم، مرتبة حسب خطوات الشرح.</p>
      </header>
      {loading && <p role="status">جارٍ تحميل خطة الحصة…</p>}
      {error && (
        <div className="plan-error" role="alert">
          {error}
          <button
            className="btn btn-outline btn-sm"
            disabled={saving}
            onClick={() => {
              if (!dirty || window.confirm('إعادة التحميل ستستبدل تعديلاتك غير المحفوظة. تكمل؟')) {
                setMessage('');
                setReload((n) => n + 1);
              }
            }}
          >
            إعادة تحميل الخطة
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="plan-success">
          {message}
        </p>
      )}
      {!loading && session && (
        <>
          <p>
            {new Date(session.scheduledAt).toLocaleString('ar', {
              timeZone: session.course?.timeZone,
            })}{' '}
            ·{' '}
            {
              (
                {
                  SCHEDULED: 'مجدولة',
                  LIVE: 'مباشرة',
                  COMPLETED: 'منتهية',
                  CANCELLED: 'ملغاة',
                } as Record<string, string>
              )[session.status]
            }
          </p>
          {editable && !canEdit && (
            <p className="plan-info">
              مواد هذه الحصة محفوظة للعرض فقط. التعديل متاح قبل بداية الحصة.
            </p>
          )}
          <div className="plan-columns">
            <section className="card pad" aria-label="ترتيب مواد الحصة">
              <h2>مواد الحصة ({ids.length})</h2>
              <p>المعلم يشوف هذا الترتيب داخل الحصة.</p>
              {!ids.length && (
                <p>
                  لم تُخصص مواد لهذه الحصة بعد.{editable && ' اختر مواد من المنهج، ثم احفظ الخطة.'}
                </p>
              )}
              <ol className="plan-list">
                {ids.map((id, index) => {
                  const item = snapshots.get(id) ?? byId.get(id);
                  if (!item) return null;
                  return (
                    <li key={id} className="plan-item">
                      <span className="plan-number">{index + 1}</span>
                      <div className="plan-copy">
                        <b>{item.title}</b>
                        <small>{item.type === 'PDF' ? 'ملف PDF' : 'فيديو'}</small>
                        {item.description && <p>{item.description}</p>}
                        {!editable &&
                          'contentUrl' in item &&
                          typeof item.contentUrl === 'string' && (
                            <a
                              className="btn btn-outline btn-sm"
                              href={item.contentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              فتح المادة
                            </a>
                          )}
                      </div>
                      {canEdit && (
                        <div className="plan-actions">
                          <button
                            disabled={saving || index === 0}
                            aria-label={`تقديم ${item.title}`}
                            onClick={() => move(index, -1)}
                          >
                            تقديم
                          </button>
                          <button
                            disabled={saving || index === ids.length - 1}
                            aria-label={`تأخير ${item.title}`}
                            onClick={() => move(index, 1)}
                          >
                            تأخير
                          </button>
                          <button
                            disabled={saving}
                            aria-label={`إزالة ${item.title}`}
                            onClick={() => {
                              setIds((previous) => previous.filter((v) => v !== id));
                              setMessage('');
                            }}
                          >
                            إزالة
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {canEdit && (
                <button
                  className="btn btn-gold"
                  disabled={saving || !dirty || loading}
                  onClick={() => void save()}
                >
                  {saving ? 'جارٍ الحفظ…' : 'حفظ مواد الحصة'}
                </button>
              )}
              {dirty && <p className="plan-info">عندك تغييرات لم تُحفظ بعد.</p>}
            </section>
            {canEdit && (
              <section className="card pad" aria-label="مواد منهج الدورة">
                <h2>منهج الدورة</h2>
                <p>اختر حتى ٥٠ مادة. رفع الملفات والفيديوهات من إدارة المنهج.</p>
                <Link
                  className="btn btn-outline btn-sm"
                  href={`/courses/${session.courseId}/content`}
                  onClick={(e) => {
                    if (dirty && !window.confirm('احفظ تعديلاتك أولًا، أو اخرج بدون حفظ؟'))
                      e.preventDefault();
                  }}
                >
                  إدارة المنهج والمواد
                </Link>
                {!library.length && (
                  <p>أضف ملفات PDF أو فيديو إلى منهج الدورة أولًا، ثم أعد تحميل هذه الصفحة.</p>
                )}
                <ul className="plan-list">
                  {library.map((item) => (
                    <li key={item.id} className="plan-item">
                      <Icon name={item.type === 'PDF' ? 'file' : 'video'} />
                      <div className="plan-copy">
                        <b>{item.title}</b>
                        <small>{item.type === 'PDF' ? 'PDF' : 'فيديو'}</small>
                      </div>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={saving || ids.includes(item.id) || ids.length >= 50}
                        aria-label={`إضافة ${item.title}`}
                        onClick={() => {
                          setIds((previous) => [...previous, item.id]);
                          setMessage('');
                        }}
                      >
                        {ids.includes(item.id) ? 'مضافة' : 'إضافة'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}
