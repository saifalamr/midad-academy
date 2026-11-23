'use client';

import { PopupNotice } from '@/components/FeedbackProvider';
import Icon from '@/components/Icon';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import LearningWorkspace from '@/components/LearningWorkspace';
import { API_URL } from '@/lib/config';

type ContentType = 'VIDEO' | 'PDF' | 'EXERCISE';

type QuizSummary = {
  id: string;
  title: string;
  passingScore: number;
};

type LessonItem = {
  id: string;
  title: string;
  description: string;
  order: number;
  type: ContentType;
  contentUrl: string;
  duration: number;
  quiz: QuizSummary | null;
};

type QuestionType = 'MCQ' | 'WRITTEN' | 'TRUE_FALSE';

type QuizQuestion = {
  id: string;
  text: string;
  questionType: QuestionType;
  options: string[] | null;
};

type Quiz = {
  id: string;
  title: string;
  passingScore: number;
  revision: number;
  questions: QuizQuestion[];
};

type SubmitResult = {
  score: number;
  passed: boolean;
  status: 'COMPLETE' | 'PENDING_REVIEW';
  passingScore: number;
  totalPoints: number;
  earnedPoints: number;
  results: {
    questionId: string;
    text: string;
    questionType: QuestionType;
    yourAnswer: string | null;
    correctAnswer: string | null;
    correct: boolean | null;
    points: number;
    pointsAwarded: number | null;
    status: 'GRADED' | 'PENDING';
  }[];
};

