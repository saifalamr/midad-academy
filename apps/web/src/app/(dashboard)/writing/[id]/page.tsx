'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { academyApi as api } from '@/lib/academy-workflow';
import { PopupNotice, showPopup } from '@/components/FeedbackProvider';
import WritingBoard from '@/components/WritingBoard';
import WritingGuidance from '@/components/WritingGuidance';
import {
  writingVerdicts,
  type WritingTask,
  type WritingAttempt,
  type WritingStrokes,
  type WritingGuideResult,
} from '@/lib/writing';
import '@/components/writing.css';
type Detail = {
  task: WritingTask;
  staff: boolean;
  canSubmit: boolean;
  attempts: WritingAttempt[];
  sessionTitle: string;
};
function Review({
  attempt,
  task,
  refresh,
}: {
  attempt: WritingAttempt;
  task: WritingTask;
  refresh: () => void;
}) {
  const [verdict, setVerdict] = useState<'ACHIEVED' | 'PRACTICE'>(
    attempt.verdict === 'PENDING' ? 'PRACTICE' : attempt.verdict
  );
  const [feedback, setFeedback] = useState(attempt.feedback),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <article className="card pad">
      <h2>محاولة {attempt.student.user.name}</h2>
      <p>
        {writingVerdicts[attempt.verdict]} · سُلّمت{' '}
        {new Date(attempt.submittedAt).toLocaleString('ar')}
      </p>
      <WritingBoard
        word={task.word}
        fontSize={task.fontSize}
        strokes={attempt.strokes}
        readOnly
        label={'محاولة ' + attempt.student.user.name}
      />
      {attempt.guidance && <WritingGuidance result={attempt.guidance} />}
      {error && <PopupNotice>{error}</PopupNotice>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/writing/attempts/' + attempt.id + '/review', 'PATCH', {
              version: attempt.version,
              verdict,
              feedback,
            });
            showPopup('نُشر تقييم الكتابة للطالب وولي الأمر');
            refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر الحفظ');
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label className="field">
            تقييم {attempt.student.user.name}
            <select
              className="input"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as 'ACHIEVED' | 'PRACTICE')}
            >
              <option value="ACHIEVED">أتقن التمرين</option>
              <option value="PRACTICE">يحتاج تدريبًا إضافيًا</option>
            </select>
          </label>
          <label className="field">
            ملاحظة {attempt.student.user.name}
            <textarea
              className="input"
              required
              minLength={2}
              maxLength={1000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <button className="btn btn-gold">اعتماد تقييم الكتابة</button>
        </fieldset>
      </form>
    </article>
  );
}
export default function WritingExercise({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const embedded = useSearchParams().get('embedded') === '1';
  const { user } = useAuth();
  const [data, setData] = useState<Detail | null>(null),
    [strokes, setStrokes] = useState<WritingStrokes>([]),
    [result, setResult] = useState<WritingGuideResult | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [draftReady, setDraftReady] = useState(false),
    [draftNote, setDraftNote] = useState('');
  const storageKey = user ? 'midad-writing-v1:' + user.id + ':' + id : '';
  const pointsRef = useRef(strokes);
  pointsRef.current = strokes;
  useEffect(() => {
    setData(null);
    setDraftReady(false);
    setStrokes([]);
    setResult(null);
    setDraftNote('');
  }, [id, storageKey]);
  useEffect(() => {
    let active = true;
    setError('');
    api<Detail>('/writing/tasks/' + id)
      .then((d) => {
        if (!active) return;
        setData(d);
        if (d.canSubmit && !d.attempts.length && storageKey) {
          try {
            const raw = sessionStorage.getItem(storageKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              const s = parsed.strokes;
              if (
                parsed.at > Date.now() - 7 * 86400000 &&
                Array.isArray(s) &&
                s.length <= 64 &&
                s.every(
                  (a: unknown) =>
                    Array.isArray(a) &&
                    a.length > 0 &&
                    a.length <= 256 &&
                    a.every(
                      (p: { x: number; y: number }) =>
                        p &&
                        Number.isFinite(p.x) &&
                        p.x >= 0 &&
                        p.x <= 1000 &&
                        Number.isFinite(p.y) &&
                        p.y >= 0 &&
                        p.y <= 400
                    )
                )
              ) {
                setStrokes(s);
                setDraftNote('استعدنا محاولتك غير المسلّمة على هذا الجهاز.');
              }
            }
          } catch {
            setDraftNote('تعذر استرجاع المسودة؛ يمكنك بدء محاولة جديدة.');
          }
        }
        setDraftReady(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision, storageKey]);
  useEffect(() => {
    if (!draftReady || !data?.canSubmit || data.attempts.length || !storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), strokes }));
      setDraftNote(strokes.length ? 'مسودة محفوظة في هذه الجلسة على جهازك؛ لم تُسلّم بعد.' : '');
    } catch {
      setDraftNote('تعذر حفظ المسودة على الجهاز؛ سلّم محاولتك قبل مغادرة الصفحة.');
    }
  }, [strokes, draftReady, data, storageKey]);
  useEffect(() => {
    if (!strokes.length || data?.attempts.length || !data?.canSubmit) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [strokes.length, data]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تنفيذ العملية');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="writing-page" dir="rtl" data-writing-embedded={embedded}>
      <Link
        href={
          data
            ? '/sessions/' + data.task.sessionId + '/writing' + (embedded ? '?embedded=1' : '')
            : '/academy'
        }
      >
        العودة إلى أنشطة الحصة
      </Link>
      {error && (
        <PopupNotice>
          {error}
          <button
            className="btn btn-outline"
            onClick={() => {
              setError('');
              setRevision((v) => v + 1);
            }}
          >
            تحديث البيانات
          </button>
        </PopupNotice>
      )}
      {!data ? (
        <p role="status">جارٍ فتح تمرين الكتابة…</p>
      ) : (
        <>
          <span className="tag">
            {data.task.useAs === 'HOMEWORK' ? 'واجب كتابة' : 'نشاط الحصة'}
          </span>
          <h1>{data.task.title}</h1>
          <p>{data.sessionTitle}</p>
          {data.staff ? (
            <>
              <p>النموذج ثابت بعد تكليف الطلاب به. يمكنك مراجعة كل محاولة واعتماد تقييمك.</p>
              <WritingBoard
                word={data.task.word}
                fontSize={data.task.fontSize}
                strokes={[]}
                guides={data.task.guides}
                readOnly
                demonstrate
                label="نموذج تمرين الكتابة"
              />
              {!data.attempts.length && <p>لم يسلّم الطلاب محاولات بعد.</p>}
              {data.attempts.map((a) => (
                <Review
                  key={a.id + ':' + a.version}
                  attempt={a}
                  task={data.task}
                  refresh={() => setRevision((v) => v + 1)}
                />
              ))}
            </>
          ) : data.attempts.length ? (
            <>
              {data.attempts.map((a) => (
                <article key={a.id} className="card pad">
                  <h2>{a.student.user.name}</h2>
                  <p>حُفظت المحاولة وسُلّمت للمعلم.</p>
                  <WritingBoard
                    word={data.task.word}
                    fontSize={data.task.fontSize}
                    strokes={a.strokes}
                    readOnly
                    label={'محاولة ' + a.student.user.name}
                  />
                  {a.guidance && <WritingGuidance result={a.guidance} />}
                  <h3>{writingVerdicts[a.verdict]}</h3>
                  {a.feedback && <p>{a.feedback}</p>}
                </article>
              ))}
            </>
          ) : data.canSubmit ? (
            <>
              <p>
                اكتب فوق الكلمة الخافتة. ارفع القلم بين الحركات، واضغط مرة للنقطة. يمكنك التراجع
                وإعادة المحاولة قبل التسليم.
              </p>
              <WritingBoard
                word={data.task.word}
                fontSize={data.task.fontSize}
                strokes={strokes}
                guides={data.task.guides}
                demonstrate
                readOnly={busy}
                onChange={(s) => {
                  setStrokes(s);
                  setResult(null);
                }}
                label="لوحة تتبّع الكلمة"
              />
              <p role="status" className="writing-muted">
                {draftNote}
              </p>
              {data.task.mode === 'GUIDED' && (
                <button
                  className="btn btn-outline"
                  disabled={busy || !strokes.length}
                  onClick={() =>
                    void action(async () => {
                      setResult(
                        await api<WritingGuideResult>('/writing/tasks/' + id + '/check', 'POST', {
                          strokes: pointsRef.current,
                        })
                      );
                    })
                  }
                >
                  تحقق من التتبّع
                </button>
              )}
              {result && <WritingGuidance result={result} />}
              <p>
                التسليم يحفظ هذه المحاولة للمعلم. يمكنك التدريب والمسح قبل التسليم؛ لا تُستبدل
                المحاولة بعده.
              </p>
              <button
                className="btn btn-gold"
                disabled={busy || !draftReady || !strokes.length}
                onClick={() =>
                  void action(async () => {
                    await api('/writing/tasks/' + id + '/submit', 'POST', {
                      strokes: pointsRef.current,
                    });
                    try {
                      sessionStorage.removeItem(storageKey);
                    } catch {}
                    setRevision((v) => v + 1);
                    showPopup('حُفظت محاولتك وأُرسلت للمعلم');
                  })
                }
              >
                {busy ? 'جارٍ الحفظ…' : 'تسليم محاولة الكتابة'}
              </button>
            </>
          ) : (
            <p>
              {user?.role === 'PARENT'
                ? 'الطالب لم يسلّم محاولة بعد. هذه صفحة متابعة فقط؛ يدخل الطفل بحسابه للكتابة.'
                : 'الكتابة تحتاج تسجيلًا فعالًا في الدورة. يمكنك الرجوع للمحاولات السابقة هنا.'}
            </p>
          )}
        </>
      )}
    </main>
  );
}
