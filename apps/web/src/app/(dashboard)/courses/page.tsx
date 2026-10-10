'use client';
import '@/components/course-times.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import { useAuth } from '@/components/AuthProvider';
import { courseInquiryUrl, sessionDate } from '@/lib/academy-contact';
import Icon from '@/components/Icon';
type Course = {
  id: string;
  title: string;
  description: string;
  ageGroup: string;
  price: number;
  currency: string;
  month: string | null;
  teacherName: string;
  availableSeats: number;
  timeZone: string;
  sessions: { scheduledAt: string; durationMinutes: number }[];
};
export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [age, setAge] = useState('All');
  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/courses/browse`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
      },
      cache: 'no-store',
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        return j.data;
      })
      .then((d) => {
        if (active) setCourses(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const filtered = courses.filter(
    (c) =>
      (age === 'All' || c.ageGroup === age) &&
      `${c.title} ${c.description}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <main className="wrap" style={{ padding: '32px 24px' }}>
      <span className="eyebrow">MONTHLY COURSES · الدورات الشهرية</span>
      <h1 className="sec-h2">
        {user?.role === 'STUDENT' ? 'دوراتي المسجل فيها' : 'الدورات الشهرية'}
      </h1>
      <p className="sec-sub">
        {user?.role === 'PARENT'
          ? 'تتولى الأكاديمية تسجيل أبنائك بعد التواصل واختيار الدورة المناسبة.'
          : 'الدورات والمعلمون والمواعيد تنظّمها إدارة الأكاديمية.'}
      </p>
      <label className="field">
        ابحث عن دورة
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="اسم الدورة أو وصفها"
        />
      </label>
      <div className="age-filter" style={{ marginBottom: 24 }}>
        {['All', '5–7', '8–10', '11–13', '14–15'].map((a) => (
          <button key={a} className={`chip-f${age === a ? ' on' : ''}`} onClick={() => setAge(a)}>
            {a === 'All' ? 'كل الأعمار' : a}
          </button>
        ))}
      </div>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">جارٍ تحميل الدورات…</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,290px),1fr))',
            gap: 20,
          }}
        >
          {filtered.map((c, i) => (
            <article className="course card" key={c.id}>
              <div className={`co-thumb th-${(i % 6) + 1}`}>
                <Icon name="book" size={44} />
              </div>
              <div className="pad">
                <span className="tag">
                  {c.month || 'دورة سابقة'} · {c.ageGroup}
                </span>
                <h3>{c.title}</h3>
                <p>{c.description}</p>
                <p>{c.teacherName}</p>
                {user?.role === 'PARENT' && (
                  <div className="course-times">
                    <strong>المواعيد القادمة</strong>
                    {c.sessions.length ? (
                      <ul>
                        {c.sessions.map((s) => (
                          <li key={s.scheduledAt}>
                            {sessionDate(s.scheduledAt, c.timeZone)} · {s.durationMinutes} دقيقة
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>تحدد الأكاديمية المواعيد قريبًا.</p>
                    )}
                    <small>توقيت {c.timeZone}</small>
                  </div>
                )}
                {user?.role === 'PARENT' && (
                  <p>
                    {c.availableSeats} مقاعد متاحة ·{' '}
                    {new Intl.NumberFormat('en', {
                      style: 'currency',
                      currency: c.currency,
                    }).format(c.price)}{' '}
                    / شهر
                  </p>
                )}
                {user?.role === 'PARENT' ? (
                  <a
                    className="btn btn-gold"
                    href={courseInquiryUrl(c)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {c.availableSeats > 0 ? 'طلب التسجيل عبر واتساب' : 'استفسر عن قائمة الانتظار'}
                  </a>
                ) : (
                  <Link
                    className="btn btn-gold"
                    href={`/courses/${c.id}/${user?.role === 'ADMIN' ? 'content' : 'lessons'}`}
                  >
                    <Icon name="book" />
                    {user?.role === 'ADMIN' ? 'إدارة المنهج' : 'عرض المواد'}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && !filtered.length && (
        <div className="card pad">
          <h2>لا توجد دورات هنا بعد</h2>
          <p>
            {user?.role === 'STUDENT'
              ? 'ستظهر دورتك عندما تسجّلك الإدارة فيها بالتنسيق مع ولي أمرك.'
              : 'لا توجد دورات تطابق البحث.'}
          </p>
        </div>
      )}
    </main>
  );
}
