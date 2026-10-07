'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/config';

type Lesson = { id: string; title: string; description: string; type: 'VIDEO' | 'PDF' | 'EXERCISE'; contentUrl: string; duration: number; quiz: { id: string } | null };
type LearningState = { contentId: string; completedAt: string | null; note: string; updatedAt: string };
const icons = { VIDEO: '🎬', PDF: '📄', EXERCISE: '📝' };

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'تعذر الاتصال. حاول مرة أخرى.');
  return json.data;
}

export default function LearningWorkspace({ courseId, lessons, onQuiz, quizLoading }: { courseId: string; lessons: Lesson[]; onQuiz: (id: string) => void; quizLoading: boolean }) {
  const [states, setStates] = useState<Record<string, LearningState>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [student, setStudent] = useState(false);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [openedNotes, setOpenedNotes] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setReady(false); setStudent(false); setStates({}); setNotes({}); setError('');
    (async () => {
      const user = await request('/api/auth/me', { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStudent(user.role === 'STUDENT');
      if (user.role === 'STUDENT') {
        const data: LearningState[] = await request(`/api/learning/courses/${courseId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setStates(Object.fromEntries(data.map(state => [state.contentId, state])));
        setNotes(Object.fromEntries(data.map(state => [state.contentId, state.note])));
      }
      setReady(true);
    })().catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [courseId]);

  const hasDrafts = Object.entries(notes).some(([id, note]) => note !== (states[id]?.note ?? ''));
  useEffect(() => {
    if (!hasDrafts) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDrafts]);

  async function save(id: string, body: { completed?: boolean; note?: string }) {
    setBusy(prev => ({ ...prev, [id]: true })); setError(''); setMessage('');
    try {
      const state: LearningState = await request(`/api/learning/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setStates(prev => ({ ...prev, [id]: state }));
      setMessage(body.note !== undefined ? 'تم حفظ الملاحظة في حسابك.' : 'تم تحديث إنجاز الدرس.');
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر الحفظ. ملاحظتك ما زالت هنا، حاول مرة أخرى.'); }
    finally { setBusy(prev => ({ ...prev, [id]: false })); }
  }

  const completed = lessons.filter(lesson => !!states[lesson.id]?.completedAt).length;
  const next = lessons.find(lesson => !states[lesson.id]?.completedAt);
  const shown = lessons.filter(lesson => `${lesson.title} ${lesson.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (filter === 'all' || (filter === 'done' ? !!states[lesson.id]?.completedAt : !states[lesson.id]?.completedAt)));

  return <section className="learning-workspace" aria-label="الدروس ومتابعة التعلم">
    {student && <div className="card pad learning-summary" dir="rtl">
      <div><h2>خطوة جديدة كل يوم</h2><p>{completed} من {lessons.length} مواد مكتملة</p><small className="muted">تسجّل إنجازك بنفسك؛ الحضور ودرجات الاختبار يُحسبان بشكل مستقل.</small></div>
      <progress aria-label="إنجاز مواد الدورة" value={completed} max={Math.max(1, lessons.length)} />
      {ready && next ? <a className="btn btn-gold btn-sm" href={`#lesson-${next.id}`} onClick={() => { setQuery(''); setFilter('all'); }}>تابع التعلم</a> : ready ? <span className="pill">✓ أنجزت جميع المواد</span> : <span>جاري تحميل تقدمك…</span>}
    </div>}
    <div className="learning-toolbar">
      <label>ابحث عن درس<input className="learning-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم الدرس أو وصفه" /></label>
      {student && <label>عرض الدروس<select className="learning-input" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">كل الدروس</option><option value="todo">لم تُنجز بعد</option><option value="done">المكتملة</option></select></label>}
    </div>
    {error && <p role="alert" className="auth-error">{error} {!ready && <button className="btn btn-sm btn-outline" onClick={() => window.location.reload()}>إعادة المحاولة</button>}</p>}
    <p role="status" className="learning-save-status">{message}</p>
    {!shown.length ? <div className="card pad">لا توجد دروس تطابق البحث أو الفلتر.</div> : shown.map(lesson => {
      const done = !!states[lesson.id]?.completedAt;
      const note = notes[lesson.id] ?? '';
      const dirty = note !== (states[lesson.id]?.note ?? '');
      return <article key={lesson.id} id={`lesson-${lesson.id}`} className={`card pad learning-lesson${done ? ' is-complete' : ''}`}>
        <div className="learning-lesson-head"><span aria-hidden="true">{icons[lesson.type]}</span><div><h3>{lesson.title}</h3><p className="muted">{lesson.description}</p></div><span className="pill">{lesson.duration} min</span></div>
        <div className="learning-actions">
          <a className="btn btn-sm btn-outline" href={lesson.contentUrl} target="_blank" rel="noreferrer">Open</a>
          {lesson.quiz && <button className="btn btn-sm btn-gold" disabled={quizLoading} onClick={() => onQuiz(lesson.quiz!.id)}>Take Quiz</button>}
          {student && <>
            <button className="btn btn-sm btn-outline" aria-pressed={done} disabled={!ready || busy[lesson.id]} onClick={() => save(lesson.id, { completed: !done })}>{done ? '✓ مكتمل · إلغاء الإنجاز' : 'تحديد كمكتمل'}</button>
            <button className="btn btn-sm btn-outline" aria-expanded={!!openedNotes[lesson.id]} aria-controls={`notes-${lesson.id}`} onClick={() => setOpenedNotes(prev => ({ ...prev, [lesson.id]: !prev[lesson.id] }))}>ملاحظاتي {dirty ? '•' : ''}</button>
          </>}
        </div>
        {student && openedNotes[lesson.id] && <div id={`notes-${lesson.id}`} className="learning-notes" dir="rtl">
          <label htmlFor={`note-${lesson.id}`}>ملاحظتك الخاصة لهذا الدرس</label>
          <p className="muted">تظهر لك وحدك. اضغط حفظ قبل مغادرة الصفحة.</p>
          <textarea id={`note-${lesson.id}`} className="learning-input" rows={4} maxLength={5000} value={note} disabled={!ready || busy[lesson.id]} onChange={event => { setNotes(prev => ({ ...prev, [lesson.id]: event.target.value })); setMessage(''); }} />
          <div className="learning-actions"><button className="btn btn-sm btn-gold" disabled={!ready || busy[lesson.id] || !dirty} onClick={() => save(lesson.id, { note })}>{busy[lesson.id] ? 'جاري الحفظ…' : 'حفظ الملاحظة'}</button><small className="muted">{note.length}/5000 · {dirty ? 'تعديلات غير محفوظة' : 'لا توجد تعديلات غير محفوظة'}</small></div>
        </div>}
      </article>;
    })}
  </section>;
}
