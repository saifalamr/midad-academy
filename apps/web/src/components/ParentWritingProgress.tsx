'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { academyApi } from '@/lib/academy-workflow';
import { writingVerdicts } from '@/lib/writing';

type WritingProgress = {
  studentId: string;
  taskId: string;
  title: string;
  useAs: 'ACTIVITY' | 'HOMEWORK';
  sessionTitle: string;
  courseTitle: string;
  submittedAt: string;
  verdict: keyof typeof writingVerdicts;
};

export default function ParentWritingProgress({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [items, setItems] = useState<WritingProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    academyApi<WritingProgress[]>('/writing/parent-progress')
      .then((data) => { if (active) setItems(data); })
      .catch(() => { if (active) setError('تعذر تحميل تدريبات الكتابة.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const own = items.filter((item) => item.studentId === studentId);
  return (
    <section className="card pad" aria-label={`تدريبات الكتابة للطفل ${studentName}`}>
      <h2>تدريبات الكتابة · {studentName}</h2>
      <p className="muted">محاولات الطفل المسلّمة في الحصص المكتملة، سواء كانت نشاطًا أو واجبًا.</p>
      {loading ? <p role="status">جارٍ تحميل تدريبات الكتابة…</p> : error ? (
        <p role="alert">{error} <button type="button" className="btn btn-outline btn-sm" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button></p>
      ) : !own.length ? <p>لم يسلّم الطفل تدريب كتابة في حصة مكتملة بعد.</p> : (
        <ul className="family-list">
          {own.map((item) => (
            <li key={item.taskId}>
              <div>
                <b>{item.title}</b>
                <span>{item.useAs === 'ACTIVITY' ? 'نشاط داخل الحصة' : 'واجب كتابة'} · {item.sessionTitle} · {item.courseTitle}</span>
                <small>سُلّم {new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.submittedAt))}</small>
              </div>
              <span className="family-status">{writingVerdicts[item.verdict]}</span>
              <Link className="btn btn-outline btn-sm" href={`/writing/${item.taskId}`}>عرض كتابة الطفل</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
