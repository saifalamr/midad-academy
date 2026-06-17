'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { API_URL } from '@/lib/config';

type PendingAnswer = {
  id: string;
  resultId: string;
  studentName: string;
  courseTitle: string;
  quizTitle: string;
  questionText: string;
  answerText: string;
  points: number;
  completedAt: string;
};

function authFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export default function ReviewAnswersPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { points: string; feedback: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    authFetch('/api/teacher/pending-reviews')
      .then(async (res) => {
        if (res.status === 401) { router.push('/login'); return; }
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load pending reviews'); return; }
        setPending(json.data ?? []);
      })
      .catch(() => setError('Could not connect to server'))
      .finally(() => setLoading(false));
  }, [router]);

  function getDraft(a: PendingAnswer) {
    return drafts[a.id] ?? { points: String(a.points), feedback: '' };
  }

  function updateDraft(id: string, patch: Partial<{ points: string; feedback: string }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { points: '', feedback: '' }), ...patch } }));
  }

  async function handleGrade(a: PendingAnswer) {
    const draft = getDraft(a);
    const pointsAwarded = parseInt(draft.points, 10);
    if (isNaN(pointsAwarded) || pointsAwarded < 0 || pointsAwarded > a.points) {
      setError(`Score for "${a.questionText}" must be between 0 and ${a.points}`);
      return;
    }
    setError('');
    setSavingId(a.id);
    try {
      const res = await authFetch(`/api/teacher/answers/${a.id}/grade`, {
        method: 'PATCH',
        body: JSON.stringify({ pointsAwarded, feedback: draft.feedback.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to save grade'); return; }
      setPending((prev) => prev.filter((p) => p.id !== a.id));
    } catch {
      setError('Could not connect to server');
    } finally {
      setSavingId(null);
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
            <h1 className="dh-title">Review Written Answers</h1>
            <p className="dh-hi">Grade pending written answers and leave feedback for your students.</p>
          </div>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

        {loading ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            Loading pending answers…
          </div>
        ) : pending.length === 0 ? (
          <div className="card pad" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            🎉 No written answers are waiting for review.
          </div>
        ) : (
          pending.map((a) => {
            const draft = getDraft(a);
            return (
              <div key={a.id} className="card pad" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>
                  {a.courseTitle} · {a.quizTitle} · {a.studentName}
                </div>
                <b style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>{a.questionText}</b>
                <div className="card pad" style={{ background: 'var(--paper)', marginBottom: 12, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  {a.answerText || <i style={{ color: 'var(--ink-3)' }}>No answer submitted</i>}
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Score (out of {a.points})</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max={a.points}
                      step="1"
                      value={draft.points}
                      onChange={(e) => updateDraft(a.id, { points: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Feedback <span className="muted" style={{ fontSize: 12 }}>(optional)</span></label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Leave a comment for the student…"
                    value={draft.feedback}
                    onChange={(e) => updateDraft(a.id, { feedback: e.target.value })}
                    style={{ height: 60, padding: '12px 16px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-gold btn-sm"
                    disabled={savingId === a.id}
                    style={{ opacity: savingId === a.id ? 0.65 : 1 }}
                    onClick={() => handleGrade(a)}
                  >
                    {savingId === a.id ? 'Saving…' : 'Mark as Graded'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
