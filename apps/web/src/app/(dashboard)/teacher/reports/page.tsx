'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import { sessionDate } from '@/lib/academy-contact';
import { performanceLabels, homeworkLabels, type Report } from '@/lib/session-reports';
import './reports.css';

type Session = {
  id: string;
  courseId: string;
  title: string;
  courseTitle: string;
  timeZone: string;
  scheduledAt: string;
  total: number;
  published: number;
  pending: number;
};
type Student = { id: string; name: string; attended: boolean; report: Report | null };
type Detail = {
  id: string;
  title: string;
  scheduledAt: string;
  course: { title: string; timeZone: string };
  students: Student[];
};
async function api(path: string, signal?: AbortSignal, body?: unknown) {
  const res = await fetch(API_URL + '/api/teacher/reports' + path, {
    signal,
    cache: 'no-store',
    method: body ? 'PUT' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (localStorage.getItem('token') ?? sessionStorage.getItem('token')),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'تعذر تحميل التقرير. حاول مجددًا.');
  return json.data;
}
function ReportEditor({
  student,
  sessionId,
  onSaved,
}: {
  student: Student;
  sessionId: string;
  onSaved: (report: Report) => void;
}) {
  const [values, setValues] = useState({
    performance: student.report?.performance ?? 'NOT_ASSESSED',
    participationCount: student.report?.participationCount ?? 0,
    homework: student.report?.homework ?? 'NOT_ASSIGNED',
    note: student.report?.note ?? '',
  });
  const [version, setVersion] = useState(student.report?.version ?? 0);
  const [published, setPublished] = useState(!!student.report?.publishedAt);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(update: Partial<typeof values>) {
    setValues((v) => ({ ...v, ...update }));
    setDirty(true);
    setMessage('');
  }
  async function save(publish: boolean) {
    if (busy || published) return;
    if (
      publish &&
      !window.confirm('اعتماد التقرير وإظهاره لولي الأمر؟ بعد الاعتماد لا يمكن تعديله.')
    )
      return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const report = await api('/' + sessionId + '/' + student.id, undefined, {
        ...values,
        version,
        publish,
      });
      setVersion(report.version);
      setPublished(!!report.publishedAt);
      setDirty(false);
      setMessage(
        publish
          ? 'تم اعتماد التقرير وأصبح ظاهرًا لولي الأمر.'
          : 'حُفظت المسودة. لم تُعرض لولي الأمر بعد.'
      );
      onSaved(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className="card pad report-student"
      data-dirty={dirty}
      aria-label={'تقرير ' + student.name}
    >
      <header>
        <div>
          <h3>{student.name}</h3>
          <span className={student.attended ? 'report-attended' : 'muted'}>
            {student.attended ? 'حضر الحصة' : 'لا يوجد حضور مسجل'}
          </span>
        </div>
        <span className="report-badge">
          {published ? 'معتمد' : version ? 'مسودة' : 'لم يُكتب بعد'}
        </span>
      </header>
      {!student.attended && (
        <p className="report-note">
          يمكنك كتابة ملاحظة عن الغياب أو الواجب. لا تسجل تقييمًا للحصة أو مشاركات دون حضور.
        </p>
      )}
      <fieldset disabled={busy || published}>
        <div className="report-fields">
          <label>
            المستوى في هذه الحصة
            <select
              aria-label={'مستوى ' + student.name}
              disabled={!student.attended}
              value={values.performance}
              onChange={(e) => change({ performance: e.target.value as Report['performance'] })}
            >
              {Object.entries(performanceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            عدد المشاركات
            <input
              aria-label={'مشاركات ' + student.name}
              type="number"
              min={0}
              max={200}
              step={1}
              disabled={!student.attended}
              value={values.participationCount}
              onChange={(e) => change({ participationCount: Number(e.target.value) })}
            />
          </label>
          <label>
            حالة الواجب
            <select
              aria-label={'واجب ' + student.name}
              value={values.homework}
              onChange={(e) => change({ homework: e.target.value as Report['homework'] })}
            >
              {Object.entries(homeworkLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="report-comment">
          ملاحظة لولي الأمر
          <textarea
            aria-label={'ملاحظة ' + student.name}
            rows={4}
            maxLength={3000}
            placeholder="ما الذي أتقنه الطفل؟ وما الذي يحتاج إلى مراجعته في البيت؟"
            value={values.note}
            onChange={(e) => change({ note: e.target.value })}
          />
          <small dir="ltr">{values.note.length} / 3000</small>
        </label>
        {!published && (
          <div className="report-actions">
            <button className="btn btn-outline" onClick={() => void save(false)}>
              حفظ مسودة
            </button>
            <button
              className="btn btn-gold"
              disabled={values.note.trim().length < 3}
              onClick={() => void save(true)}
            >
              اعتماد وإظهار لولي الأمر
            </button>
          </div>
        )}
      </fieldset>
      {published && (
        <p className="report-note">تقرير معتمد؛ يمكن لولي الأمر قراءته في صفحة متابعة طفله.</p>
      )}
      {busy && <p role="status">جارٍ الحفظ…</p>}
      {message && (
        <p role="status" className="report-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </article>
  );
}
export default function SessionReports() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [reload, setReload] = useState(0);
  const [detailReload, setDetailReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api('', controller.signal)
      .then((data: Session[]) => {
        if (controller.signal.aborted) return;
        setSessions(data);
        const course = new URLSearchParams(window.location.search).get('course');
        setSelected((current) =>
          data.some((s) => s.id === current)
            ? current
            : (data.find((s) => s.courseId === course)?.id ?? data[0]?.id ?? '')
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    api('/' + selected, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setDetailError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selected, detailReload]);
  function choose(id: string) {
    if (id === selected) return;
    if (
      document.querySelector('.report-student[data-dirty="true"]') &&
      !window.confirm('هناك تغييرات لم تُحفظ. الانتقال لحصة أخرى؟')
    )
      return;
    setSelected(id);
  }
  const published = detail?.students.filter((s) => s.report?.publishedAt).length ?? 0;
  return (
    <main className="wrap reports-page" dir="rtl">
      <header className="report-heading">
        <div>
          <p className="eyebrow">متابعة الطلاب</p>
          <h1>تقارير الحصص</h1>
          <p>اكتب تقريرًا لكل طالب بعد انتهاء الحصة، ثم اعتمده ليظهر لولي الأمر.</p>
        </div>
        <Link className="btn btn-outline" href="/teacher">
          الرجوع لحصصي
        </Link>
      </header>
      {loading ? (
        <p role="status">جارٍ تحميل الحصص…</p>
      ) : error ? (
        <section className="card pad" role="alert">
          <p>{error}</p>
          <button className="btn btn-outline" onClick={() => setReload((v) => v + 1)}>
            إعادة المحاولة
          </button>
        </section>
      ) : !sessions.length ? (
        <section className="card pad">
          <h2>لا توجد حصص مكتملة بعد</h2>
          <p>بعد إنهاء حصة، ستظهر هنا لكتابة تقارير طلابها.</p>
        </section>
      ) : (
        <>
          <section className="card pad report-picker">
            <label htmlFor="report-session">اختر الحصة المكتملة</label>
            <select id="report-session" value={selected} onChange={(e) => choose(e.target.value)}>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.courseTitle} · {s.title} · {sessionDate(s.scheduledAt, s.timeZone)} ·{' '}
                  {s.pending} تقرير متبقٍ
                </option>
              ))}
            </select>
            <p className="muted">
              آخر 50 حصة مكتملة. المسودات خاصة بك؛ الاعتماد يُظهر التقرير في الموقع.
            </p>
          </section>
          {detailLoading ? (
            <p role="status">جارٍ تحميل طلاب الحصة…</p>
          ) : detailError ? (
            <section className="card pad" role="alert">
              <p>{detailError}</p>
              <button className="btn btn-outline" onClick={() => setDetailReload((v) => v + 1)}>
                إعادة تحميل الطلاب
              </button>
            </section>
          ) : (
            detail && (
              <>
                <section className="report-summary">
                  <div>
                    <h2>{detail.title}</h2>
                    <p>
                      {detail.course.title} ·{' '}
                      {sessionDate(detail.scheduledAt, detail.course.timeZone)}
                    </p>
                  </div>
                  <strong>
                    معتمد {published} من {detail.students.length}
                  </strong>
                </section>
                {!detail.students.length ? (
                  <p className="card pad">لا يوجد طلاب مسجلون لهذه الحصة.</p>
                ) : (
                  detail.students.map((student) => (
                    <ReportEditor
                      key={selected + '-' + student.id + '-' + detailReload}
                      student={student}
                      sessionId={selected}
                      onSaved={(report) => {
                        setDetail((d) =>
                          d
                            ? {
                                ...d,
                                students: d.students.map((s) =>
                                  s.id === student.id ? { ...s, report } : s
                                ),
                              }
                            : d
                        );
                        if (report.publishedAt)
                          setSessions((list) =>
                            list.map((s) =>
                              s.id === selected
                                ? {
                                    ...s,
                                    published: s.published + 1,
                                    pending: Math.max(0, s.pending - 1),
                                  }
                                : s
                            )
                          );
                      }}
                    />
                  ))
                )}
              </>
            )
          )}
        </>
      )}
    </main>
  );
}
