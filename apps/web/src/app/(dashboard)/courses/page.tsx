'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

type Course = {
  id: string;
  title: string;
  description: string;
  ageGroup: string;
  price: number;
  currency: string;
  teacherName: string;
  studentCount: number;
};

type Enrollment = {
  id: string;
  course: { id: string };
};

const THUMBS = ['th-1', 'th-2', 'th-3', 'th-4', 'th-5', 'th-6'];
const AGE_FILTERS = ['All', '5–7', '8–11', '12–15'];
const CATEGORY_FILTERS = ['All courses', 'Reading & Writing', 'Conversation', 'Grammar', "Qur'an"];

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

export default function BrowseCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [ageFilter, setAgeFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All courses');

  useEffect(() => {
    Promise.all([
      authFetch('/api/courses/browse').then(async (res) => {
        if (res.status === 401) { router.push('/login'); return null; }
        return res.json();
      }),
      authFetch('/api/enrollments').then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      }),
    ])
      .then(([coursesJson, enrollmentsJson]) => {
        if (coursesJson) setCourses(coursesJson.data ?? []);
        if (enrollmentsJson) {
          setEnrolledIds(new Set((enrollmentsJson.data as Enrollment[]).map((e) => e.course.id)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function handleEnroll(courseId: string) {
    setMessage('');
    setEnrollingId(courseId);
    try {
      const res = await authFetch('/api/payments/create-checkout', {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      });
      const json = await res.json();

      if (!res.ok) {
        setMessage(json.error || 'Failed to start enrollment');
        setEnrollingId(null);
        return;
      }

      if (json.data.type === 'checkout') {
        window.location.href = json.data.url;
        return;
      }

      // Free course — enrolled directly
      setEnrolledIds((prev) => new Set(prev).add(courseId));
      setMessage('Enrolled! Find your class on the dashboard.');
      setEnrollingId(null);
    } catch {
      setMessage('Could not connect to server');
      setEnrollingId(null);
    }
  }

  const filtered = courses.filter((c) => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchesAge = ageFilter === 'All' || c.ageGroup.includes(ageFilter.replace('–', '–'));
    return matchesSearch && matchesAge;
  });

  return (
    <div className="midad" style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <Navbar />

      {/* ── Courses hero ── */}
      <div className="courses-hero geo">
        <div className="wrap center">
          <span className="eyebrow">Our Courses · دوراتنا</span>
          <h1 className="ch-h1">Find the perfect class for your child</h1>
          <p className="ch-sub">Live, small-group courses for ages 5–15 — taught by certified native teachers.</p>
          <div className="course-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
            <input
              placeholder="Search courses — ابحث عن دورة…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-gold btn-sm">Search</button>
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="wrap courses-bar">
        <div className="filters">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              className={`filter${categoryFilter === cat ? ' on' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'Grammar' ? 'Grammar — النحو' : cat === "Qur'an" ? "Qur'an" : cat}
            </button>
          ))}
        </div>
        <div className="age-filter">
          <span>Age:</span>
          {AGE_FILTERS.map((a) => (
            <button
              key={a}
              className={`chip-f${ageFilter === a ? ' on' : ''}`}
              onClick={() => setAgeFilter(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* ── Message banner ── */}
      {message && (
        <div className="wrap">
          <div className="auth-error" style={{ background: '#e1f0e7', borderColor: '#a3d4b3', color: 'var(--ok)', marginBottom: 0 }}>
            {message}
          </div>
        </div>
      )}

      {/* ── Course grid ── */}
      <div className="wrap">
        {loading ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, marginTop: 24 }}>
            Loading courses…
          </div>
        ) : filtered.length === 0 ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, marginTop: 24 }}>
            {courses.length === 0 ? 'No courses are available yet — check back soon!' : 'No courses match your search.'}
          </div>
        ) : (
          <div className="course-grid">
            {filtered.map((course, idx) => {
              const enrolled = enrolledIds.has(course.id);
              return (
                <article key={course.id} className="course card">
                  <div className={`cv-thumb ${THUMBS[idx % THUMBS.length]}`}>
                    <span className="ar">{course.title.slice(0, 5)}</span>
                    <span className="cv-age">Ages {course.ageGroup}</span>
                  </div>
                  <div className="cv-body">
                    <div className="cv-tags">
                      <span className="pill pill-navy">Course</span>
                      <span className="cv-rate">★ —</span>
                    </div>
                    <h3 className="cv-title">{course.title}</h3>
                    <p className="cv-desc">{course.description}</p>
                    <div className="cv-meta">
                      <span className="avatar" style={{ width: 24, height: 24 }}>
                        {course.teacherName.charAt(0)}
                      </span>
                      {course.teacherName} · {course.studentCount} student{course.studentCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="cv-foot">
                    <div className="cv-price">
                      {course.price === 0 ? (
                        <b>Free</b>
                      ) : (
                        <><b>${course.price}</b><span>/mo</span></>
                      )}
                    </div>
                    <button
                      className={`btn btn-sm${enrolled ? ' btn-outline' : ' btn-gold'}`}
                      onClick={() => { if (!enrolled) handleEnroll(course.id); }}
                      disabled={enrolled || enrollingId === course.id}
                      style={{ opacity: enrollingId === course.id ? 0.65 : 1 }}
                    >
                      {enrolled ? '✓ Enrolled' : enrollingId === course.id ? 'Enrolling…' : 'Enroll'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* ── CTA band ── */}
        <div className="cta-band geo-navy courses-cta">
          <div>
            <h2 className="cta-h">Not sure which course fits?</h2>
            <p>Book a free placement chat and we&apos;ll match your child to the right level.</p>
          </div>
          <button className="btn btn-lg btn-gold" onClick={() => router.push('/register')}>
            Get a free placement
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="wrap">
          <div className="foot-bottom" style={{ marginTop: 0, border: 'none' }}>
            <span>© 2026 Midad Academy · مداد. All rights reserved.</span>
            <span>Privacy · Terms · Cookies</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
