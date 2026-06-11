'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Lesson = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
};

type Course = {
  id: string;
  title: string;
  description: string;
  ageGroup: string;
  price: number;
  currency: string;
  _count: { enrollments: number };
  lessons: Lesson[];
};

const AGE_GROUPS = ['5–7', '8–10', '11–13', '14–15'];
const THUMBS = ['th-1', 'th-2', 'th-3', 'th-4', 'th-5', 'th-6'];

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

export default function TeacherDashboard() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [userName, setUserName] = useState('Teacher');
  const formRef = useRef<HTMLFormElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ageGroup, setAgeGroup] = useState(AGE_GROUPS[0]);
  const [price, setPrice] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const payload = getTokenPayload();
    setUserName(payload.name ?? 'Teacher');

    authFetch('/api/courses')
      .then(async (res) => {
        if (res.status === 401) { router.push('/login'); return; }
        const json = await res.json();
        setCourses(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const res = await authFetch('/api/courses', {
        method: 'POST',
        body: JSON.stringify({ title, description, ageGroup, price: parseFloat(price) || 0 }),
      });
      const json = await res.json();
      if (!res.ok) { setFormError(json.error || 'Failed to create course'); return; }
      setCourses((prev) => [json.data, ...prev]);
      setShowModal(false);
      setTitle(''); setDescription(''); setAgeGroup(AGE_GROUPS[0]); setPrice('');
    } catch {
      setFormError('Could not connect to server');
    } finally {
      setSubmitting(false);
    }
  }

  const totalStudents = courses.reduce((sum, c) => sum + c._count.enrollments, 0);
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
            <a>My Courses</a>
            <a>Students</a>
          </nav>
          <div className="ab-right">
            <span className="role-tag">Teacher · معلّم</span>
            <div className="ab-user">
              <span className="avatar" style={{ width: 38, height: 38, background: 'rgba(27,58,107,.12)', color: 'var(--navy)' }}>{initial}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="dash">

        {/* ── Page head ── */}
        <div className="page-head">
          <div>
            <p className="dh-hi">Welcome back, <b>{userName}</b> <span className="ar dh-ar">أهلاً</span></p>
            <h1 className="dh-title">Your teaching, at a glance</h1>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/teacher/review-answers" className="btn btn-outline btn-lg">
              📝 Review Answers
            </Link>
            <button className="btn btn-gold btn-lg" onClick={() => setShowModal(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14"/></svg>
              Create New Class
            </button>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="stat-row">
          <div className="stat card"><div className="st-ic st-navy">📚</div><div><b>{courses.length}</b><span>Active courses</span></div></div>
          <div className="stat card"><div className="st-ic st-gold">👨‍🎓</div><div><b>{totalStudents}</b><span>Students</span></div></div>
          <div className="stat card"><div className="st-ic st-fire">🗓️</div><div><b>{courses.reduce((s, c) => s + c.lessons.length, 0)}</b><span>Lessons scheduled</span></div></div>
          <div className="stat card"><div className="st-ic st-green">★</div><div><b>—</b><span>Avg. rating</span></div></div>
        </div>

        <div className="dash-grid t-grid">

          {/* ── Courses column ── */}
          <div className="dash-col">
            <div className="col-head">
              <h2>My Classes <span className="ar muted">صفوفي</span></h2>
            </div>

            {loading ? (
              <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
                Loading courses…
              </div>
            ) : (
              <div className="tc-grid">
                {courses.map((course, idx) => (
                  <div key={course.id} className="tclass card">
                    <div className="tc-top">
                      <span className="tc-when">Ages {course.ageGroup}</span>
                      <span className="tc-lvl">{course.price === 0 ? 'Free' : `$${course.price}`}</span>
                    </div>
                    <div className={`tc-thumb ${THUMBS[idx % THUMBS.length]}`}>
                      <span>{course.title.slice(0, 4)}</span>
                    </div>
                    <div className="tc-name">{course.title}</div>
                    <div className="tc-en">{course.description?.slice(0, 60) ?? ''}</div>
                    <div className="tc-foot">
                      <span className="tc-students">
                        <span className="dotrow">
                          {Array.from({ length: Math.min(course._count.enrollments, 3) }).map((_, i) => <i key={i}></i>)}
                        </span>
                        {course._count.enrollments} student{course._count.enrollments !== 1 ? 's' : ''}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => router.push(`/courses/${course.id}/content`)}
                        >
                          Manage Content
                        </button>
                        <button
                          className="btn btn-sm btn-gold"
                          onClick={() => router.push(`/classroom/${course.id}`)}
                        >
                          Start Class
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add new class card */}
                <button className="tclass card tclass-add" onClick={() => setShowModal(true)}>
                  <span className="add-plus">+</span>
                  <b>Create New Class</b>
                  <span>Set up a course, level &amp; schedule</span>
                </button>
              </div>
            )}
          </div>

          {/* ── Side column ── */}
          <div className="dash-col">
            <div className="card pad">
              <div className="col-head sm"><h3>Up next today</h3></div>
              {courses.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No sessions scheduled yet.</p>
              ) : (
                <ul className="agenda">
                  {courses.slice(0, 3).map((course, i) => (
                    <li key={course.id} className={i === 2 ? 'dim' : ''}>
                      <span className="ag-time">—</span>
                      <div>
                        <b className="ar">{course.title}</b>
                        <span>{course._count.enrollments} student{course._count.enrollments !== 1 ? 's' : ''}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card pad">
              <div className="col-head sm"><h3>Recent activity</h3></div>
              {courses.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No activity yet.</p>
              ) : (
                <ul className="feed">
                  {courses.slice(0, 3).map((course) => (
                    <li key={course.id}>
                      <span className="fd-dot ok"></span>
                      <div>New enrolment in <b>{course.title}</b></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* ── Create class modal ── */}
      {showModal && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-head">
              <div><h3>Create New Class</h3><p className="ar muted" style={{ fontSize: 14 }}>إنشاء صفّ جديد</p></div>
              <button className="modal-x" onClick={() => setShowModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>

            <form ref={formRef} onSubmit={handleCreateCourse} className="modal-body">
              <div className="field">
                <label htmlFor="c-title">Class name <span className="ar muted">اسم الصفّ</span></label>
                <input id="c-title" className="input" type="text" required
                  placeholder="e.g. Arabic Letters — الحروف الهجائية"
                  value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="c-desc">Description <span className="muted" style={{ fontSize: 12 }}>(optional)</span></label>
                <textarea id="c-desc" className="input" rows={3}
                  placeholder="What will students learn in this class?"
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  style={{ height: 78, padding: '12px 16px' }} />
              </div>

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="c-age">Age group</label>
                  <select id="c-age" className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                    {AGE_GROUPS.map((g) => <option key={g} value={g}>{g} years</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="c-price">Price (USD)</label>
                  <input id="c-price" className="input" type="number" min="0" step="0.01" placeholder="0"
                    value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
              </div>

              {formError && <div className="auth-error">{formError}</div>}
            </form>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-gold" type="button" disabled={submitting}
                style={{ opacity: submitting ? 0.65 : 1 }}
                onClick={() => formRef.current?.requestSubmit()}>
                {submitting ? 'Creating…' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
