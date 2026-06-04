'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

const LEVEL_STYLES: Record<string, string> = {
  beginner: 'bg-green-50 text-green-700 border-green-200',
  intermediate: 'bg-blue-50 text-blue-700 border-blue-200',
  advanced: 'bg-purple-50 text-purple-700 border-purple-200',
};

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{completed} / {total} lessons</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ParentDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  const allSessions = children
    .flatMap((c) => c.recentSessions.map((s) => ({ ...s, childName: c.name })))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    .slice(0, 10);

  const stats = [
    { label: 'Children', value: String(children.length), color: 'text-primary-600' },
    { label: 'Active Enrollments', value: String(totalEnrolled), color: 'text-secondary-600' },
    { label: 'Lessons Completed', value: String(totalCompleted), color: 'text-green-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Parent Dashboard</h1>
        <p className="text-gray-500 text-sm">Monitor your children's Arabic learning progress</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
          Loading dashboard…
        </div>
      ) : children.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No children linked to your account yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* My Children */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-4">My Children</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {children.map((child) => (
                <div key={child.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{child.name}</p>
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full border mt-1 capitalize ${
                          LEVEL_STYLES[child.level] ?? 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        {child.level}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary-600">{child.totalPoints}</p>
                      <p className="text-xs text-gray-400">XP</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span title="Day streak">🔥 {child.streak} day{child.streak !== 1 ? 's' : ''}</span>
                    <span title="Lessons completed">✅ {child.lessonsCompleted} lessons</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attendance */}
            <section>
              <h2 className="font-semibold text-gray-900 mb-4">Attendance</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                {allSessions.length === 0 ? (
                  <p className="text-sm text-gray-400">No sessions yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {allSessions.map((s) => {
                      const date = new Date(s.scheduledAt);
                      return (
                        <li key={s.id} className="py-3 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800 truncate">{s.lessonTitle}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {s.courseTitle}
                              {children.length > 1 && (
                                <span className="text-gray-400"> · {s.childName}</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-400">
                              {date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                            </p>
                            <span
                              className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                                s.attended
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-red-50 text-red-600'
                              }`}
                            >
                              {s.attended ? 'Attended' : 'Missed'}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Progress */}
            <section>
              <h2 className="font-semibold text-gray-900 mb-4">Progress</h2>
              <div className="space-y-4">
                {children.map((child) => (
                  <div key={child.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <p className="font-medium text-gray-800 mb-4">{child.name}</p>
                    {child.courseProgress.length === 0 ? (
                      <p className="text-sm text-gray-400">Not enrolled in any courses.</p>
                    ) : (
                      <div className="space-y-4">
                        {child.courseProgress.map((cp) => (
                          <div key={cp.courseTitle}>
                            <p className="text-sm text-gray-600 mb-1 truncate">{cp.courseTitle}</p>
                            <ProgressBar completed={cp.completed} total={cp.total} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
