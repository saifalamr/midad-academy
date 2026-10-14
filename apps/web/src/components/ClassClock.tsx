'use client';
import { PopupNotice } from '@/components/FeedbackProvider';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/config';
import { classPhases, phaseAt } from '@/lib/class-clock';
import './class-clock.css';
type Clock = {
  sessionId: string;
  startedAt: string | null;
  minutes: number[];
  durationMinutes: number;
  version: number;
  serverNow: string;
};
export default function ClassClock({
  courseId,
  editable,
}: {
  courseId: string;
  editable: boolean;
}) {
  const [clock, setClock] = useState<Clock | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const [draft, setDraft] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let reading = false;
    async function read() {
      if (reading) return;
      reading = true;
      try {
        const before = Date.now();
        const res = await fetch(`${API_URL}/api/sessions/clock/${courseId}`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Authorization:
              'Bearer ' + (localStorage.getItem('token') ?? sessionStorage.getItem('token')),
          },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!controller.signal.aborted) {
          setClock(json.data);
          setOffset(Date.parse(json.data.serverNow) - (before + Date.now()) / 2);
          setError('');
        }
      } catch {
        if (!controller.signal.aborted)
          setError('تعذر تحديث المؤقت. الوقت المعروض يستمر من آخر تحديث.');
      } finally {
        reading = false;
      }
    }
    void read();
    const refresh = window.setInterval(() => void read(), 15000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [courseId, retry]);
  async function save() {
    if (!clock || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/sessions/clock/${courseId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Bearer ' + (localStorage.getItem('token') ?? sessionStorage.getItem('token')),
        },
        body: JSON.stringify({ version: draftVersion, minutes: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setClock(json.data);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ التقسيم');
    } finally {
      setBusy(false);
    }
  }
  const phase = clock?.startedAt ? phaseAt(clock.startedAt, clock.minutes, now + offset) : null;
  const format = (seconds: number) =>
    `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  return (
    <section className="class-clock" aria-label="مؤقت مراحل الحصة" dir="rtl">
      <div className="class-clock-head">
        <strong>
          {phase?.ended
            ? 'اكتملت مدة الحصة المخططة'
            : phase
              ? classPhases[phase.index]
              : 'جارٍ تحميل مؤقت الحصة…'}
        </strong>
        {phase && (
          <span className="class-clock-time" aria-label="الوقت المتبقي في المرحلة">
            {format(phase.remaining)}
          </span>
        )}
        {editable && clock && (
          <button
            type="button"
            onClick={() => {
              setDraft(clock.minutes);
              setDraftVersion(clock.version);
              setEditing((v) => !v);
            }}
          >
            تعديل تقسيم الوقت
          </button>
        )}
      </div>
      {clock && (
        <ol className="class-clock-phases">
          {clock.minutes.map((minutes, index) => (
            <li
              key={index}
              aria-current={phase?.index === index && !phase.ended ? 'step' : undefined}
            >
              {classPhases[index]} <span>{minutes} د</span>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <PopupNotice role="alert">
          {error}{' '}
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            إعادة التحديث
          </button>
        </PopupNotice>
      )}
      {editable && editing && clock && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy}>
            <legend>
              توزيع {clock.durationMinutes} دقيقة — المؤقت يبدأ من بداية الحصة ولا يُعاد عند التعديل
            </legend>
            <div className="class-clock-inputs">
              {classPhases.map((title, index) => (
                <label key={title}>
                  {title}
                  <input
                    type="number"
                    required
                    min={1}
                    max={240}
                    value={draft[index] ?? ''}
                    onChange={(e) =>
                      setDraft((values) =>
                        values.map((v, i) => (i === index ? Number(e.target.value) : v))
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <p>
              المجموع: {draft.reduce((a, b) => a + b, 0)} / {clock.durationMinutes} دقيقة
            </p>
            <button
              type="submit"
              disabled={draft.reduce((a, b) => a + b, 0) !== clock.durationMinutes}
            >
              حفظ التقسيم
            </button>{' '}
            <button type="button" onClick={() => setEditing(false)}>
              إلغاء
            </button>
          </fieldset>
        </form>
      )}
      {phase?.ended && <small>انتهاء المؤقت لا يغلق الحصة؛ المعلم ينهيها بنفسه.</small>}
    </section>
  );
}
