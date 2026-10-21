'use client';
import { useEffect, useRef, useState } from 'react';
import { academyApi as api } from '@/lib/academy-workflow';
import './writing.css';
// Keep the existing call mounted while an activity is open.
export default function ClassWriting({ courseId }: { courseId: string }) {
  const [sessionId, setSessionId] = useState(''),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    api<{ sessionId: string }>('/writing/live/' + courseId)
      .then((d) => {
        if (active) setSessionId(d.sessionId);
      })
      .catch(() => {
        if (active) setError('تعذر تحديد أنشطة الحصة؛ أعد المحاولة');
      });
    return () => {
      active = false;
    };
  }, [courseId]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  return (
    <div dir="rtl" className="class-writing-entry">
      <button
        ref={button}
        type="button"
        className="btn btn-outline btn-sm"
        onClick={async () => {
          if (sessionId) {
            setOpen(true);
            return;
          }
          try {
            const d = await api<{ sessionId: string }>('/writing/live/' + courseId);
            setSessionId(d.sessionId);
            setError('');
            setOpen(true);
          } catch {
            setError('تعذر فتح أنشطة الحصة؛ حاول مرة أخرى');
          }
        }}
      >
        نتدرّب على الكتابة
      </button>
      {error && <span role="status">{error}</span>}
      <dialog
        ref={dialog}
        className="writing-class-dialog"
        aria-label="أنشطة كتابة الحصة"
        onCancel={() => setOpen(false)}
        onClose={() => {
          setOpen(false);
          button.current?.focus();
        }}
      >
        <div className="writing-row">
          <h2>أنشطة كتابة الحصة</h2>
          <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
            إغلاق والعودة للمكالمة
          </button>
        </div>
        {open && sessionId && (
          <iframe
            title="تمارين كتابة الحصة"
            src={'/sessions/' + sessionId + '/writing?embedded=1'}
          />
        )}
      </dialog>
    </div>
  );
}
