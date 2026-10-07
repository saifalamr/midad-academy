'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
type Student = { id: string; courseId: string; name: string; email: string; courseTitle: string; level: string; totalPoints: number; materialsTotal: number; materialsCompleted: number };
export default function TeacherStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('');
  const [progressFilter, setProgressFilter] = useState('all');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/teacher/students`, { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}` } })
      .then(async res => { const json = await res.json(); if (!res.ok) throw new Error(json.error || 'تعذر تحميل الطلاب'); setStudents(json.data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const shown = students.filter(student => `${student.name} ${student.email}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (!course || student.courseId === course) && (progressFilter === 'all' || (progressFilter === 'done' ? student.materialsTotal > 0 && student.materialsCompleted === student.materialsTotal : student.materialsCompleted === 0)));
  const courses = [...new Map(students.map(student => [student.courseId, student.courseTitle])).entries()];
  return <main className="midad wrap" style={{ padding: '32px 20px' }}>
    <Link href="/teacher" className="link-gold">← Teacher dashboard</Link>
    <h1 className="sec-h2">Your students · طلابك</h1>
    <p className="muted">تابع إنجاز المواد لكل طالب. الإنجاز يحدده الطالب؛ درجات الاختبارات والحضور مستقلان.</p>
    {error && <p role="alert" className="auth-error">{error} <button className="btn btn-outline btn-sm" onClick={() => window.location.reload()}>إعادة المحاولة</button></p>}
    <div className="learning-toolbar">
      <label>البحث عن طالب<input className="learning-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="الاسم أو البريد" /></label>
      <label>الدورة<select className="learning-input" value={course} onChange={event => setCourse(event.target.value)}><option value="">كل الدورات</option>{courses.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
      <label>إنجاز المواد<select className="learning-input" value={progressFilter} onChange={event => setProgressFilter(event.target.value)}><option value="all">كل الطلاب</option><option value="not-started">لم يسجلوا إنجازًا</option><option value="done">أنجزوا كل المواد</option></select></label>
    </div>
    {loading ? <p role="status">Loading students…</p> : <>
      <p role="status" className="muted">{shown.length} تسجيل من {students.length}</p>
      {!shown.length ? <div className="card pad">{students.length ? 'لا يوجد طلاب يطابقون البحث.' : 'No enrolled students yet.'}</div> :
        <div className="card pad" style={{ overflowX: 'auto' }}><table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <caption className="muted" style={{ textAlign: 'start', marginBottom: 12 }}>الطلاب المسجلون ونسبة إنجاز مواد الدورة</caption>
          <thead><tr>{['Name', 'Email', 'Course', 'Level', 'XP', 'إنجاز المواد'].map(heading => <th scope="col" key={heading} style={{ padding: 12 }}>{heading}</th>)}</tr></thead>
          <tbody>{shown.map(student => <tr key={student.id}>
            {[student.name, student.email, student.courseTitle, student.level, student.totalPoints].map((value, i) => <td key={i} style={{ padding: 12, borderTop: '1px solid var(--line)', overflowWrap: 'anywhere' }}>{value}</td>)}
            <td style={{ padding: 12, borderTop: '1px solid var(--line)', minWidth: 130 }}>{student.materialsCompleted}/{student.materialsTotal}<progress style={{ display: 'block', width: '100%', accentColor: 'var(--gold)' }} aria-label={`إنجاز ${student.name} في ${student.courseTitle}`} max={Math.max(1, student.materialsTotal)} value={student.materialsCompleted} /></td>
          </tr>)}</tbody>
        </table></div>}
    </>}
  </main>;
}
