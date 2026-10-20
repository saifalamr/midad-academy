'use client';
import '@/components/course-times.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import { courseInquiryUrl, sessionDate } from '@/lib/academy-contact';
import Icon from './Icon';
import { PopupNotice } from './FeedbackProvider';
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
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setState('loading');
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
  }, [attempt]);
  return (
    <section className="wrap sec" id="monthly-courses" dir="rtl">
      <span className="eyebrow">الدورات الشهرية</span>
      <h2 className="sec-h2">اختر رحلة طفلك القادمة</h2>
      <p className="sec-sub">اختر الدورة وأرسل طلبًا لطفلك داخل حسابك. تؤكد الإدارة التسجيل بعد المراجعة.</p>
      {state === 'loading' ? (
        <p role="status">جارٍ عرض الدورات…</p>
      ) : state === 'error' ? (
        <PopupNotice>
          تعذر تحميل الدورات الآن.
          <button className="btn btn-outline" onClick={() => setAttempt((a) => a + 1)}>
            إعادة المحاولة
          </button>
        </PopupNotice>
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
              <h3 style={{ fontSize: 21, margin: '10px 0' }}>{c.title}</h3>
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
              <div className="catalog-actions">
                <Link className="btn btn-gold" href={`/academy?course=${encodeURIComponent(c.id)}`}>
                  {c.availableSeats > 0 ? 'سجّل طفلك' : 'مكتملة — الانضمام لقائمة الانتظار'}
                </Link>
                <a className="btn btn-outline" href={courseInquiryUrl(c)} target="_blank" rel="noopener noreferrer">استفسار عبر واتساب</a>
                <Link className="btn btn-outline" href="/register">
                  <Icon name="family" /> إنشاء حساب ولي الأمر
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
