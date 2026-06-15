'use client';

import { useEffect, useRef, useState } from 'react';
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
  courseId: string;
  title: string;
  description: string;
  order: number;
  type: ContentType;
  contentUrl: string;
  duration: number;
  quiz: QuizSummary | null;
};

type QuestionType = 'MCQ' | 'WRITTEN' | 'TRUE_FALSE';

type DraftQuestion = {
  text: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer: string;
  points: string;
};

function emptyQuestion(): DraftQuestion {
  return { text: '', questionType: 'MCQ', options: ['', ''], correctAnswer: '', points: '1' };
}

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

export default function CourseContentPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;

  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ContentType>('VIDEO');
  const [contentUrl, setContentUrl] = useState('');
  const [duration, setDuration] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Quiz builder modal ────────────────────────────────────────────────────
  const [quizLesson, setQuizLesson] = useState<LessonItem | null>(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [passingScore, setPassingScore] = useState('70');
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [quizError, setQuizError] = useState('');
  const [quizSubmitting, setQuizSubmitting] = useState(false);

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

  async function handleAddLesson(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/courses/${courseId}/lessons`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          type,
          contentUrl,
          duration: parseInt(duration, 10) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setFormError(json.error || 'Failed to add lesson'); return; }
      setLessons((prev) => [...prev, json.data]);
      setShowModal(false);
      setTitle(''); setDescription(''); setType('VIDEO'); setContentUrl(''); setDuration('');
    } catch {
      setFormError('Could not connect to server');
    } finally {
      setSubmitting(false);
    }
  }

  function handleUploadClick() {
    setUploadError('');
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setUploadError('');
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('http://localhost:4000/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error || 'Failed to upload file'); return; }

      // Pre-fill the Add Lesson modal with the uploaded file's URL.
      setTitle('');
      setDescription('');
      setType(file.type === 'application/pdf' ? 'PDF' : 'EXERCISE');
      setContentUrl(json.data.url);
      setDuration('');
      setFormError('');
      setShowModal(true);
    } catch {
      setUploadError('Could not connect to server');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    const prev = lessons;
    setLessons((cur) => cur.filter((l) => l.id !== id));
    const res = await authFetch(`/api/lessons/${id}`, { method: 'DELETE' });
    if (!res.ok) setLessons(prev);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;

    const a = lessons[index];
    const b = lessons[target];

    const reordered = [...lessons];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setLessons(reordered);

    await Promise.all([
      authFetch(`/api/lessons/${a.id}`, { method: 'PATCH', body: JSON.stringify({ order: b.order }) }),
      authFetch(`/api/lessons/${b.id}`, { method: 'PATCH', body: JSON.stringify({ order: a.order }) }),
    ]);
  }

  function openQuizModal(lesson: LessonItem) {
    setQuizLesson(lesson);
    setQuizTitle(`${lesson.title} — Quiz`);
    setPassingScore('70');
    setQuestions([emptyQuestion()]);
    setQuizError('');
  }

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function updateOption(qIdx: number, oIdx: number, value: string) {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const options = [...q.options];
      const oldValue = options[oIdx];
      options[oIdx] = value;
      // Keep correctAnswer in sync if it pointed at the option being edited.
      const correctAnswer = q.correctAnswer === oldValue ? value : q.correctAnswer;
      return { ...q, options, correctAnswer };
    }));
  }

  function addOption(qIdx: number) {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, options: [...q.options, ''] } : q)));
  }

  function removeOption(qIdx: number, oIdx: number) {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const removed = q.options[oIdx];
      const options = q.options.filter((_, j) => j !== oIdx);
      return { ...q, options, correctAnswer: q.correctAnswer === removed ? '' : q.correctAnswer };
    }));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSaveQuiz() {
    if (!quizLesson) return;
    setQuizError('');

    if (!quizTitle.trim()) { setQuizError('Quiz title is required'); return; }
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) { setQuizError(`Question ${i + 1}: text is required`); return; }
      if (q.questionType === 'WRITTEN') continue;
      if (q.questionType === 'TRUE_FALSE') {
        if (q.correctAnswer !== 'True' && q.correctAnswer !== 'False') {
          setQuizError(`Question ${i + 1}: select True or False`);
          return;
        }
        continue;
      }
      const opts = q.options.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) { setQuizError(`Question ${i + 1}: at least two options are required`); return; }
      if (!q.correctAnswer.trim() || !opts.includes(q.correctAnswer.trim())) {
        setQuizError(`Question ${i + 1}: select the correct answer`);
        return;
      }
    }

    setQuizSubmitting(true);
    try {
      const quizRes = await authFetch(`/api/content/${quizLesson.id}/quiz`, {
        method: 'POST',
        body: JSON.stringify({
          title: quizTitle,
          passingScore: parseInt(passingScore, 10) || 70,
        }),
      });
      const quizJson = await quizRes.json();
      if (!quizRes.ok) { setQuizError(quizJson.error || 'Failed to create quiz'); return; }

      const quizId = quizJson.data.id as string;

      for (const q of questions) {
        const payload: Record<string, unknown> = {
          text: q.text.trim(),
          questionType: q.questionType,
          points: parseInt(q.points, 10) || 1,
        };
        if (q.questionType === 'MCQ') {
          payload.options = q.options.map((o) => o.trim()).filter(Boolean);
          payload.correctAnswer = q.correctAnswer.trim();
        } else if (q.questionType === 'TRUE_FALSE') {
          payload.correctAnswer = q.correctAnswer;
        }
        const qRes = await authFetch(`/api/quiz/${quizId}/questions`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!qRes.ok) {
          const qJson = await qRes.json();
          setQuizError(qJson.error || 'Failed to add a question');
          return;
        }
      }

      setLessons((prev) => prev.map((l) => (
        l.id === quizLesson.id
          ? { ...l, quiz: { id: quizId, title: quizTitle, passingScore: parseInt(passingScore, 10) || 70 } }
          : l
      )));
      setQuizLesson(null);
    } catch {
      setQuizError('Could not connect to server');
    } finally {
      setQuizSubmitting(false);
    }
  }

  return (
    <div className="midad" style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <Navbar />

      <div className="wrap" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <button className="btn btn-sm btn-outline" onClick={() => router.push('/teacher')} style={{ marginBottom: 16 }}>
          ← Back to dashboard
        </button>

        <div className="page-head" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="dh-title">Manage Course Content</h1>
            <p className="dh-hi">Add, reorder, and remove lessons for this course.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />
            <button className="btn btn-outline btn-lg" onClick={handleUploadClick} disabled={uploading}
              style={{ opacity: uploading ? 0.65 : 1 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>
              {uploading ? 'Uploading…' : 'Upload File'}
            </button>
            <button className="btn btn-gold btn-lg" onClick={() => {
              setTitle(''); setDescription(''); setType('VIDEO'); setContentUrl(''); setDuration(''); setFormError('');
              setShowModal(true);
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14"/></svg>
              Add Lesson
            </button>
          </div>
        </div>

        {uploadError && <div className="auth-error" style={{ marginBottom: 16 }}>{uploadError}</div>}

        {loading ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            Loading lessons…
          </div>
        ) : lessons.length === 0 ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            No lessons yet — click &quot;Add Lesson&quot; to create your first one.
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ padding: '2px 8px', lineHeight: 1 }}
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ padding: '2px 8px', lineHeight: 1 }}
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === lessons.length - 1}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>

                <div style={{ fontSize: 24 }}>{TYPE_ICON[lesson.type]}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{lesson.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{lesson.description}</div>
                </div>

                <span className="pill pill-navy">{lesson.type}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{lesson.duration} min</span>

                {lesson.quiz ? (
                  <span className="pill" style={{ background: 'rgba(27,58,107,.08)', color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                    ✓ Quiz added
                  </span>
                ) : (
                  <button className="btn btn-sm btn-outline" onClick={() => openQuizModal(lesson)}>
                    Add Quiz
                  </button>
                )}

                <button
                  className="btn btn-sm btn-outline"
                  style={{ color: '#dc2626', boxShadow: 'inset 0 0 0 1.5px #dc2626' }}
                  onClick={() => handleDelete(lesson.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add lesson modal ── */}
      {showModal && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-head">
              <div><h3>Add Lesson</h3></div>
              <button className="modal-x" onClick={() => setShowModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>

            <form ref={formRef} onSubmit={handleAddLesson} className="modal-body">
              <div className="field">
                <label htmlFor="l-title">Title</label>
                <input id="l-title" className="input" type="text" required
                  placeholder="e.g. Introduction to Arabic Letters"
                  value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="l-desc">Description</label>
                <textarea id="l-desc" className="input" rows={3} required
                  placeholder="What does this lesson cover?"
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  style={{ height: 78, padding: '12px 16px' }} />
              </div>

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="l-type">Type</label>
                  <select id="l-type" className="input" value={type} onChange={(e) => setType(e.target.value as ContentType)}>
                    <option value="VIDEO">Video</option>
                    <option value="PDF">PDF</option>
                    <option value="EXERCISE">Exercise</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="l-duration">Duration (minutes)</label>
                  <input id="l-duration" className="input" type="number" min="0" step="1" placeholder="0"
                    value={duration} onChange={(e) => setDuration(e.target.value)} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="l-url">Content URL</label>
                <input id="l-url" className="input" type="text" required
                  placeholder="https://…"
                  value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} />
              </div>

              {formError && <div className="auth-error">{formError}</div>}
            </form>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-gold" type="button" disabled={submitting}
                style={{ opacity: submitting ? 0.65 : 1 }}
                onClick={() => formRef.current?.requestSubmit()}>
                {submitting ? 'Adding…' : 'Add Lesson'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add quiz modal ── */}
      {quizLesson && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setQuizLesson(null); }}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <div>
                <h3>Add Quiz</h3>
                <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>For lesson: {quizLesson.title}</p>
              </div>
              <button className="modal-x" onClick={() => setQuizLesson(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="q-title">Quiz title</label>
                  <input id="q-title" className="input" type="text" required
                    value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="q-pass">Passing score (%)</label>
                  <input id="q-pass" className="input" type="number" min="0" max="100" step="1"
                    value={passingScore} onChange={(e) => setPassingScore(e.target.value)} />
                </div>
              </div>

              {questions.map((q, qIdx) => (
                <div key={qIdx} className="card pad" style={{ marginTop: 16, background: 'var(--paper)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <b style={{ fontSize: 14 }}>Question {qIdx + 1}</b>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ color: '#dc2626', boxShadow: 'inset 0 0 0 1.5px #dc2626', padding: '2px 10px' }}
                        onClick={() => removeQuestion(qIdx)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="field">
                    <label>Question text</label>
                    <input className="input" type="text" value={q.text}
                      onChange={(e) => updateQuestion(qIdx, { text: e.target.value })}
                      placeholder="e.g. What is the Arabic letter for 'B'?" />
                  </div>

                  <div className="field">
                    <label>Question type</label>
                    <select className="input" value={q.questionType}
                      onChange={(e) => {
                        const questionType = e.target.value as QuestionType;
                        if (questionType === 'TRUE_FALSE') {
                          updateQuestion(qIdx, { questionType, options: ['True', 'False'], correctAnswer: '' });
                        } else if (questionType === 'WRITTEN') {
                          updateQuestion(qIdx, { questionType, options: [], correctAnswer: '' });
                        } else {
                          updateQuestion(qIdx, { questionType, options: ['', ''], correctAnswer: '' });
                        }
                      }}>
                      <option value="MCQ">Multiple choice</option>
                      <option value="TRUE_FALSE">True / False</option>
                      <option value="WRITTEN">Written (open-ended)</option>
                    </select>
                  </div>

                  {q.questionType === 'MCQ' && (
                    <div className="field">
                      <label>Options &amp; correct answer</label>
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <input
                            type="radio"
                            name={`correct-${qIdx}`}
                            checked={!!opt && q.correctAnswer === opt}
                            onChange={() => updateQuestion(qIdx, { correctAnswer: opt })}
                            aria-label={`Mark option ${oIdx + 1} as correct`}
                          />
                          <input
                            className="input"
                            type="text"
                            style={{ flex: 1 }}
                            value={opt}
                            placeholder={`Option ${oIdx + 1}`}
                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                          />
                          {q.options.length > 2 && (
                            <button type="button" className="btn btn-sm btn-outline" style={{ padding: '4px 10px' }}
                              onClick={() => removeOption(qIdx, oIdx)} aria-label="Remove option">
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => addOption(qIdx)}>
                        + Add option
                      </button>
                    </div>
                  )}

                  {q.questionType === 'TRUE_FALSE' && (
                    <div className="field">
                      <label>Correct answer</label>
                      {(['True', 'False'] as const).map((opt) => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 14, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`correct-${qIdx}`}
                            checked={q.correctAnswer === opt}
                            onChange={() => updateQuestion(qIdx, { correctAnswer: opt })}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}

                  {q.questionType === 'WRITTEN' && (
                    <p className="muted" style={{ fontSize: 13 }}>
                      Students will type a free-text answer. You&apos;ll review and grade it manually.
                    </p>
                  )}

                  <div className="field" style={{ maxWidth: 140 }}>
                    <label>Points</label>
                    <input className="input" type="number" min="1" step="1" value={q.points}
                      onChange={(e) => updateQuestion(qIdx, { points: e.target.value })} />
                  </div>
                </div>
              ))}

              <button type="button" className="btn btn-outline" style={{ marginTop: 16 }} onClick={addQuestion}>
                + Add Question
              </button>

              {quizError && <div className="auth-error" style={{ marginTop: 16 }}>{quizError}</div>}
            </div>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" onClick={() => setQuizLesson(null)}>Cancel</button>
              <button className="btn btn-gold" type="button" disabled={quizSubmitting}
                style={{ opacity: quizSubmitting ? 0.65 : 1 }}
                onClick={handleSaveQuiz}>
                {quizSubmitting ? 'Saving…' : 'Save Quiz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
