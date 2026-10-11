'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { homeworkApi } from '@/lib/homework';
import './homework.css';
type Item = {
  id: string;
  title: string;
  sessionTitle: string;
  courseTitle: string;
  status?: string;
  studentName?: string;
  submittedAt?: string;
  publishedAt?: string | null;
  grades?: Record<string, number>;
  feedback?: string;
  maxPoints?: number;
  pending?: number;
  submissions?: number;
};
export default function HomeworkList() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    homeworkApi('', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setItems(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <main className="homework-page" dir="rtl">
      <header>
        <span className="tag">متابعة التعلم</span>
        <h1>
          {user?.role === 'TEACHER'
            ? 'تصحيح واجبات الحصص'
            : user?.role === 'PARENT'
              ? 'واجبات أبنائي'
              : 'واجباتي'}
        </h1>
        <p>
          {user?.role === 'PARENT'
            ? 'التسليم والنتائج المعتمدة من المعلم، لكل ابن على حدة.'
            : 'واجبات الحصص المنتهية. تظهر النتيجة بعد اعتماد المعلم.'}
        </p>
      </header>
      {loading && <p role="status">جارٍ تحميل الواجبات…</p>}
      {error && (
        <div role="alert" className="homework-error">
          {error}
          <button className="btn btn-outline btn-sm" onClick={() => setRetry((n) => n + 1)}>
            إعادة المحاولة
          </button>
        </div>
      )}
      {!loading && !error && !items.length && (
        <section className="card pad">
          <p>
            {user?.role === 'PARENT'
              ? 'لا توجد واجبات حصص متاحة للأبناء بعد.'
              : 'لا توجد واجبات حصص متاحة بعد.'}
          </p>
        </section>
      )}
      <div className="homework-grid">
        {items.map((item) => (
          <article className="card pad" key={item.id}>
            <span className="tag">{item.studentName ?? item.courseTitle}</span>
            <h2>{item.title}</h2>
            <p>
              {item.sessionTitle} · {item.courseTitle}
            </p>
            {user?.role === 'PARENT' ? (
              <>
                <p>
                  {item.publishedAt
                    ? `الدرجة: ${Object.values(item.grades ?? {}).reduce((sum, v) => sum + v, 0)} / ${item.maxPoints}`
                    : item.status === 'NOT_SUBMITTED'
                      ? 'لم يسلم الواجب بعد'
                      : 'تم التسليم · بانتظار مراجعة المعلم'}
                </p>
                {item.publishedAt && item.feedback && (
                  <p className="homework-feedback">{item.feedback}</p>
                )}
              </>
            ) : (
              <>
                <p>
                  {user?.role === 'TEACHER'
                    ? `${item.submissions} تسليم · ${item.pending} بانتظار الاعتماد`
                    : (
                        {
                          NOT_SUBMITTED: 'لم تسلم بعد',
                          PENDING: 'تم التسليم · بانتظار المعلم',
                          GRADED: 'نتيجة معتمدة',
                        } as Record<string, string>
                      )[item.status ?? '']}
                </p>
                <Link
                  className="btn btn-gold"
                  href={`/${user?.role === 'TEACHER' ? 'teacher' : 'student'}/homework/${item.id}`}
                >
                  {user?.role === 'TEACHER'
                    ? 'مراجعة وتسليم الدرجات'
                    : item.status === 'NOT_SUBMITTED'
                      ? 'حل الواجب'
                      : 'عرض الواجب والنتيجة'}
                </Link>
              </>
            )}
          </article>
        ))}
      </div>
      <p>تُعرض أحدث ١٠٠ حصة أو تسليم.</p>
    </main>
  );
}
