'use client';
import '@/components/course-times.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import { courseInquiryUrl, sessionDate } from '@/lib/academy-contact';
import Icon from './Icon';
type Course = {
  id: string;
  title: string;
  description: string;
  month: string;
  ageGroup: string;
  price: number;
  currency: string;
  teacherName: string;
  availableSeats: number;
  timeZone: string;
  sessions: { scheduledAt: string; durationMinutes: number }[];
};
export default function MonthlyCatalog() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/courses/catalog`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => {
        if (active) {
          setCourses(j.data);
          setState('ready');
        }
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="wrap sec" id="monthly-courses">
      <span className="eyebrow">الدورات الشهرية</span>
      <h2 className="sec-h2">اختر رحلة طفلك القادمة</h2>
      <p className="sec-sub">يتواصل ولي الأمر مع الأكاديمية، وتتولى الإدارة تسجيل الأبناء.</p>
      {state === 'loading' ? (
        <p role="status">جارٍ عرض الدورات…</p>
      ) : state === 'error' ? (
        <p role="status">تعذر تحميل الدورات الآن. حاول مجددًا لاحقًا.</p>
      ) : !courses.length ? (
        <p>سيتم الإعلان عن الدورات الشهرية هنا قريبًا.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,290px),1fr))',
            gap: 20,
          }}
        >
          {courses.map((c) => (
            <article key={c.id} className="card pad">
              <span className="tag">
                {c.month} · الأعمار {c.ageGroup}
              </span>
              <h3 style={{ fontSize: 24, margin: '16px 0' }}>{c.title}</h3>
              <p>{c.description}</p>
              <p>
                {c.teacherName} · {c.availableSeats} مقاعد متاحة
              </p>
              <p>
                <b>
                  {new Intl.NumberFormat('en', { style: 'currency', currency: c.currency }).format(
                    c.price
                  )}
                </b>{' '}
                / شهر
              </p>
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
              <a
                className="btn btn-gold"
                href={courseInquiryUrl(c)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.availableSeats > 0 ? 'طلب التسجيل عبر واتساب' : 'استفسر عن قائمة الانتظار'}
              </a>
              <Link className="btn btn-outline" style={{ marginTop: 12 }} href="/register">
                <Icon name="family" /> إنشاء حساب ولي الأمر
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
