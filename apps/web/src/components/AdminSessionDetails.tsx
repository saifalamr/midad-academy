'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/config';
import './admin-session-details.css';
type Visit = {
  id: string;
  joinedAt: string | null;
  leftAt: string | null;
  exitSource: string | null;
};
type Activity = {
  hasJoined: boolean;
  present: boolean | null;
  firstJoinedAt: string | null;
  lastLeftAt: string | null;
  entryCount: number;
  visits: Visit[];
};
type Detail = {
  id: string;
  courseId: string;
  title: string;
  courseTitle: string;
  timeZone: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  livePresenceAvailable: boolean;
  snapshotAt: string | null;
  teacher: Activity & { name: string };
  students: (Activity & { id: string; name: string; username: string | null })[];
  summary: { registered: number; attended: number; present: number | null; notJoined: number };
};
const labels: Record<string, string> = {
  SCHEDULED: 'مجدولة',
  LIVE: 'مباشرة الآن',
  COMPLETED: 'منتهية',
  CANCELLED: 'ملغاة',
};
function attendanceLabel(person: Activity, live: boolean) {
  return person.present === true
    ? 'داخل الحصة الآن'
    : live && person.present === null
      ? person.hasJoined
        ? 'دخل سابقًا · الاتصال الحالي غير مؤكد'
        : 'لا يوجد سجل دخول · الاتصال الحالي غير مؤكد'
      : person.hasJoined
        ? 'سُجّل دخوله'
        : 'لم يُسجّل دخوله';
}
export default function AdminSessionDetails({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<Detail>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let reading = false;
    async function read() {
      if (reading || document.hidden) return;
      reading = true;
      try {
        const response = await fetch(`${API_URL}/api/admin/sessions/${sessionId}/details`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
          },
        });
        const json = await response.json();
        if (!response.ok) throw Error(json.error);
        if (!controller.signal.aborted) {
          setData(json.data);
          setError('');
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message || 'تعذر تحميل الحصة');
      } finally {
        reading = false;
      }
    }
    void read();
    const timer = setInterval(() => void read(), 15000);
    const visible = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [sessionId, retry]);
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString('ar', { timeZone: data?.timeZone }) : 'غير مسجل';
  function history(person: Activity) {
    return (
      <details className="session-visit-history">
        <summary>سجل الدخول والخروج ({person.entryCount})</summary>
        {person.visits.length ? (
          <ol>
            {person.visits.map((visit) => (
              <li key={visit.id}>
                <p>الدخول: {date(visit.joinedAt)}</p>
                <p>
                  {visit.exitSource === 'OBSERVED'
                    ? 'رُصد الخروج:'
                    : visit.exitSource === 'SESSION_END'
                      ? 'إغلاق بنهاية الحصة:'
                      : 'الخروج:'}{' '}
                  {visit.leftAt
                    ? date(visit.leftAt)
                    : data?.status === 'LIVE'
                      ? 'لم يسجّل خروجًا بعد'
                      : 'غير مسجل'}
                </p>
                {visit.exitSource === 'OBSERVED' && (
                  <small>وقت الرصد تقريبي؛ قد يكون الخروج قبل هذا الوقت.</small>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p>
            {person.hasJoined
              ? 'يوجد سجل حضور سابق، دون تفاصيل اتصال محفوظة.'
              : 'لا يوجد دخول مسجّل.'}
          </p>
        )}
      </details>
    );
  }
  return (
    <main className="admin-session-page" dir="rtl">
      <Link className="btn btn-outline" href="/admin">
        العودة لإدارة الأكاديمية
      </Link>
      <header>
        <span className="tag">متابعة الحصص</span>
        <h1>{data?.title || 'تفاصيل الحصة'}</h1>
        {data && (
          <p>
            {data.courseTitle} · {labels[data.status] || data.status}
          </p>
        )}
      </header>
      {!data && !error && <p role="status">جارٍ تحميل بيانات الحصة…</p>}
      {error && (
        <p role="alert" className="session-detail-error">
          {error}{' '}
          <button className="btn btn-outline" onClick={() => setRetry((n) => n + 1)}>
            إعادة المحاولة
          </button>
        </p>
      )}
      {data && (
        <>
          <section className="session-detail-card" aria-label="موعد الحصة">
            <h2>موعد الحصة</h2>
            <dl className="session-detail-metadata">
              <div>
                <dt>الموعد المحدد</dt>
                <dd>{date(data.scheduledAt)}</dd>
              </div>
              <div>
                <dt>المدة</dt>
                <dd>{data.durationMinutes} دقيقة</dd>
              </div>
              <div>
                <dt>بداية الحصة من المعلم</dt>
                <dd>{date(data.startedAt)}</dd>
              </div>
              <div>
                <dt>نهاية الحصة</dt>
                <dd>{date(data.endedAt)}</dd>
              </div>
            </dl>
            <p>
              الأوقات حسب منطقة الدورة: <span dir="ltr">{data.timeZone}</span>.
            </p>
            <div className="session-detail-actions">
              <Link className="btn btn-outline" href={`/admin/sessions/${data.id}/materials`}>
                مواد الحصة
              </Link>
              <Link className="btn btn-outline" href={`/admin/sessions/${data.id}/homework`}>
                واجب الحصة
              </Link>
              {data.status === 'LIVE' && (
                <Link className="btn btn-gold" href={`/classroom/${data.courseId}`}>
                  مراقبة الحصة
                </Link>
              )}
            </div>
          </section>
          {data.status === 'LIVE' && !data.livePresenceAvailable && (
            <p role="alert" className="session-detail-error">
              تعذر التأكد من المتصلين الآن. نعرض سجل الدخول المحفوظ؛ هذا لا يعني أن المعلم أو الطلاب
              غائبون.
            </p>
          )}
          <section className="session-detail-card" aria-label="حضور المعلم">
            <h2>المعلم · {data.teacher.name}</h2>
            <b className={`session-presence ${data.teacher.present === true ? 'present' : ''}`}>
              {attendanceLabel(data.teacher, data.status === 'LIVE')}
            </b>
            {data.startedAt && !data.teacher.hasJoined && (
              <p>بدأ المعلم الحصة، لكن لم يُسجّل دخوله إلى المكالمة بعد.</p>
            )}
            <p>أول دخول: {date(data.teacher.firstJoinedAt)}</p>
            {history(data.teacher)}
          </section>
          <section className="session-attendance-counts" aria-label="ملخص حضور الطلاب">
            <article>
              <b>{data.summary.registered}</b>
              <span>طلاب الحصة</span>
            </article>
            <article>
              <b>{data.summary.attended}</b>
              <span>سُجّل دخولهم</span>
            </article>
            <article>
              <b>{data.summary.present ?? '—'}</b>
              <span>داخل الحصة الآن</span>
            </article>
            <article>
              <b>{data.summary.notJoined}</b>
              <span>لم يُسجّل دخولهم</span>
            </article>
          </section>
          <section aria-label="حضور الطلاب">
            <h2>طلاب الحصة</h2>
            {!data.students.length && <p>لا يوجد طلاب في سجل هذه الحصة.</p>}
            <div className="session-students-grid">
              {data.students.map((student) => (
                <article
                  className="session-detail-card"
                  key={student.id}
                  aria-label={`حضور ${student.name}`}
                >
                  <h3>{student.name}</h3>
                  {student.username && <p dir="ltr">{student.username}</p>}
                  <b className={`session-presence ${student.present === true ? 'present' : ''}`}>
                    {attendanceLabel(student, data.status === 'LIVE')}
                  </b>
                  <p>أول دخول: {date(student.firstJoinedAt)}</p>
                  {history(student)}
                </article>
              ))}
            </div>
          </section>
          <p className="session-detail-footnote">
            يُسجّل الدخول بعد تأكيد الاتصال من خدمة المكالمة، وليس بمجرد الضغط على الزر. تتحدث
            الصفحة كل ١٥ ثانية. قد لا تتوفر تفاصيل الدخول والخروج للحصص السابقة.
          </p>
        </>
      )}
    </main>
  );
}
