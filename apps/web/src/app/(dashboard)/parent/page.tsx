'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Session = {
  id: string;
  courseTitle: string;
  lessonTitle: string;
  scheduledAt: string;
  attended: boolean;
};

type CourseProgress = {
  courseTitle: string;
  total: number;
  completed: number;
};

type Child = {
  id: string;
  name: string;
  level: string;
  totalPoints: number;
  streak: number;
  lessonsCompleted: number;
  totalLessons: number;
  courseProgress: CourseProgress[];
  recentSessions: Session[];
};

type Overview = {
  children: Child[];
};

function authFetch(path: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(`http://localhost:4000${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

const CHILD_COLORS = [
  { bg: '#dce6f4', color: 'var(--navy)' },
  { bg: '#e3efe6', color: '#2a6d49' },
  { bg: '#f4dede', color: '#b3463b' },
  { bg: '#f3e8d4', color: '#8a5a1a' },
];

export default function ParentDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Parent');

  useEffect(() => {
    const payload = getTokenPayload();
    setUserName(payload.name ?? 'Parent');

    authFetch('/api/parent/overview')
      .then(async (res) => {
        if (res.status === 401) { router.push('/login'); return; }
        const json = await res.json();
        setOverview(json.data ?? { children: [] });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const children = overview?.children ?? [];
  const totalCompleted = children.reduce((s, c) => s + c.lessonsCompleted, 0);
  const totalEnrolled = children.reduce((s, c) => s + c.courseProgress.length, 0);
  const familyXP = children.reduce((s, c) => s + c.totalPoints, 0);

  const allSessions = children
    .flatMap((c) => c.recentSessions.map((s) => ({ ...s, childName: c.name })))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    .slice(0, 5);

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
            <a className="on">Overview</a>
            <a>Children</a>
            <a>Reports</a>
          </nav>
          <div className="ab-right">
            <span className="role-tag">Parent · وليّ أمر</span>
            <div className="ab-user">
              <span className="avatar" style={{ width: 38, height: 38, background: '#f4dede', color: '#b3463b' }}>{initial}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="dash">

        {/* ── Page head ── */}
        <div className="page-head">
          <div>
            <p className="dh-hi">Good morning, <b>{userName}</b> <span className="ar dh-ar">صباح الخير</span></p>
            <h1 className="dh-title">Your family&apos;s progress</h1>
          </div>
          <button className="btn btn-outline">Download weekly report</button>
        </div>

        {/* ── Stats row ── */}
        <div className="stat-row">
          <div className="stat card"><div className="st-ic st-navy">👨‍👩‍👧</div><div><b>{loading ? '—' : children.length}</b><span>Children enrolled</span></div></div>
          <div className="stat card"><div className="st-ic st-fire">🗓️</div><div><b>{loading ? '—' : totalEnrolled}</b><span>Active classes</span></div></div>
          <div className="stat card"><div className="st-ic st-gold">⭐</div><div><b>{loading ? '—' : familyXP}</b><span>Family XP</span></div></div>
          <div className="stat card"><div className="st-ic st-green">✓</div><div><b>{loading ? '—' : totalCompleted}</b><span>Lessons done</span></div></div>
        </div>

        {loading ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            Loading dashboard…
          </div>
        ) : children.length === 0 ? (
          <div className="card pad" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 14 }}>No children linked to your account yet.</p>
            <Link href="/courses" className="btn btn-gold btn-sm">Browse courses</Link>
          </div>
        ) : (
          <>
            {/* ── Children grid ── */}
            <div className="col-head" style={{ marginTop: 8 }}>
              <h2>My Children <span className="ar muted">أبنائي</span></h2>
            </div>
            <div className="child-grid">
              {children.map((child, idx) => {
                const col = CHILD_COLORS[idx % CHILD_COLORS.length];
                const pct = child.totalLessons > 0
                  ? Math.round((child.lessonsCompleted / child.totalLessons) * 100)
                  : 0;
                return (
                  <div key={child.id} className="child card">
                    <div className="ch-head">
                      <span className="avatar ch-av" style={{ background: col.bg, color: col.color }}>
                        {child.name.charAt(0)}
                      </span>
                      <div>
                        <div className="ch-name">{child.name}</div>
                        <div className="ch-meta capitalize">{child.level}</div>
                      </div>
                      <span className="mini-chip"><span className="mc-ic">🔥</span> {child.streak}</span>
                    </div>

                    <div className="ch-xp">
                      <div className="lvl-row"><span>{child.totalPoints} XP</span><span className="capitalize">{child.level}</span></div>
                      <div className="bar"><i style={{ width: `${pct}%` }}></i></div>
                    </div>

                    <div className="ch-stats">
                      <div><b>{child.courseProgress.length}</b><span>Courses</span></div>
                      <div><b>{child.lessonsCompleted}</b><span>Lessons done</span></div>
                      <div><b>{child.streak}</b><span>Day streak</span></div>
                    </div>

                    <div className="ch-next">
                      <span className="nx-dot"></span>
                      <b>Progress:</b> {child.lessonsCompleted} of {child.totalLessons} lessons
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Bottom grid ── */}
            <div className="dash-grid p-grid">
              <div className="card pad">
                <div className="col-head sm">
                  <h3>Attendance timeline <span className="ar muted">سجلّ الحضور</span></h3>
                </div>
                {allSessions.length === 0 ? (
                  <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No sessions yet.</p>
                ) : (
                  <ul className="timeline">
                    {allSessions.map((s) => {
                      const date = new Date(s.scheduledAt);
                      return (
                        <li key={s.id}>
                          <span className={`tl-dot ${s.attended ? 'ok' : 'miss'}`}></span>
                          <div className="tl-body">
                            <div className="tl-row">
                              <b>{s.lessonTitle}</b>
                              <span className={`tl-tag ${s.attended ? 'ok' : 'miss'}`}>
                                {s.attended ? 'Attended' : 'Missed'}
                              </span>
                            </div>
                            <span className="tl-sub">
                              {children.length > 1 ? `${s.childName} · ` : ''}{s.courseTitle} · {date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="dash-col">
                <div className="card pad report-card">
                  <div className="col-head sm"><h3>This week</h3></div>
                  <div className="rep-big">
                    <b>{totalCompleted}</b>
                    <span>lessons attended</span>
                  </div>
                  <div className="rep-rows">
                    <div className="rep-row"><span>Total XP earned</span><b>{familyXP}</b></div>
                    <div className="rep-row"><span>Lessons done</span><b>{totalCompleted} / {children.reduce((s, c) => s + c.totalLessons, 0)}</b></div>
                    <div className="rep-row"><span>Active children</span><b>{children.length}</b></div>
                  </div>
                  <p className="rep-note">Keep supporting your children&apos;s learning! 🌟</p>
                </div>

                <div className="card pad">
                  <div className="col-head sm"><h3>Plan</h3></div>
                  <div className="pay-row">
                    <div><b>Scholar plan</b><span>Manage your subscription</span></div>
                    <Link href="/courses" className="link-gold">Manage</Link>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