function authFetch(path: string, options: RequestInit = {}) {
  const token =
    typeof window !== 'undefined'
      ? (localStorage.getItem('token') ?? sessionStorage.getItem('token'))
      : null;
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export default function CourseLessonsPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;

  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);

  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [submissionKey, setSubmissionKey] = useState('');

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    authFetch(`/api/courses/${courseId}/lessons`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'تعذر تحميل الدروس');
        setLessons(json.data ?? []);
      })
      .catch(() => setLoadError('تعذر تحميل الدروس. تحقق من اتصالك وصلاحية التسجيل في الدورة.'))
      .finally(() => setLoading(false));
  }, [courseId, router, reload]);

  async function openQuiz(quizId: string) {
    setQuizError('');
    setResult(null);
    setAnswers({});
    setSubmissionKey(crypto.randomUUID());
    setActiveQuiz(null);
    setQuizLoading(true);
    try {
      const res = await authFetch(`/api/quiz/${quizId}`);
      const json = await res.json();
      if (!res.ok) {
        setQuizError(json.error || 'تعذر تحميل الاختبار. أغلقه وحاول مرة أخرى.');
        return;
      }
      setActiveQuiz(json.data);
    } catch {
      setQuizError('تعذر الاتصال بالخادم. أغلق الاختبار وحاول مرة أخرى.');
    } finally {
      setQuizLoading(false);
    }
  }

  async function handleSubmitQuiz() {
    if (!activeQuiz || submitting) return;
    if (activeQuiz.questions.some((q) => !answers[q.id]?.trim())) {
      setQuizError('أجب عن جميع الأسئلة قبل تسليم الاختبار.');
      return;
    }
    setSubmitting(true);
    setQuizError('');
    try {
      const res = await authFetch(`/api/quiz/${activeQuiz.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers, submissionKey, quizRevision: activeQuiz.revision }),
      });
      const json = await res.json();
      if (!res.ok) {
        setQuizError(json.error || 'تعذر تسليم الاختبار. حاول مرة أخرى.');
        return;
      }
      setResult(json.data);
    } catch {
      setQuizError('تعذر تأكيد التسليم. أعد المحاولة؛ لن تُسجل محاولة إضافية لنفس الطلب.');
    } finally {
      setSubmitting(false);
    }
  }

  function closeQuiz() {
    setActiveQuiz(null);
    setResult(null);
    setAnswers({});
    setQuizError('');
  }

  return (
    <div className="midad" dir="rtl" style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div className="wrap" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => router.push('/student')}
          style={{ marginBottom: 16 }}
        >
          <Icon name="left" /> العودة إلى تعلمي
        </button>

        <Link
          className="btn btn-sm btn-outline"
          href={`/courses/${courseId}/board`}
          style={{ marginBottom: 16 }}
        >
          <Icon name="edit" /> سبورة الدورة
        </Link>

        <div className="page-head" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="dh-title">مواد الدورة</h1>
            <p className="dh-hi">تعلم على راحتك، احفظ ملاحظاتك، وتابع إنجازك درسًا بعد درس.</p>
          </div>
        </div>

        {loadError ? (
          <PopupNotice role="alert" className="auth-error">
            {loadError}{' '}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setReload((value) => value + 1)}
            >
              إعادة المحاولة
            </button>
          </PopupNotice>
        ) : loading ? (
          <div
            className="card pad"
            style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}
          >
            جارٍ تحميل مواد الدورة…
          </div>
        ) : lessons.length === 0 ? (
          <div
            className="card pad"
            style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}
          >
            لم تُضف مواد لهذه الدورة بعد. ستظهر هنا عندما تجهزها الأكاديمية.
          </div>
        ) : (
          <LearningWorkspace
            courseId={courseId}
            lessons={lessons}
            onQuiz={openQuiz}
            quizLoading={quizLoading}
          />
        )}
      </div>

      {/* ── Quiz modal ── */}
      {(activeQuiz || quizLoading || quizError) && (
        <div
          className="modal-bg"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeQuiz();
          }}
        >
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <div>
                <h3>{activeQuiz ? activeQuiz.title : 'الاختبار'}</h3>
              </div>
              <button className="modal-x" onClick={closeQuiz}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {quizLoading && (
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>جارٍ تحميل الاختبار…</p>
              )}
              {quizError && (
                <PopupNotice className="auth-error" role="alert">
                  {quizError}
                </PopupNotice>
              )}

              {activeQuiz &&
                !result &&
                activeQuiz.questions.map((q, i) => (
                  <div
                    key={q.id}
                    className="card pad"
                    style={{ marginBottom: 16, background: 'var(--paper)' }}
                  >
                    <b style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>
                      {i + 1}. {q.text}
                    </b>
                    {q.questionType === 'WRITTEN' ? (
                      <textarea
                        className="input"
                        rows={3}
                        aria-label={`إجابتك: ${q.text}`}
                        maxLength={10000}
                        placeholder="اكتب إجابتك…"
                        value={answers[q.id] ?? ''}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        style={{ height: 78, padding: '12px 16px' }}
                      />
                    ) : (
                      (q.options ?? []).map((opt) => (
                        <label
                          key={opt}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 6,
                            fontSize: 14,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="radio"
                            name={`question-${q.id}`}
                            checked={answers[q.id] === opt}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                          />
                          {opt}
                        </label>
                      ))
                    )}
                  </div>
                ))}

              {result && (
                <div>
                  <div
                    className="card pad"
                    style={{
                      textAlign: 'center',
                      marginBottom: 16,
                      background:
                        result.status === 'PENDING_REVIEW'
                          ? 'rgba(217,119,6,.08)'
                          : result.passed
                            ? 'rgba(22,163,74,.08)'
                            : 'rgba(220,38,38,.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 800,
                        color:
                          result.status === 'PENDING_REVIEW'
                            ? '#d97706'
                            : result.passed
                              ? 'var(--ok, #16a34a)'
                              : '#dc2626',
                      }}
                    >
                      {result.score}%
                    </div>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>
                      {result.status === 'PENDING_REVIEW' ? (
                        <>
                          <Icon name="clock" /> بانتظار تصحيح المعلم
                        </>
                      ) : result.passed ? (
                        <>
                          <Icon name="check" /> ناجح
                        </>
                      ) : (
                        <>
                          <Icon name="close" /> يحتاج مراجعة
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                      درجة النجاح: {result.passingScore}% · صُحّحت {result.earnedPoints} من{' '}
                      {result.totalPoints} نقاط حتى الآن
                    </div>
                    {result.status === 'PENDING_REVIEW' && (
                      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                        وصلت إجاباتك الكتابية إلى المعلم. ستتحدث الدرجة بعد اكتمال التصحيح.
                      </div>
                    )}
                  </div>

                  {result.results.map((r, i) => (
                    <div
                      key={r.questionId}
                      className="card pad"
                      style={{
                        marginBottom: 12,
                        background:
                          r.status === 'PENDING'
                            ? 'rgba(217,119,6,.06)'
                            : r.correct
                              ? 'rgba(22,163,74,.06)'
                              : 'rgba(220,38,38,.05)',
                      }}
                    >
                      <b style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>
                        {i + 1}. {r.text}{' '}
                        {r.status === 'PENDING' ? (
                          <>
                            <Icon name="clock" />
                          </>
                        ) : r.correct ? (
                          <Icon name="check" label="صحيح" />
                        ) : (
                          <Icon name="close" label="غير صحيح" />
                        )}
                      </b>
                      <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                        إجابتك: <b>{r.yourAnswer || '—'}</b>
                      </div>
                      {r.status === 'PENDING' ? (
                        <div style={{ fontSize: 13, color: '#d97706', marginTop: 2 }}>
                          بانتظار مراجعة المعلم
                        </div>
                      ) : (
                        !r.correct &&
                        r.correctAnswer && (
                          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                            الإجابة الصحيحة: <b>{r.correctAnswer}</b>
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" onClick={closeQuiz}>
                {result ? 'إغلاق' : 'إلغاء'}
              </button>
              {activeQuiz && !result && (
                <button
                  className="btn btn-gold"
                  type="button"
                  disabled={submitting}
                  style={{ opacity: submitting ? 0.65 : 1 }}
                  onClick={handleSubmitQuiz}
                >
                  {submitting ? 'جارٍ التسليم…' : 'تسليم الاختبار'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
