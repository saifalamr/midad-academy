'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { academyApi as api } from '@/lib/academy-workflow';
import { writingVerdicts } from '@/lib/writing';
import './writing.css';
type Item = {
  id: string;
  title: string;
  word: string;
  courseTitle: string;
  studentName: string | null;
  submitted: string | null;
  verdict: keyof typeof writingVerdicts | null;
};
export default function WritingHomework() {
  const [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<Item[]>('/writing/homework')
      .then((d) => {
        if (active) setItems(d);
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
  }, [revision]);
  return (
    <section className="writing-homework" aria-label="واجبات الكتابة">
      <h2>واجبات الكتابة</h2>
      {loading ? (
        <p role="status">جارٍ تحميل تمارين الكتابة…</p>
      ) : error ? (
        <p role="alert">
          {error}{' '}
          <button className="btn btn-outline" onClick={() => setRevision((v) => v + 1)}>
            إعادة تحميل الكتابة
          </button>
        </p>
      ) : !items.length ? (
        <p>لا توجد واجبات كتابة متاحة بعد.</p>
      ) : (
        items.map((t, i) => (
          <article key={t.id + ':' + i} className="card pad">
            <h3>{t.title}</h3>
            <p>
              {t.courseTitle}
              {t.studentName ? ' · ' + t.studentName : ''}
            </p>
            <p>
              {t.verdict
                ? writingVerdicts[t.verdict]
                : t.studentName
                  ? 'بانتظار محاولة الطالب'
                  : 'مراجعة محاولات الطلاب'}
            </p>
            <Link className="btn btn-outline" href={'/writing/' + t.id}>
              فتح واجب الكتابة
            </Link>
          </article>
        ))
      )}
    </section>
  );
}
