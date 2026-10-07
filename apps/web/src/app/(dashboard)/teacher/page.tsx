'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PaymentReviewNotice from '@/components/PaymentReviewNotice';
import { API_URL } from '@/lib/config';

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

type ClassSession = {
  id: string;
  courseId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  course: { id: string; title: string };
};

const AGE_GROUPS = ['5–7', '8–10', '11–13', '14–15'];
const THUMBS = ['th-1', 'th-2', 'th-3', 'th-4', 'th-5', 'th-6'];

function authFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('token') ?? sessionStorage.getItem('token')) : null;
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
    const token = (localStorage.getItem('token') ?? sessionStorage.getItem('token'));
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
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [userName, setUserName] = useState('Teacher');
  const formRef = useRef<HTMLFormElement>(null);

  const [title, setTitle] = useState('');
  const [desc…2222 tokens truncated…: 14 }}>
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
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => router.push(`/courses/${course.id}/content`)}
                        >
                          Manage Content
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => openScheduleModal(course)}
                        >
                          Schedule Class
                        </button>
                        <button
                          className="btn btn-sm btn-gold"
                          onClick={() => { const session = sessions.find((s) => s.courseId === course.id && ['SCHEDULED', 'LIVE'].includes(s.status)); if (session) void handleStartSession(session); else openScheduleModal(course); }}
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
              <div className="col-head sm"><h3>Upcoming Sessions <span className="ar muted">الجلسات القادمة</span></h3></div>
              {sessions.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No classes scheduled yet.</p>
              ) : (
                <ul className="agenda">
                  {sessions.map((session) => {
                    const dt = new Date(session.scheduledAt);
                    return (
                      <li key={session.id}>
                        <span className="ag-time">
                          {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          <br />
                          {dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <div style={{ flex: 1 }}>
                          <b>{session.title}</b>
                          <span>{session.course.title} · {session.durationMinutes} min</span>
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button
                              className="btn btn-sm btn-gold"
                              disabled={startingId === session.id}
                              style={{ opacity: startingId === session.id ? 0.65 : 1 }}
                              onClick={() => handleStartSession(session)}
                            >
                              {startingId === session.id ? 'Starting…' : 'Start Class'}
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              disabled={cancellingId === session.id}
                              style={{ opacity: cancellingId === session.id ? 0.65 : 1 }}
                              onClick={() => handleCancelSession(session.id)}
                            >
                              {cancellingId === session.id ? 'Cancelling…' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card pad">
              <div className="col-head sm"><h3>Today’s sessions</h3></div>
              {sessions.filter((session) => new Date(session.scheduledAt).toDateString() === new Date().toDateString()).length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>No sessions scheduled today.</p>
              ) : (
                <ul className="agenda">
                  {sessions.filter((session) => new Date(session.scheduledAt).toDateString() === new Date().toDateString()).map((session) => (
                    <li key={session.id}>
                      <span className="ag-time">{new Date(session.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <div><b>{session.title}</b><span>{session.course.title}</span></div>
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
                <label htmlFor="c-desc">Description</label>
                <textarea id="c-desc" className="input" rows={3} required minLength={10}
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

              <div className="field"><label htmlFor="c-capacity">الحد الأقصى للطلاب</label><input id="c-capacity" className="input" type="number" min="1" max="100" required value={maxStudents} onChange={event => setMaxStudents(event.target.value)} /></div>
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

      {/* ── Schedule class modal ── */}
      {showScheduleModal && scheduleCourse && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setShowScheduleModal(false); }}>
          <div className="modal">
            <div className="modal-head">
              <div><h3>Schedule Class</h3><p className="ar muted" style={{ fontSize: 14 }}>{scheduleCourse.title}</p></div>
              <button className="modal-x" onClick={() => setShowScheduleModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>

            <form ref={scheduleFormRef} onSubmit={handleScheduleSession} className="modal-body">
              <div className="field">
                <label htmlFor="s-title">Session title</label>
                <input id="s-title" className="input" type="text" required
                  placeholder="e.g. Weekly conversation practice"
                  value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="s-desc">Description</label>
                <textarea id="s-desc" className="input" rows={3}
                  placeholder="What will this session cover?"
                  value={sessionDescription} onChange={(e) => setSessionDescription(e.target.value)}
                  style={{ height: 78, padding: '12px 16px' }} />
              </div>

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="s-when">Date &amp; time</label>
                  <input id="s-when" className="input" type="datetime-local" required
                    value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="s-duration">Duration (minutes)</label>
                  <input id="s-duration" className="input" type="number" min="1" step="1"
                    value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
                </div>
              </div>

              {scheduleError && <div className="auth-error">{scheduleError}</div>}
            </form>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" onClick={() => setShowScheduleModal(false)}>Cancel</button>
              <button className="btn btn-gold" type="button" disabled={scheduling}
                style={{ opacity: scheduling ? 0.65 : 1 }}
                onClick={() => scheduleFormRef.current?.requestSubmit()}>
                {scheduling ? 'Scheduling…' : 'Schedule Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
