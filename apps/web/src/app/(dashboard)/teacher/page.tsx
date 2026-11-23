'use client';
import { PopupNotice } from '@/components/FeedbackProvider';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import { useAuth } from '@/components/AuthProvider';
import Icon from '@/components/Icon';
type Course = {
  id: string;
  title: string;
  description: string;
  month: string | null;
  ageGroup: string;
  _count: { enrollments: number };
};
type Session = {
  id: string;
  courseId: string;
  title: string;
  scheduledAt: string;
  status: string;
  course: { title: string };
};
async function api(path: string, method = 'GET') {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'تعذر تحميل البيانات');
  return json.data;
}
export default function TeacherDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api('/api/courses'), api('/api/sessions/upcoming')])
      .then(([c, s]) => {
        if (active) {
          setCourses(c);
          setSessions(s);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function start(s: Session) {
    if (starting) return;
    setStarting(s.id);
    setError('');
    try {
      if (s.status !== 'LIVE') await api(`/api/sessions/${s.id}/start`, 'PATCH');
      router.push(`/classroom/${s.courseId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر فتح الحصة');
      setStarting('');
    }
  }
  const nextSession = sessions.find((session) => session.status === 'LIVE') ?? sessions[0];
  return (
    <main className="wrap teacher-home" dir="rtl" style={{ padding: '32px 24px' }}>
      <header className="dash-head">
        <div>
          <p className="dh-hi">
            أهلاً، <b>{user?.name}</b>
          </p>
          <h1 className="dh-title">ما التالي في حصصك؟</h1>
          <p>الحصة الأقرب أولًا. أدوات التحضير والمتابعة متاحة تحتها.</p>
        </div>
      </header>
      {error && (
        <PopupNotice className="auth-error" role="alert">
          {error}
        </PopupNotice>
      )}
      {loading ? (
        <p role="status">جارٍ تحميل دوراتك…</p>
      ) : (
        <>
          {nextSession ? (
            <section className="card pad teacher-next">
              <span className="pill">
                {nextSession.status === 'LIVE' ? 'مباشرة الآن' : 'حصتك القادمة'}
              </span>
              <h2>{nextSession.title}</h2>
              <p>
                {nextSession.course.title} ·{' '}
                {new Date(nextSession.scheduledAt).toLocaleString('ar', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}
              </p>
              <button
                className="btn btn-gold"
                disabled={!!starting}
                onClick={() => void start(nextSession)}
              >
                {starting === nextSession.id
                  ? 'جارٍ فتح الحصة…'
                  : nextSession.status === 'LIVE'
                    ? 'العودة للحصة'
                    : 'بدء الحصة'}
              </button>
              <details className="teacher-session-tools">
                <summary>تحضير هذه الحصة</summary>
                <div className="learning-actions">
                  <Link
                    className="btn btn-outline btn-sm"
                    href={`/teacher/sessions/${nextSession.id}/materials`}
                  >
                    خطة الحصة والمواد
                  </Link>
                  <Link
                    className="btn btn-outline btn-sm"
                    href={`/sessions/${nextSession.id}/writing`}
                  >
                    تمارين الكتابة
                  </Link>
                </div>
              </details>
            </section>
          ) : (
            <section className="card pad teacher-next">
              <h2>لا توجد حصة قادمة بعد</h2>
              <p>ستظهر هنا عندما تحدد الإدارة الموعد. تستطيع متابعة الواجبات والتقارير الآن.</p>
              <Link className="btn btn-gold" href="/teacher/homework">
                تصحيح الواجبات
              </Link>
            </section>
          )}
          <nav className="teacher-quick-links" aria-label="أدوات المعلم">
            <Link href="/teacher/reports">
              <Icon name="edit" /> تقارير الحصص
            </Link>
            <Link href="/teacher/review-answers">
              <Icon name="edit" /> مراجعة الإجابات
            </Link>
            <Link href="/teacher/students">
              <Icon name="graduate" /> الطلاب
            </Link>
          </nav>
          {sessions.length > 1 && (
            <details className="card pad teacher-more-sessions">
              <summary>بقية الحصص القادمة ({sessions.length - 1})</summary>
              {sessions
                .filter((s) => s.id !== nextSession?.id)
                .map((s) => (
                  <div className="teacher-session-row" key={s.id}>
                    <div>
                      <b>{s.title}</b>
                      <p>
                        {s.course.title} · {new Date(s.scheduledAt).toLocaleString('ar')}
                      </p>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={!!starting}
                      onClick={() => void start(s)}
                    >
                      {starting === s.id
                        ? 'جارٍ فتح الحصة…'
                        : s.status === 'LIVE'
                          ? 'العودة للحصة'
                          : 'بدء الحصة'}
                    </button>
                    <Link href={`/teacher/sessions/${s.id}/materials`}>خطة الحصة والمواد</Link>
                    <Link href={`/sessions/${s.id}/writing`}>تمارين الكتابة</Link>
                  </div>
                ))}
            </details>
          )}
          <div className="col-head">
            <h2>الدورات الشهرية ({courses.length})</h2>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))',
              gap: 20,
            }}
          >
            {courses.map((c) => (
              <article className="card pad" key={c.id}>
                <span className="tag">
                  {c.month || 'دورة سابقة'} · الأعمار {c.ageGroup}
                </span>
                <h3 style={{ fontSize: 23, margin: '16px 0' }}>{c.title}</h3>
                <p>{c.description}</p>
                <p>{c._count.enrollments} طلاب مسجلين</p>
                <Link className="btn btn-outline" href={`/courses/${c.id}/lessons`}>
                  <Icon name="book" /> عرض المنهج
                </Link>
              </article>
            ))}
          </div>
          {!courses.length && (
            <section className="card pad">
              <h2>لا توجد دورات معيّنة لك بعد</h2>
              <p>ستظهر دورتك هنا بمجرد أن تعيّنها الإدارة لك.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
