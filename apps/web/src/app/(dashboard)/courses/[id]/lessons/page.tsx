'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

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

const TYPE_ICON: Record<ContentType, string> = {
  VIDEO: '🎬',
  PDF: '📄',
  EXERCISE: '📝',
};

function authFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(`http://localhost:4000${path}`, {
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

  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quizError, setQuizError] = useState('');

  useEffect(() => {
    authFetch(`/api/courses/${courseId}/lessons`)
      .then(async (res) => {
        if (res.status === 401) { router.push('/login'); return; }
        const json = await res.json();
        setLessons(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, router]);

  async function openQuiz(quizId: string) {
    setQuizError('');
    setResult(null);
    setAnswers({});
    setQuizLoading(true);
    try {
      const res = await authFetch(`/api/quiz/${quizId}`);
      const json = await res.json();
      if (!res.ok) { setQuizError(json.error || 'Failed to load quiz'); return; }
      setActiveQuiz(json.data);
    } catch {
      setQuizError('Could not connect to server');
    } finally {
      setQuizLoading(false);
    }
  }

  async function handleSubmitQuiz() {
    if (!activeQuiz) return;
    setSubmitting(true);
    setQuizError('');
    try {
      const res = await authFetch(`/api/quiz/${activeQuiz.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok) { setQuizError(json.error || 'Failed to submit quiz'); return; }
      setResult(json.data);
    } catch {
      setQuizError('Could not connect to server');
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
    <div className="midad" style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <Navbar />

      <div className="wrap" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <button className="btn btn-sm btn-outline" onClick={() => router.push('/student')} style={{ marginBottom: 16 }}>
          ← Back to dashboard
        </button>

        <div className="page-head" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="dh-title">Course Lessons</h1>
            <p className="dh-hi">Watch, read, and take quizzes to track your progress.</p>
          </div>
        </div>

        {loading ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            Loading lessons…
          </div>
        ) : lessons.length === 0 ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            No lessons have been added to this course yet.
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            {lessons.map((lesson, idx) => (
              <div
                key={lesson.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                  borderBottom: idx < lessons.length - 1 ? '1px solid var(--line, #e5e7eb)' : 'none',
                }}
              >
                <div style={{ fontSize: 24 }}>{TYPE_ICON[lesson.type]}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{lesson.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{lesson.description}</div>
                </div>

                <span className="pill pill-navy">{lesson.type}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{lesson.duration} min</span>

                <a className="btn btn-sm btn-outline" href={lesson.contentUrl} target="_blank" rel="noreferrer">
                  Open
                </a>

                {lesson.quiz && (
                  <button
                    className="btn btn-sm btn-gold"
                    onClick={() => openQuiz(lesson.quiz!.id)}
                    disabled={quizLoading}
                  >
                    Take Quiz
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Quiz modal ── */}
      {(activeQuiz || quizLoading || quizError) && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) closeQuiz(); }}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <div><h3>{activeQuiz ? activeQuiz.title : 'Quiz'}</h3></div>
              <button className="modal-x" onClick={closeQuiz}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {quizLoading && <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Loading quiz…</p>}
              {quizError && <div className="auth-error">{quizError}</div>}

              {activeQuiz && !result && (
                activeQuiz.questions.map((q, i) => (
                  <div key={q.id} className="card pad" style={{ marginBottom: 16, background: 'var(--paper)' }}>
                    <b style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>
                      {i + 1}. {q.text}
                    </b>
                    {q.questionType === 'WRITTEN' ? (
                      <textarea
                        className="input"
                        rows={3}
                        placeholder="Type your answer…"
                        value={answers[q.id] ?? ''}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        style={{ height: 78, padding: '12px 16px' }}
                      />
                    ) : (
                      (q.options ?? []).map((opt) => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 14, cursor: 'pointer' }}>
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
                ))
              )}

              {result && (
                <div>
                  <div
                    className="card pad"
                    style={{
                      textAlign: 'center',
                      marginBottom: 16,
                      background: result.status === 'PENDING_REVIEW'
                        ? 'rgba(217,119,6,.08)'
                        : result.passed ? 'rgba(22,163,74,.08)' : 'rgba(220,38,38,.06)',
                    }}
                  >
                    <div style={{ fontSize: 32, fontWeight: 800, color: result.status === 'PENDING_REVIEW' ? '#d97706' : result.passed ? 'var(--ok, #16a34a)' : '#dc2626' }}>
                      {result.score}%
                    </div>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>
                      {result.status === 'PENDING_REVIEW'
                        ? '⏳ Pending Review'
                        : result.passed ? '✓ Passed' : '✗ Not passed'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                      Passing score: {result.passingScore}% · {result.earnedPoints}/{result.totalPoints} points graded so far
                    </div>
                    {result.status === 'PENDING_REVIEW' && (
                      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                        Your written answers will be reviewed by your teacher. The score will update once grading is complete.
                      </div>
                    )}
                  </div>

                  {result.results.map((r, i) => (
                    <div
                      key={r.questionId}
                      className="card pad"
                      style={{
                        marginBottom: 12,
                        background: r.status === 'PENDING'
                          ? 'rgba(217,119,6,.06)'
                          : r.correct ? 'rgba(22,163,74,.06)' : 'rgba(220,38,38,.05)',
                      }}
                    >
                      <b style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>
                        {i + 1}. {r.text} {r.status === 'PENDING' ? '⏳' : r.correct ? '✓' : '✗'}
                      </b>
                      <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                        Your answer: <b>{r.yourAnswer || '—'}</b>
                      </div>
                      {r.status === 'PENDING' ? (
                        <div style={{ fontSize: 13, color: '#d97706', marginTop: 2 }}>
                          Pending teacher review
                        </div>
                      ) : !r.correct && r.correctAnswer && (
                        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                          Correct answer: <b>{r.correctAnswer}</b>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" onClick={closeQuiz}>
                {result ? 'Close' : 'Cancel'}
              </button>
              {activeQuiz && !result && (
                <button className="btn btn-gold" type="button" disabled={submitting}
                  style={{ opacity: submitting ? 0.65 : 1 }}
                  onClick={handleSubmitQuiz}>
                  {submitting ? 'Submitting…' : 'Submit Quiz'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
