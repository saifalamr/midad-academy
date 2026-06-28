'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { API_URL } from '@/lib/config';

type Enrollment = {
  id: string;
  status: string;
  isLive: boolean;
  course: {
    id: string;
    title: string;
    ageGroup: string;
    price: number;
    currency: string;
    teacherName: string;
  };
};

type UpcomingSession = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  course: { id: string; title: string };
  teacherName: string;
};

type QuizResult = {
  id: string;
  quizId: string;
  quizTitle: string;
  courseTitle: string;
  score: number;
  passed: boolean;
  passingScore: number;
  status: 'COMPLETE' | 'PENDING_REVIEW';
  completedAt: string;
  answers: {
    questionId: string;
    text: string;
    questionType: 'MCQ' | 'WRITTEN' | 'TRUE_FALSE';
    answerText: string;
    status: 'GRADED' | 'PENDING';
    correct: boolean | null;
    points: number;
    pointsAwarded: number | null;
    feedback: string | null;
  }[];
};

type StudentStats = {
  totalPoints: number;
  level: string;
  streak: number;
  lessonsCompleted: number;
  totalLessons: number;
  courseProgress: { courseId: string; title: string; completed: number; total: number }[];
  quizResults: { quizTitle: string; score: number; passed: boolean; createdAt: string }[];
  recentSessions: { title: string; scheduledAt: string; attended: boolean }[];
};

function authFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

