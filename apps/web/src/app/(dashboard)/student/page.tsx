'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function StudentDashboard() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
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

      if (!res.ok) {
        setError(json.error || 'Could not join class');
        return;
      }

      router.push(`/classroom/${courseId}`);
    } catch {
      setError('Could not connect to server');
    } finally {
      setJoiningId(null);
    }
  }

  const stats = [
    { label: 'Total Points', value: '0 ⭐', color: 'text-primary-600' },
    { label: 'Lessons Completed', value: '0', color: 'text-secondary-600' },
    { label: 'Badges Earned', value: '0 🏆', color: 'text-yellow-500' },
    { label: 'Day Streak', value: '0 🔥', color: 'text-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">My Learning Journey</h1>
        <button
          onClick={() => router.push('/courses')}
          className="bg-primary-500 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-primary-600 transition-colors"
        >
          🔍 Browse Courses
        </button>
      </div>
      <p className="text-gray-500 mb-8">Keep going — every lesson gets you closer to fluency!</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">My Classes</h2>

          {error && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              Loading your classes…
            </div>
          ) : enrollments.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-400 text-sm mb-3">You haven&apos;t enrolled in any classes yet.</p>
              <button
                onClick={() => router.push('/courses')}
                className="text-primary-600 text-sm font-medium hover:underline"
              >
                Browse courses →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {enrollments.map((enrollment) => {
                const { course } = enrollment;
                return (
                  <div key={enrollment.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{course.title}</h3>
                          <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full border border-primary-200">
                            Ages {course.ageGroup}
                          </span>
                          {enrollment.isLive && (
                            <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live now
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">👨‍🏫 {course.teacherName}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                      {enrollment.isLive ? (
                        <button
                          onClick={() => handleJoinClass(course.id)}
                          disabled={joiningId === course.id}
                          className="text-xs font-semibold bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {joiningId === course.id ? 'Joining…' : '▶ Join Class'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">No live session right now</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm h-fit">
          <h2 className="font-semibold text-gray-900 mb-4">My Badges</h2>
          <p className="text-sm text-gray-400">Complete lessons to earn your first badge!</p>
        </div>
      </div>
    </div>
  );
}
