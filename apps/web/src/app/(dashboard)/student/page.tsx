'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

function authFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(`http://localhost:4000${path}`, {
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
const DAYS = ['M','T','W','T','F','S','S'];

export default function StudentDashboard() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('Student');

  useEffect(() => {
    const payload = getTokenPayload();
    setUserName(payload.name ?? 'Student');

    authFetch('/api/enrollments')
      .then(async (res) => {
        if (res.status === 401) { router.push('/login'); return; }
        const json = await res.json();
        setEnrollments(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
            <div className="lvl-ring" style={{ '--p': '0%' } as React.CSSProperties}>
              <div className="lvl-in"><b>1</b><span>Level</span></div>
            </div>
            <div className="lvl-meta">
              <div className="lvl-row"><span>0 XP</span><span>500</span></div>
              <div className="bar"><i style={{ width: '0%' }}></i></div>
              <p className="lvl-note">500 XP to <b>Level 2</b></p>
            </div>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="stat-row">
          <div className="stat card"><div className="st-ic st-gold">⭐</div><div><b>0</b><span>Total XP</span></div></div>
          <div className="stat card"><div className="st-ic st-fire">🔥</div><div><b>0 days</b><span>Current streak</span></div></div>
          <div className="stat card"><div className="st-ic st-navy">🏅</div><div><b>0</b><span>Badges earned</span></div></div>
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
                      {enrollment.isLive ? (
                        <button
                          className="btn btn-gold btn-sm"
                          onClick={() => handleJoinClass(course.id)}
                          disabled={joiningId === course.id}
                          style={{ opacity: joiningId === course.id ? 0.65 : 1, flexShrink: 0 }}
                        >
                          {joiningId === course.id ? 'Joining…' : 'Join Class'}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                        </button>
                      ) : (
                        <span className="cc-soon">Scheduled</span>
                      )}
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
                <span className="pill">🔥 0 days</span>
              </div>
              <div className="streak-week">
                {DAYS.map((day, i) => (
                  <div key={i} className="sw-day"><i></i><span>{day}</span></div>
                ))}
              </div>
              <p className="streak-note">Attend a class today to start your streak!</p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