function getTokenPayload(): { name?: string } {
  try {
    const token = localStorage.getItem('token');
    if (!token) return {};
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
}

const THUMBS = ['th-1', 'th-2', 'th-3', 'th-4', 'th-5', 'th-6'];
const BADGES: [string, string][] = [['📖','First Word'],['🔥','7-Day'],['✍️','Neat Hand'],['⭐','2k XP'],['🗣️','Speaker'],['🔒','Level 10']];

export default function StudentDashboard() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('Student');
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [stats, setStats] = useState<StudentStats | null>(null);

  useEffect(() => {
    const payload = getTokenPayload();
    setUserName(payload.name ?? 'Student');

    authFetch('/api/students/me')
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setStats(json.data ?? null);
      })
      .catch(() => {});

    authFetch('/api/enrollments')
      .then(async (res) => {
        if (res.status === 401) { router.push('/login'); return; }
        const json = await res.json();
        setEnrollments(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    authFetch('/api/students/results')
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setQuizResults(json.data ?? []);
      })
      .catch(() => {});

    authFetch('/api/sessions/upcoming')
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setUpcomingSessions(json.data ?? []);
      })
      .catch(() => {});
  }, [router]);

  async function handleJoinClass(courseId: string) {
    setError('');
    setJoiningId(courseId);
    try {
      const res = await authFetch('/api/sessions/join', {
        method: 'POST',
        body: JSON.stringify({ roomName: courseId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Could not join class'); return; }
      router.push(`/classroom/${courseId}`);
    } catch {
      setError('Could not connect to server');
    } finally {
      setJoiningId(null);
    }
  }

  const liveEnrollments = enrollments.filter((e) => e.isLive);
  const initial = userName.charAt(0).toUpperCase();

  // ── Real progress, derived from /api/students/me (falls back to 0 / empty) ──
  const totalPoints = stats?.totalPoints ?? 0;
  const level = stats?.level ?? 'beginner';
  const streak = stats?.streak ?? 0;
  const lessonsCompleted = stats?.lessonsCompleted ?? 0;

  // XP progresses in 500-point bands toward the next level threshold.
  const xpInLevel = totalPoints % 500;
  const xpPct = Math.round((xpInLevel / 500) * 100);
  const xpToNext = 500 - xpInLevel;
  const nextThreshold = (Math.floor(totalPoints / 500) + 1) * 500;

  // Streak-week strip: the last 7 calendar days, marked done if a session that
  // day was attended (today gets the dashed marker).
  const todayKey = new Date().toISOString().split('T')[0];
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().split('T')[0];
    const attended = (stats?.recentSessions ?? []).some(
      (s) => s.attended && new Date(s.scheduledAt).toISOString().split('T')[0] === key,
    );
    return { letter: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()], attended, isToday: key === todayKey };
  });

  // ── Recharts datasets ──────────────────────────────────────────────────────
  const quizChart = (stats?.quizResults ?? [])
    .slice()
    .reverse() // chronological for the line
    .map((q) => ({ name: q.quizTitle.slice(0, 10), score: q.score }));

  const courseChart = (stats?.courseProgress ?? []).map((c) => ({
    name: c.title.slice(0, 10),
    completed: c.completed,
    total: c.total,
  }));

  const attendanceChart = (stats?.recentSessions ?? [])
    .slice(0, 7)
    .reverse() // recentSessions is newest-first; show oldest → newest
    .map((s) => ({
      name: new Date(s.scheduledAt).toLocaleDateString(undefined, { weekday: 'short' }),
      attended: s.attended ? 1 : 0,
    }));

  return (
    <div className="midad" style={{ minHeight: '100vh', background: 'var(--cream)' }}>

      {/* ── App bar ── */}
      <header className="appbar">
        <div className="ab-inner">
          <Link className="brand" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/midad-logo-transparent.png" alt="Midad Academy" className="logo-full" />
          </Link>
          <nav className="ab-nav">
            <a className="on">Dashboard</a>
            <Link href="/courses">Courses</Link>
          </nav>
          <div className="ab-right">
            <div className="ab-user">
              <span className="avatar" style={{ width: 38, height: 38 }}>{initial}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="dash">

        {/* ── Hero banner ── */}
        <div className="dash-hero card">
          <div>
            <p className="dh-hi">Welcome back, <b>{userName}</b> 👋 <span className="ar dh-ar">أهلاً</span></p>
            <h1 className="dh-title">Ready for today&apos;s lesson?</h1>
            <p className="dh-sub">
              {liveEnrollments.length > 0
                ? <><b>{liveEnrollments.length} live class{liveEnrollments.length > 1 ? 'es' : ''}</b> waiting for you right now.</>
                : 'Keep going — every lesson gets you closer to fluency!'}
            </p>
            {liveEnrollments.length > 0 && (
              <button
                className="btn btn-gold"
                style={{ marginTop: 16 }}
                onClick={() => handleJoinClass(liveEnrollments[0].course.id)}
              >
                Join your live class
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </button>
            )}
          </div>
          <div className="dh-level">
            <div className="lvl-ring" style={{ '--p': `${xpPct}%` } as React.CSSProperties}>
              <div className="lvl-in">
                <b style={{ fontSize: 18, textTransform: 'capitalize' }}>{level}</b>
                <span>Level</span>
              </div>
            </div>
            <div className="lvl-meta">
              <div className="lvl-row"><span>{totalPoints} XP</span><span>{nextThreshold}</span></div>
              <div className="bar"><i style={{ width: `${xpPct}%` }}></i></div>
              <p className="lvl-note"><b>{xpToNext} XP</b> to next level</p>
            </div>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="stat-row">
          <div className="stat card"><div className="st-ic st-gold">⭐</div><div><b>{totalPoints}</b><span>Total XP</span></div></div>
          <div className="stat card"><div className="st-ic st-fire">🔥</div><div><b>{streak} days</b><span>Current streak</span></div></div>
          <div className="stat card"><div className="st-ic st-navy">📚</div><div><b>{lessonsCompleted}</b><span>Lessons done</span></div></div>
          <div className="stat card"><div className="st-ic st-green">✓</div><div><b>{enrollments.length}</b><span>Enrolled classes</span></div></div>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 18 }}>{error}</div>}

        <div className="dash-grid">

          {/* ── My Classes column ── */}
          <div className="dash-col">
            <div className="col-head">
              <h2>My Classes <span className="ar muted">صفوفي</span></h2>
              <Link href="/courses" className="link-gold">Browse more →</Link>
            </div>

            {loading ? (
              <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
                Loading your classes…
              </div>
            ) : enrollments.length === 0 ? (
              <div className="card pad" style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 14 }}>
                  You haven&apos;t enrolled in any classes yet.
                </p>
                <Link href="/courses" className="btn btn-gold btn-sm">Browse courses</Link>
              </div>
            ) : (
              enrollments.map((enrollment, idx) => {
                const { course } = enrollment;
                return (
                  <div key={enrollment.id} className={`class-card card${enrollment.isLive ? ' live' : ''}`}>
                    {enrollment.isLive && (
                      <div className="cc-badge">
                        <span className="badge-live"><span className="dot"></span> Live now</span>
                      </div>
                    )}
                    <div className="cc-body">
                      <div className={`cc-thumb ${THUMBS[idx % THUMBS.length]}`}>
                        <span className="ar">{course.title.slice(0, 3)}</span>
                      </div>
                      <div className="cc-info">
                        <div className="cc-title ar">{course.title}</div>
                        <div className="cc-en">Ages {course.ageGroup}</div>
                        <div className="cc-meta">
                          <span className="avatar" style={{ width: 24, height: 24 }}>
                            {course.teacherName.charAt(0)}
                          </span>
                          {course.teacherName}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <Link href={`/courses/${course.id}/lessons`} className="btn btn-sm btn-outline">
                          View Lessons
                        </Link>
                        {enrollment.isLive ? (
                          <button
                            className="btn btn-gold btn-sm"
                            onClick={() => handleJoinClass(course.id)}
                            disabled={joiningId === course.id}
                            style={{ opacity: joiningId === course.id ? 0.65 : 1 }}
                          >
                            {joiningId === course.id ? 'Joining…' : 'Join Class'}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                          </button>
                        ) : (
                          <span className="cc-soon">Scheduled</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Side column ── */}
          <div className="dash-col">
            <div className="card pad">
              <div className="col-head sm">
                <h3>Upcoming Classes <span className="ar muted">الحصص القادمة</span></h3>
              </div>
              {upcomingSessions.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No classes scheduled yet.</p>
              ) : (
                <ul className="agenda">
                  {upcomingSessions.map((session) => {
                    const dt = new Date(session.scheduledAt);
                    return (
                      <li key={session.id}>
                        <span className="ag-time">
                          {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          <br />
                          {dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <div>
                          <b>{session.title}</b>
                          <span>{session.course.title} · {session.teacherName} · {session.durationMinutes} min</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card pad">
              <div className="col-head sm">
                <h3>My Badges <span className="ar muted">أوسمتي</span></h3>
              </div>
              <div className="badge-grid">
                {BADGES.map(([ic, label]) => (
                  <div key={label} className="bg-item">
                    <div className="bg-ic locked">{ic}</div>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card pad">
              <div className="col-head sm">
                <h3>Streak <span className="ar muted">المواظبة</span></h3>
                <span className="pill">🔥 {streak} days</span>
              </div>
              <div className="streak-week">
                {last7Days.map((d, i) => (
                  <div key={i} className={`sw-day${d.attended ? ' done' : ''}${d.isToday ? ' today' : ''}`}>
                    <i></i><span>{d.letter}</span>
                  </div>
                ))}
              </div>
              <p className="streak-note">
                {streak > 0
                  ? <>🔥 {streak}-day streak — keep it going!</>
                  : 'Attend a class today to start your streak!'}
              </p>
            </div>

            {/* ── Quiz performance (LineChart) ── */}
            <div className="card pad">
              <div className="col-head sm">
                <h3>Quiz Performance <span className="ar muted">أداء الاختبارات</span></h3>
              </div>
              {quizChart.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No quiz data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={quizChart} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#C9922A" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Lesson progress by course (BarChart) ── */}
            <div className="card pad">
              <div className="col-head sm">
                <h3>Lesson Progress by Course <span className="ar muted">التقدّم</span></h3>
              </div>
              {courseChart.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No course data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={courseChart} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#1B3A6B" fillOpacity={0.3} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" fill="#C9922A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Recent attendance (BarChart, green = attended / red = missed) ── */}
            <div className="card pad">
              <div className="col-head sm">
                <h3>Recent Attendance <span className="ar muted">الحضور</span></h3>
              </div>
              {attendanceChart.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No attendance data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={attendanceChart} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 1]} ticks={[0, 1]} allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="attended" radius={[4, 4, 0, 0]}>
                      {attendanceChart.map((d, i) => (
                        <Cell key={i} fill={d.attended ? '#2f8f5b' : '#dc2626'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Quiz results feed ── */}
            <div className="card pad">
              <div className="col-head sm">
                <h3>Quiz Results <span className="ar muted">نتائج الاختبارات</span></h3>
              </div>
              {quizResults.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>You haven&apos;t taken any quizzes yet.</p>
              ) : (
                <ul className="feed">
                  {quizResults.map((r) => {
                    const dotStyle = r.status === 'PENDING_REVIEW'
                      ? { background: '#d97706' }
                      : !r.passed ? { background: '#dc2626' } : undefined;
                    const feedbacks = r.answers.filter((a) => a.feedback);
                    return (
                      <li key={r.id}>
                        <span className={`fd-dot ${r.status === 'COMPLETE' && r.passed ? 'ok' : ''}`} style={dotStyle}></span>
                        <div>
                          <b>{r.quizTitle}</b> — {r.courseTitle}
                          <br />
                          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                            {r.status === 'PENDING_REVIEW'
                              ? <>⏳ Pending Review · {r.score}% so far</>
                              : <>Score: {r.score}% · {r.passed ? 'Passed' : 'Not passed'}</>}
                          </span>
                          {feedbacks.length > 0 && (
                            <ul style={{ marginTop: 4, paddingLeft: 16, fontSize: 12, color: 'var(--ink-3)' }}>
                              {feedbacks.map((a) => (
                                <li key={a.questionId}>
                                  <b>{a.text}:</b> {a.pointsAwarded}/{a.points} — {a.feedback}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
