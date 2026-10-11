'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import {
  homeworkApi,
  answerLabel,
  type HomeworkData,
  type HomeworkQuestion,
  type HomeworkAnswer,
  type Submission,
} from '@/lib/homework';
import './homework.css';
const kind = { MCQ: 'اختيارات', TRUE_FALSE: 'صح أو خطأ', MATCHING: 'توصيل' };
export default function HomeworkWorkspace({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<HomeworkData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    homeworkApi('/' + sessionId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sessionId, retry]);
  return (
    <main className="homework-page" dir="rtl">
      <Link
        href={
          user?.role === 'ADMIN'
            ? '/admin'
            : user?.role === 'TEACHER'
              ? '/teacher/homework'
              : '/student/homework'
        }
        className="btn btn-outline btn-sm"
      >
        العودة
      </Link>
      <header>
        <span className="tag">واجب الحصة</span>
        <h1>{data?.session.title ?? 'واجب الحصة'}</h1>
        <p>{data?.session.course.title}</p>
      </header>
      {loading && <p role="status">جارٍ تحميل الواجب…</p>}
      {error && (
        <div className="homework-error" role="alert">
          {error}
          <button className="btn btn-outline btn-sm" onClick={() => setRetry((v) => v + 1)}>
            إعادة المحاولة
          </button>
        </div>
      )}
      {data &&
        (user?.role === 'ADMIN' ? (
          <HomeworkEditor key={sessionId + ':' + retry} data={data} sessionId={sessionId} />
        ) : user?.role === 'STUDENT' ? (
          <HomeworkSolver
            key={sessionId + ':' + retry}
            data={data}
            sessionId={sessionId}
            userId={user.id}
          />
        ) : user?.role === 'TEACHER' ? (
          <>
            <h2>{data.homework?.title ?? 'لا يوجد واجب لهذه الحصة'}</h2>
            <p>
              الدرجات المقترحة محسوبة تلقائيًا. راجع الإجابات ثم اعتمد النتيجة لولي الأمر والطالب.
            </p>
            {!data.submissions?.length && <p>لم يسلم الطلاب واجباتهم بعد.</p>}
            {data.homework &&
              data.submissions?.map((submission) => (
                <GradeEditor
                  key={submission.id}
                  initial={submission}
                  questions={data.homework!.questions}
                />
              ))}
          </>
        ) : null)}
    </main>
  );
}
function HomeworkEditor({ data, sessionId }: { data: HomeworkData; sessionId: string }) {
  const [title, setTitle] = useState(data.homework?.title ?? 'واجب ' + data.session.title);
  const [questions, setQuestions] = useState<HomeworkQuestion[]>(data.homework?.questions ?? []);
  const [matchingText, setMatchingText] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(data.homework?.version ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const readOnly = data.session.status !== 'SCHEDULED';
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = (id: string, values: Partial<HomeworkQuestion>) => {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...values } : q)));
    setDirty(true);
    setMessage('');
  };
  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await homeworkApi('/' + sessionId, {
        method: 'PUT',
        body: JSON.stringify({ title, questions, version }),
      });
      setVersion(result.version);
      setQuestions(result.questions);
      setMatchingText({});
      setDirty(false);
      setMessage('حُفظ الواجب. يفتح للطلاب بعد انتهاء الحصة.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ؛ بياناتك باقية');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="إعداد واجب الحصة">
      <p>
        {readOnly
          ? 'الحصة بدأت؛ الواجب محفوظ للعرض فقط.'
          : 'جهز الواجب قبل بداية الحصة. كل سؤال له درجة، والواجب يُسلم مرة واحدة.'}
      </p>
      {error && (
        <p className="homework-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="homework-success">
          {message}
        </p>
      )}
      <fieldset disabled={readOnly || busy} className="homework-fields">
        <label className="field">
          عنوان الواجب
          <input
            className="input"
            value={title}
            maxLength={200}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
              setMessage('');
            }}
          />
        </label>
        {questions.map((q, index) => (
          <article
            key={q.id}
            className="card pad homework-question"
            aria-label={`سؤال ${index + 1}`}
          >
            <h2>السؤال {index + 1}</h2>
            <div className="homework-row">
              <label className="field">
                نوع السؤال
                <select
                  className="input"
                  value={q.type}
                  onChange={(e) =>
                    change(q.id, {
                      type: e.target.value as HomeworkQuestion['type'],
                      correctAnswer:
                        e.target.value === 'TRUE_FALSE' ? 'true' : (q.options?.[0] ?? ''),
                      pairs: q.pairs ?? [
                        { left: '', right: '' },
                        { left: '', right: '' },
                      ],
                    })
                  }
                >
                  {Object.entries(kind).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                الدرجة
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={q.points}
                  onChange={(e) => change(q.id, { points: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="field">
              نص السؤال
              <textarea
                className="input"
                rows={2}
                value={q.text}
                maxLength={2000}
                onChange={(e) => change(q.id, { text: e.target.value })}
              />
            </label>
            {q.type === 'MCQ' && (
              <label className="field">
                الخيارات — كل خيار بسطر
                <textarea
                  className="input"
                  rows={4}
                  value={q.options?.join('\n') ?? ''}
                  onChange={(e) => change(q.id, { options: e.target.value.split('\n') })}
                />
              </label>
            )}
            {q.type === 'MATCHING' ? (
              <label className="field">
                الأزواج الصحيحة — كل زوج بسطر، مثل: ألف = أ
                <textarea
                  className="input"
                  rows={4}
                  value={
                    matchingText[q.id] ??
                    q.pairs?.map((p) => `${p.left} = ${p.right}`).join('\n') ??
                    ''
                  }
                  onChange={(e) => {
                    setMatchingText((old) => ({ ...old, [q.id]: e.target.value }));
                    change(q.id, {
                      pairs: e.target.value.split('\n').map((line) => {
                        const at = line.indexOf('=');
                        return {
                          left: (at < 0 ? line : line.slice(0, at)).trim(),
                          right: (at < 0 ? '' : line.slice(at + 1)).trim(),
                        };
                      }),
                    });
                  }}
                />
                <small>
                  من زوجين إلى ٨ أزواج، بدون تكرار. الطالب يشوف قائمة إجابات بترتيب مختلف.
                </small>
              </label>
            ) : (
              <label className="field">
                الإجابة الصحيحة
                <select
                  className="input"
                  value={q.correctAnswer ?? ''}
                  onChange={(e) => change(q.id, { correctAnswer: e.target.value })}
                >
                  <option value="" disabled>
                    اختر الإجابة
                  </option>
                  {(q.type === 'TRUE_FALSE' ? ['true', 'false'] : (q.options ?? []))
                    .filter(Boolean)
                    .map((v, i) => (
                      <option key={i} value={v.trim()}>
                        {answerLabel(v.trim())}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {!readOnly && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setQuestions((qs) => qs.filter((item) => item.id !== q.id));
                  setDirty(true);
                  setMessage('');
                }}
              >
                حذف السؤال {index + 1}
              </button>
            )}
          </article>
        ))}
        {!readOnly && (
          <div className="homework-actions">
            <button
              className="btn btn-outline"
              disabled={questions.length >= 30}
              onClick={() => {
                setQuestions((qs) => [
                  ...qs,
                  {
                    id: crypto.randomUUID(),
                    text: '',
                    type: 'MCQ',
                    points: 1,
                    options: ['', ''],
                    correctAnswer: '',
                  },
                ]);
                setDirty(true);
                setMessage('');
              }}
            >
              إضافة سؤال
            </button>
            <button
              className="btn btn-gold"
              disabled={!dirty || !questions.length}
              onClick={() => void save()}
            >
              {busy ? 'جارٍ الحفظ…' : 'حفظ الواجب'}
            </button>
          </div>
        )}
        {dirty && <p>تعديلاتك لم تُحفظ بعد.</p>}
      </fieldset>
    </section>
  );
}
function HomeworkSolver({
  data,
  sessionId,
  userId,
}: {
  data: HomeworkData;
  sessionId: string;
  userId: string;
}) {
  const hw = data.homework!;
  const storageKey = `midad.homework:${userId}:${sessionId}:${hw.version}`;
  const [answers, setAnswers] = useState<Record<string, HomeworkAnswer>>(
    data.submission?.answers ?? {}
  );
  const [submission, setSubmission] = useState(data.submission ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!data.submission) {
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) setAnswers(raw);
      } catch {
        /* invalid local draft */
      }
    }
    setRestored(true);
  }, [storageKey, data.submission]);
  useEffect(() => {
    if (!restored || submission) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    } catch {
      /* memory state still works */
    }
  }, [answers, restored, submission, storageKey]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await homeworkApi('/' + sessionId + '/submit', {
        method: 'POST',
        body: JSON.stringify({ version: hw.version, answers }),
      });
      setSubmission(result);
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التسليم. إجاباتك باقية؛ أعد المحاولة');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="حل واجب الحصة">
      <h2>{hw.title}</h2>
      {!submission && (
        <p>
          إجاباتك تحفظ تلقائيًا على هذا الجهاز. راجعها قبل التسليم؛ لا يمكن تغييرها بعد التسليم.
        </p>
      )}
      {submission && (
        <div role="status" className="homework-success">
          {submission.publishedAt
            ? `اعتمد المعلم نتيجتك: ${Object.values(submission.grades ?? {}).reduce((a, b) => a + b, 0)} / ${hw.questions.reduce((sum, q) => sum + q.points, 0)}`
            : 'تم تسليم الواجب. بانتظار مراجعة المعلم.'}
        </div>
      )}
      {submission?.publishedAt && submission.feedback && (
        <p className="card pad">ملاحظة المعلم: {submission.feedback}</p>
      )}
      {error && (
        <p role="alert" className="homework-error">
          {error}
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={busy || !!submission || !restored} className="homework-fields">
          {hw.questions.map((q, index) => (
            <fieldset key={q.id} className="card pad homework-question">
              <legend>
                {index + 1}. {q.text} <small>({q.points} درجات)</small>
              </legend>
              {q.type === 'MATCHING'
                ? q.left!.map((label, i) => (
                    <label key={i} className="field">
                      {label}
                      <select
                        className="input"
                        required
                        aria-label={`${q.text}: ${label}`}
                        value={
                          Array.isArray(answers[q.id]) ? ((answers[q.id] as string[])[i] ?? '') : ''
                        }
                        onChange={(e) =>
                          setAnswers((old) => {
                            const values = Array.isArray(old[q.id])
                              ? [...(old[q.id] as string[])]
                              : Array(q.left!.length).fill('');
                            values[i] = e.target.value;
                            return { ...old, [q.id]: values };
                          })
                        }
                      >
                        <option value="">اختر المقابل</option>
                        {q.options!.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))
                : q.options!.map((v) => (
                    <label key={v} className="homework-choice">
                      <input
                        type="radio"
                        required
                        name={q.id}
                        value={v}
                        checked={answers[q.id] === v}
                        onChange={() => setAnswers((old) => ({ ...old, [q.id]: v }))}
                      />
                      <span>{answerLabel(v)}</span>
                    </label>
                  ))}
              {submission?.publishedAt && (
                <p>
                  درجتك: {submission.grades?.[q.id]} / {q.points}
                </p>
              )}
            </fieldset>
          ))}
          {!submission && (
            <button className="btn btn-gold" type="submit">
              {busy ? 'جارٍ تسليم الواجب…' : 'تسليم الواجب'}
            </button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
function GradeEditor({
  initial,
  questions,
}: {
  initial: Submission;
  questions: HomeworkQuestion[];
}) {
  const [submission, setSubmission] = useState(initial);
  const [grades, setGrades] = useState(initial.grades ?? {});
  const [feedback, setFeedback] = useState(initial.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save(publish: boolean) {
    if (busy) return;
    if (
      publish &&
      !window.confirm('اعتماد النتيجة وإظهارها للطالب وولي الأمر؟ بعد الاعتماد لا يمكن تعديلها.')
    )
      return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await homeworkApi('/submissions/' + submission.id + '/grade', {
        method: 'PUT',
        body: JSON.stringify({ version: submission.version, grades, feedback, publish }),
      });
      setSubmission(saved);
      setMessage(publish ? 'اعتمدت النتيجة وأصبحت ظاهرة للأسرة' : 'حُفظت مسودة التصحيح');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card pad homework-question" aria-label={`تصحيح ${initial.studentName}`}>
      <h2>{initial.studentName}</h2>
      <p>
        {submission.publishedAt ? 'نتيجة معتمدة' : 'بانتظار الاعتماد'} ·{' '}
        {new Date(initial.submittedAt).toLocaleString('ar')}
      </p>
      {error && (
        <p role="alert" className="homework-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="homework-success">
          {message}
        </p>
      )}
      <fieldset disabled={busy || !!submission.publishedAt} className="homework-fields">
        {questions.map((q) => (
          <div className="homework-grade" key={q.id}>
            <b>{q.text}</b>
            <p>إجابة الطالب: {answerLabel(initial.answers[q.id])}</p>
            <p>
              الإجابة الصحيحة:{' '}
              {q.type === 'MATCHING'
                ? q.pairs!.map((p) => `${p.left} ← ${p.right}`).join(' · ')
                : answerLabel(q.correctAnswer!)}
            </p>
            <label className="field">
              الدرجة — {q.text}
              <input
                className="input"
                type="number"
                min={0}
                max={q.points}
                value={grades[q.id] ?? 0}
                onChange={(e) => setGrades((g) => ({ ...g, [q.id]: Number(e.target.value) }))}
              />
              <small>من {q.points}</small>
            </label>
          </div>
        ))}
        <label className="field">
          ملاحظة للطالب وولي الأمر
          <textarea
            className="input"
            rows={3}
            maxLength={3000}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </label>
        {!submission.publishedAt && (
          <div className="homework-actions">
            <button className="btn btn-outline" onClick={() => void save(false)}>
              حفظ مسودة التصحيح
            </button>
            <button className="btn btn-gold" onClick={() => void save(true)}>
              اعتماد النتيجة
            </button>
          </div>
        )}
      </fieldset>
    </article>
  );
}
