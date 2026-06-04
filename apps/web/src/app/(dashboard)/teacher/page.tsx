'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function TeacherDashboard() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ageGroup, setAgeGroup] = useState(AGE_GROUPS[0]);
  const [price, setPrice] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
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

      if (!res.ok) {
        setFormError(json.error || 'Failed to create course');
        return;
      }

      setCourses((prev) => [json.data, ...prev]);
      setShowForm(false);
      setTitle(''); setDescription(''); setAgeGroup(AGE_GROUPS[0]); setPrice('');
    } catch {
      setFormError('Could not connect to server');
    } finally {
      setSubmitting(false);
    }
  }

  const totalStudents = courses.reduce((sum, c) => sum + c._count.enrollments, 0);
  const upcomingSessions = courses.flatMap((c) =>
    c.lessons.map((l) => ({ ...l, courseTitle: c.title }))
  ).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const stats = [
    { label: 'Active Courses', value: String(courses.length), color: 'text-primary-600' },
    { label: 'Total Students', value: String(totalStudents), color: 'text-secondary-600' },
    { label: 'Upcoming Lessons', value: String(upcomingSessions.length), color: 'text-green-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Teacher Dashboard</h1>
          <p className="text-gray-500 text-sm">Manage your courses and students</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-primary-500 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-primary-600 transition-colors"
        >
          + Create New Class
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Classes */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">My Classes</h2>
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              Loading courses…
            </div>
          ) : courses.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-400 text-sm mb-3">No classes yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="text-primary-600 text-sm font-medium hover:underline"
              >
                Create your first class →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {courses.map((course) => (
                <div key={course.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{course.title}</h3>
                        <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full border border-primary-200">
                          Ages {course.ageGroup}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2">{course.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-900">
                        {course.price === 0 ? 'Free' : `$${course.price}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span>👥 {course._count.enrollments} student{course._count.enrollments !== 1 ? 's' : ''}</span>
                    {course.lessons.length > 0 && (
                      <span>📅 {course.lessons.length} upcoming session{course.lessons.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Sessions */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-4">Upcoming Sessions</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-gray-400">No sessions scheduled.</p>
            ) : (
              <ul className="space-y-4">
                {upcomingSessions.map((lesson) => {
                  const date = new Date(lesson.scheduledAt);
                  return (
                    <li key={lesson.id} className="flex gap-3">
                      <div className="bg-primary-50 border border-primary-200 rounded-lg px-2 py-1 text-center min-w-[48px]">
                        <p className="text-xs font-bold text-primary-700 uppercase">
                          {date.toLocaleDateString('en', { month: 'short' })}
                        </p>
                        <p className="text-lg font-bold text-primary-800 leading-none">
                          {date.getDate()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{lesson.title}</p>
                        <p className="text-xs text-gray-500">{lesson.courseTitle}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })} · {lesson.durationMinutes} min
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Create Class Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Create New Class</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700" htmlFor="c-title">
                  Class name
                </label>
                <input
                  id="c-title"
                  type="text"
                  required
                  placeholder="e.g. Beginner Arabic Alphabet"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700" htmlFor="c-desc">
                  Description
                </label>
                <textarea
                  id="c-desc"
                  required
                  rows={3}
                  placeholder="What will students learn?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700" htmlFor="c-age">
                    Age group
                  </label>
                  <select
                    id="c-age"
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 bg-white"
                  >
                    {AGE_GROUPS.map((g) => (
                      <option key={g} value={g}>{g} years</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700" htmlFor="c-price">
                    Price (USD)
                  </label>
                  <input
                    id="c-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Creating…' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
