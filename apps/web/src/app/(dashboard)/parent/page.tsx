'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import Icon from '@/components/Icon';
import { API_URL } from '@/lib/config';
import { academyContactUrl, sessionDate } from '@/lib/academy-contact';
import './parent.css';

type Session = {
  id: string;
  courseTitle: string;
  timeZone: string;
  lessonTitle: string;
  scheduledAt: string;
  attended: boolean;
};
type Course = {
  id: string;
  title: string;
  month: string | null;
  timeZone: string;
  teacherName: string;
  upcomingSessions: {
    id: string;
    title: string;
    scheduledAt: string;
    durationMinutes: number;
    status: string;
  }[];
  exercises: {
    id: string;
    title: string;
    status: string;
    score: number | null;
    submittedAt: string | null;
  }[];
};
type Child = {
  id: string;
  name: string;
  level: string;
  totalPoints: number;
  lessonsCompleted: number;
  totalLessons: number;
  courses: Course[];
  courseProgress: { courseId: string; total: number; completed: number }[];
  materialProgress: { courseId: string; total: number; completed: number }[];
  recentSessions: Session[];
};

export default function ParentDashboard() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    fetch(`${API_URL}/api/parent/overview`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => setChildren(j.data.children))
      .catch((e) => {
        if (e.name !== 'AbortError') setError('تعذر تحميل بيانات أبنائك. حاول مرة أخرى.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  const child = children.find((c) => c.id === selected) ?? children[0];
  const next = child?.courses
    .flatMap((course) => course.upcomingSessions.map((s) => ({ ...s, course })))
    .sort((a, b) =>
      a.status === 'LIVE'
        ? -1
        : b.status === 'LIVE'
          ? 1
          : new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )[0];
  function downloadReport() {
    const cell = (value: string | boolean) =>
      '"' +
      String(value)
        .replace(/^[=+@-]/, "'")
        .replace(/"/g, '""') +
      '"';
    const rows = [
      ['الطفل', 'الدورة', 'الحصة', 'الموعد', 'الحضور'],
      ...children.flatMap((c) =>
        c.recentSessions.map((s) => [
          c.name,
          s.courseTitle,
          s.lessonTitle,
          sessionDate(s.scheduledAt, s.timeZone),
          s.attended ? 'حضر' : 'غاب',
        ])
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(['\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'midad-recent-attendance.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="dash family-dashboard" dir="rtl">
      <header className="family-heading">
        <div>
          <p className="eyebrow">مرحبًا {user?.name}</p>
          <h1>متابعة أبنائك</h1>
          <p className="muted">الدورات والمواعيد والحضور والتمارين، في مكان واحد.</p>
        </div>
        <Link href="/courses" className="btn btn-gold">
          <Icon name="book" />
          استعرض الدورات الشهرية
        </Link>
      </header>
      {loading ? (
        <section className="card pad" role="status">
          جارٍ تحميل بيانات الأسرة…
        </section>
      ) : error ? (
        <section className="card pad" role="alert">
          <p>{error}</p>
          <button className="btn btn-outline" onClick={() => setReload((v) => v + 1)}>
            إعادة المحاولة
          </button>
        </section>
      ) : !child ? (
        <section className="card pad family-empty">
          <Icon name="family" size={42} />
          <h2>لنبدأ رحلة أبنائك</h2>
          <p>تضيف الأكاديمية حسابات أبنائك وتربطها بك بعد التواصل وإكمال التسجيل.</p>
          <a
            className="btn btn-gold"
            href={academyContactUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            تواصل مع الأكاديمية
          </a>
        </section>
      ) : (
        <>
          <nav className="family-children" aria-label="اختيار الطفل" id="children">
            {children.map((c) => (
              <button
                key={c.id}
                className={`family-child${child.id === c.id ? ' selected' : ''}`}
                aria-pressed={child.id === c.id}
                onClick={() => setSelected(c.id)}
              >
                <span className="avatar">{c.name.charAt(0)}</span>
                <span>
                  {c.name}
                  <small>{c.courses.length} دورات مسجل فيها</small>
                </span>
              </button>
            ))}
          </nav>
          <section className="family-next card pad" aria-label="الحصة القادمة">
            <Icon name="calendar" size={32} />
            <div>
              <span className="eyebrow">
                {next?.status === 'LIVE' ? 'حصة جارية الآن' : 'الحصة القادمة'}
              </span>
              <h2>{next ? next.title : 'لا توجد حصة قادمة بعد'}</h2>
              <p>
                {next
                  ? `${next.course.title} · ${sessionDate(next.scheduledAt, next.course.timeZone)}`
                  : 'ستظهر هنا المواعيد التي تضيفها الأكاديمية لدورات طفلك.'}
              </p>
              {next && (
                <small>
                  {next.durationMinutes} دقيقة · توقيت {next.course.timeZone}
                </small>
              )}
            </div>
          </section>
          <div className="family-stats">
            <section className="card pad">
              <Icon name="book" />
              <b>{child.courses.length}</b>
              <span>الدورات المسجل فيها</span>
            </section>
            <section className="card pad">
              <Icon name="check" />
              <b>{child.lessonsCompleted}</b>
              <span>حصص حضرها</span>
            </section>
            <section className="card pad">
              <Icon name="calendar" />
              <b>{child.totalLessons - child.lessonsCompleted}</b>
              <span>حصص غاب عنها</span>
            </section>
          </div>
          <div className="family-section-title">
            <h2>دورات {child.name}</h2>
            <span className="muted">الحضور مستقل عن إنجاز المواد والدرجات</span>
          </div>
          {!child.courses.length ? (
            <section className="card pad">
              <p>لم تسجل الأكاديمية طفلك في دورة بعد.</p>
              <Link href="/courses" className="link-gold">
                اختر دورة وتواصل لطلب التسجيل
              </Link>
            </section>
          ) : (
            <div className="family-courses">
              {child.courses.map((course) => {
                const attendance = child.courseProgress.find((c) => c.courseId === course.id);
                const materials = child.materialProgress.find((c) => c.courseId === course.id);
                const attended = attendance?.completed ?? 0,
                  total = attendance?.total ?? 0;
                return (
                  <article key={course.id} className="card pad family-course">
                    <span className="tag">
                      {course.month ? `دورة شهر ${course.month}` : 'دورة مسجل فيها'}
                    </span>
                    <h3>{course.title}</h3>
                    <p className="muted">المعلم: {course.teacherName}</p>
                    <div className="family-course-summary">
                      <span>
                        الحضور{' '}
                        <b>
                          {attended} من {total}
                        </b>
                      </span>
                      <span>
                        الغياب <b>{total - attended}</b>
                      </span>
                    </div>
                    <p className="family-note">
                      تُحسب الحصص المكتملة منذ تسجيل الطفل؛ الحصص الملغاة والقادمة لا تُحسب غيابًا.
                    </p>
                    {materials && materials.total > 0 && (
                      <div className="family-materials">
                        <label htmlFor={`progress-${child.id}-${course.id}`}>
                          إنجاز المواد: {materials.completed} من {materials.total}
                        </label>
                        <progress
                          id={`progress-${child.id}-${course.id}`}
                          value={materials.completed}
                          max={materials.total}
                        />
                        <small>إنجاز يسجله الطالب؛ لا يمثل تقييم المعلم لمستواه.</small>
                      </div>
                    )}
                    <details>
                      <summary>المواعيد القادمة ({course.upcomingSessions.length})</summary>
                      {course.upcomingSessions.length ? (
                        <ul className="family-list">
                          {course.upcomingSessions.map((s) => (
                            <li key={s.id}>
                              <b>{s.title}</b>
                              <span>{sessionDate(s.scheduledAt, course.timeZone)}</span>
                              <small>
                                {s.durationMinutes} دقيقة ·{' '}
                                {s.status === 'LIVE' ? 'جارية الآن' : 'مجدولة'} · {course.timeZone}
                              </small>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>لا توجد مواعيد قادمة.</p>
                      )}
                    </details>
                    <details open>
                      <summary>تمارين الدورة والدرجات ({course.exercises.length})</summary>
                      <p className="family-note">
                        آخر تسليم لكل تمرين، وتظهر الدرجة النهائية بعد اكتمال التصحيح.
                      </p>
                      {course.exercises.length ? (
                        <ul className="family-list">
                          {course.exercises.map((e) => (
                            <li key={e.id}>
                              <b>{e.title}</b>
                              <span
                                className={`family-status ${e.status === 'COMPLETE' ? 'complete' : ''}`}
                              >
                                {e.status === 'NOT_SUBMITTED'
                                  ? 'لم تُسلّم'
                                  : e.status === 'PENDING_REVIEW'
                                    ? 'بانتظار تصحيح المعلم'
                                    : `الدرجة النهائية: ${e.score}%`}
                              </span>
                              {e.submittedAt && (
                                <small>
                                  آخر تسليم: {sessionDate(e.submittedAt, course.timeZone)}
                                </small>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>لم تضف الإدارة تمارين لهذه الدورة بعد.</p>
                      )}
                    </details>
                  </article>
                );
              })}
            </div>
          )}
          <section className="card pad" id="reports">
            <div className="family-section-title">
              <h2>آخر الحصص المكتملة</h2>
              <button
                className="btn btn-outline"
                onClick={downloadReport}
                disabled={!children.some((c) => c.recentSessions.length)}
              >
                تحميل سجل الحضور الأخير
              </button>
            </div>
            {!child.recentSessions.length ? (
              <p className="muted">سيظهر سجل الحضور بعد اكتمال الحصص.</p>
            ) : (
              <ul className="family-list family-attendance">
                {child.recentSessions.map((s) => (
                  <li key={s.id}>
                    <div>
                      <b>{s.lessonTitle}</b>
                      <span>
                        {s.courseTitle} · {sessionDate(s.scheduledAt, s.timeZone)}
                      </span>
                    </div>
                    <span className={`family-status ${s.attended ? 'complete' : 'missed'}`}>
                      {s.attended ? 'حضر' : 'غاب'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <footer className="card pad family-support">
            <div>
              <h3>تحتاج تعديل حساب أو تسجيل دورة؟</h3>
              <p>تتولى الأكاديمية إدارة حسابات الأبناء وتسجيلهم.</p>
            </div>
            <a
              className="btn btn-outline"
              href={academyContactUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              تواصل عبر واتساب
            </a>
          </footer>
        </>
      )}
    </main>
  );
}
