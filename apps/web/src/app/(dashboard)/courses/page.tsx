'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
      const res = await authFetch('/api/enrollments', {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      });
      const json = await res.json();

      if (!res.ok) {
        setMessage(json.error || 'Failed to enroll');
        return;
      }

      setEnrolledIds((prev) => new Set(prev).add(courseId));
      setMessage('Enrolled! Find your class on the dashboard.');
    } catch {
      setMessage('Could not connect to server');
    } finally {
      setEnrollingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Browse Courses</h1>
        <p className="text-gray-500 text-sm">Find your next Arabic class and enroll in a couple of clicks</p>
      </div>

      {message && (
        <div className="mb-6 text-sm bg-primary-50 text-primary-700 border border-primary-200 rounded-lg px-4 py-2.5">
          {message}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          Loading courses…
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          No courses are available yet — check back soon!
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => {
            const enrolled = enrolledIds.has(course.id);
            return (
              <div key={course.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{course.title}</h3>
                  <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full border border-primary-200">
                    Ages {course.ageGroup}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-3 mb-3 flex-1">{course.description}</p>
                <p className="text-xs text-gray-500 mb-4">👨‍🏫 {course.teacherName}</p>

                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">
                    {course.price === 0 ? 'Free' : `$${course.price}`}
                  </p>
                  <button
                    onClick={() => handleEnroll(course.id)}
                    disabled={enrolled || enrollingId === course.id}
                    className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors ${
                      enrolled
                        ? 'bg-green-50 text-green-700 border border-green-200 cursor-default'
                        : 'bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-60 disabled:cursor-not-allowed'
                    }`}
                  >
                    {enrolled ? '✓ Enrolled' : enrollingId === course.id ? 'Enrolling…' : 'Enroll'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
