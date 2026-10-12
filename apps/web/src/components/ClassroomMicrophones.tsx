'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { ParticipantEvent, RoomEvent, Track } from 'livekit-client';
import Icon from './Icon';
import { API_URL } from '@/lib/config';
import './classroom-microphones.css';
const auth = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});
// LiveKit's protocol uses 2 for MICROPHONE. Permissions come from the server, never data messages.
export function useSpeakingPermission(isTeacher: boolean, isObserver: boolean) {
  const { localParticipant } = useLocalParticipant();
  const [allowed, setAllowed] = useState(isTeacher && !isObserver);
  useEffect(() => {
    function update() {
      const permissions = localParticipant.permissions;
      const next =
        !isObserver &&
        (isTeacher || !!(permissions?.canPublish && permissions.canPublishSources.includes(2)));
      setAllowed(next);
      if (!next) {
        const track = localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
        if (track) {
          track.stop();
          void localParticipant.unpublishTrack(track, true).catch(() => {});
        } else if (localParticipant.isMicrophoneEnabled)
          void localParticipant.setMicrophoneEnabled(false).catch(() => {});
      }
    }
    update();
    localParticipant.on(ParticipantEvent.ParticipantPermissionsChanged, update);
    return () => {
      localParticipant.off(ParticipantEvent.ParticipantPermissionsChanged, update);
    };
  }, [localParticipant, isTeacher, isObserver]);
  return allowed;
}
export function ClassroomPresence({
  courseId,
  isObserver,
}: {
  courseId: string;
  isObserver: boolean;
}) {
  const room = useRoomContext();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (isObserver) return;
    const controller = new AbortController();
    let busy = false;
    async function confirm() {
      if (busy || room.state !== 'connected') return;
      busy = true;
      try {
        const response = await fetch(`${API_URL}/api/sessions/presence/${courseId}`, {
          method: 'POST',
          headers: auth(),
          body: JSON.stringify({ roomName: room.name }),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setError(!response.ok);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        busy = false;
      }
    }
    void confirm();
    const timer = setInterval(() => void confirm(), 20000);
    room.on(RoomEvent.Connected, confirm);
    room.on(RoomEvent.Reconnected, confirm);
    return () => {
      controller.abort();
      clearInterval(timer);
      room.off(RoomEvent.Connected, confirm);
      room.off(RoomEvent.Reconnected, confirm);
    };
  }, [courseId, isObserver, room]);
  return error ? (
    <p className="classroom-presence-notice" role="status">
      تعذر تأكيد سجل حضورك مؤقتًا؛ نحاول مجددًا تلقائيًا.
    </p>
  ) : null;
}
type Controls = {
  sessionId: string;
  version: number;
  providerAvailable: boolean;
  students: {
    userId: string;
    name: string;
    allowed: boolean;
    connected: boolean | null;
    applied: boolean | null;
  }[];
};
export default function ClassroomMicrophones({ courseId }: { courseId: string }) {
  const room = useRoomContext();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Controls>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const read = useCallback(
    async (signal?: AbortSignal) => {
      const res = await fetch(
        `${API_URL}/api/sessions/microphones/${courseId}?roomName=${encodeURIComponent(room.name)}`,
        { headers: auth(), cache: 'no-store', signal }
      );
      const json = await res.json();
      if (!res.ok) throw Error(json.error);
      if (!signal?.aborted) setData(json.data);
    },
    [courseId, room]
  );
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const openerButton = opener.current;
    let reading = false;
    async function refresh() {
      if (reading) return;
      reading = true;
      try {
        await read(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        reading = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    close.current?.focus();
    return () => {
      controller.abort();
      clearInterval(timer);
      if (openerButton?.isConnected) openerButton.focus();
    };
  }, [open, read]);
  function dismiss() {
    if (!busy) setOpen(false);
  }
  async function change(userId: string | undefined, allowed: boolean) {
    if (!data || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/sessions/microphones/${courseId}`, {
        method: 'PUT',
        headers: auth(),
        body: JSON.stringify({ sessionId: data.sessionId, version: data.version, userId, allowed }),
      });
      const json = await res.json();
      if (!res.ok) throw Error(json.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      try {
        await read();
      } catch {
        setError('تعذر تحديث قائمة الطلاب. أعد فتحها.');
      }
      setBusy(false);
    }
  }
  return (
    <>
      <button ref={opener} className="rc-btn" type="button" onClick={() => setOpen(true)}>
        <Icon name="mic" />
        <span>مايكات الطلاب</span>
      </button>
      {open && (
        <div
          className="microphone-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="microphone-title"
            className="microphone-modal"
            dir="rtl"
            onKeyDown={(e) => {
              if (e.key === 'Escape') dismiss();
              if (e.key === 'Tab') {
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
                );
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <header>
              <h2 id="microphone-title">إدارة مايكات الطلاب</h2>
              <button
                ref={close}
                aria-label="إغلاق إدارة المايكات"
                type="button"
                disabled={busy}
                onClick={dismiss}
              >
                <Icon name="close" />
              </button>
            </header>
            <p>
              الطلاب يدخلون بمايك مقفول. اسمح لمن تريد أن يتكلم؛ الطالب يشغّل مايكه بنفسه بعد
              السماح.
            </p>
            <button
              className="btn btn-outline microphone-mute-all"
              disabled={busy || !data || !data.providerAvailable}
              onClick={() => void change(undefined, false)}
            >
              قفل مايكات الجميع
            </button>
            {data && !data.providerAvailable && (
              <p role="alert" className="microphone-error">
                تعذر الاتصال بخدمة المكالمة. نحدّث الحالة تلقائيًا؛ لا يمكن تأكيد الكتم الآن.
              </p>
            )}
            {error && (
              <p role="alert" className="microphone-error">
                {error}
              </p>
            )}
            {!data && !error && <p role="status">جارٍ تحميل الطلاب…</p>}
            {data && !data.students.length && <p>لا يوجد طلاب مسجلون في هذه الدورة.</p>}
            <ul>
              {data?.students.map((student) => (
                <li key={student.userId}>
                  <div>
                    <b>{student.name}</b>
                    <small>{student.allowed ? 'مسموح له بتشغيل المايك' : 'المايك مقفول'}</small>
                    <small>
                      {student.connected === null
                        ? 'الاتصال غير مؤكد'
                        : !student.connected
                          ? 'لم ينضم الآن'
                          : student.applied === false
                            ? 'بانتظار تأكيد تطبيق الإذن'
                            : 'الإذن مطبّق على المكالمة'}
                    </small>
                  </div>
                  <button
                    type="button"
                    className={student.allowed ? 'btn btn-outline' : 'btn btn-gold'}
                    disabled={busy || !data.providerAvailable}
                    aria-label={`${student.applied === false ? 'إعادة تطبيق إذن' : student.allowed ? 'قفل مايك' : 'السماح بالكلام لـ'} ${student.name}`}
                    onClick={() =>
                      void change(
                        student.userId,
                        student.applied === false ? student.allowed : !student.allowed
                      )
                    }
                  >
                    {student.applied === false
                      ? 'إعادة تطبيق الإذن'
                      : student.allowed
                        ? 'قفل المايك'
                        : 'السماح بالكلام'}
                  </button>
                </li>
              ))}
            </ul>
            <p className="microphone-hint">
              قفل المايك لا يوقف كاميرا الطالب. الإذن خاص بهذه الحصة، وينتهي بانتهائها.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
