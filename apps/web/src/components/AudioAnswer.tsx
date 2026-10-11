'use client';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/config';
const authorization = () => ({
  Authorization: 'Bearer ' + (localStorage.getItem('token') ?? sessionStorage.getItem('token')),
});
export function AudioPlayback({ audioId }: { audioId: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/homework-audio/${audioId}`, {
        headers: authorization(),
        cache: 'no-store',
        signal: request.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (!request.signal.aborted) setUrl(json.data.url);
    } catch (e) {
      if (!request.signal.aborted) setError(e instanceof Error ? e.message : 'تعذر تشغيل التسجيل');
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="homework-audio">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? 'جارٍ تحميل الصوت…' : url ? 'تجديد رابط التسجيل' : 'تحميل التسجيل للاستماع'}
      </button>
      {url && (
        <audio
          controls
          src={url}
          preload="none"
          onError={() => setError('الرابط قد انتهى. اضغط تجديد رابط التسجيل.')}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function AudioAnswer({
  sessionId,
  questionId,
  maxSeconds,
  audioId,
  disabled,
  onUploaded,
  onBusy,
}: {
  sessionId: string;
  questionId: string;
  maxSeconds: number;
  audioId?: string;
  disabled: boolean;
  onUploaded: (id: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const revision = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      revision.current++;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      uploadController.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );
  useEffect(() => {
    if (!blob) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  const busyCallback = useRef(onBusy);
  useEffect(() => {
    busyCallback.current = onBusy;
  }, [onBusy]);
  useEffect(() => {
    busyCallback.current(recording || uploading || requesting || !!blob);
  }, [recording, uploading, requesting, blob]);
  useEffect(() => {
    if (!recording) return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [recording]);
  function stop() {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setRecording(false);
  }
  async function start() {
    if (disabled || recording || requesting || uploading) return;
    if (blob && !window.confirm('استبدال التسجيل الذي لم تحفظه؟')) return;
    const attempt = ++revision.current;
    setRequesting(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('التسجيل غير مدعوم هنا؛ ارفع ملفًا صوتيًا من جهازك.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== revision.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const capture = new MediaRecorder(
        media,
        mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined
      );
      recorder.current = capture;
      const chunks: Blob[] = [];
      let bytes = 0;
      capture.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (bytes > 5 * 1024 * 1024) stop();
        }
      };
      capture.onstop = () => {
        if (attempt !== revision.current) return;
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setRecording(false);
        if (bytes > 5 * 1024 * 1024) {
          setError('التسجيل أكبر من ٥ ميجابايت؛ أعد التسجيل.');
          return;
        }
        setBlob(new Blob(chunks, { type: capture.mimeType || mime || 'audio/webm' }));
      };
      capture.onerror = () => {
        if (attempt === revision.current) {
          stop();
          setError('توقف التسجيل. أعد المحاولة أو ارفع ملفًا صوتيًا.');
        }
      };
      setBlob(null);
      setSeconds(0);
      setRecording(true);
      capture.start(500);
      stopTimer.current = setTimeout(stop, maxSeconds * 1000);
    } catch (e) {
      if (attempt === revision.current) {
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setError(e instanceof Error ? e.message : 'اسمح باستخدام الميكروفون ثم أعد المحاولة');
      }
    } finally {
      if (attempt === revision.current) setRequesting(false);
    }
  }
  async function upload() {
    if (!blob || uploading || disabled) return;
    setUploading(true);
    setError('');
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const form = new FormData();
      const ext = blob.type.includes('mp4')
        ? 'm4a'
        : blob.type.includes('mpeg')
          ? 'mp3'
          : blob.type.includes('wav')
            ? 'wav'
            : blob.type.includes('ogg')
              ? 'ogg'
              : 'webm';
      form.append('file', blob, `answer.${ext}`);
      const res = await fetch(`${API_URL}/api/homework-audio/${sessionId}/${questionId}`, {
        method: 'POST',
        headers: authorization(),
        body: form,
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (!controller.signal.aborted) {
        onUploaded(json.data.id);
        setBlob(null);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'تعذر رفع التسجيل؛ أعد المحاولة');
    } finally {
      if (!controller.signal.aborted) setUploading(false);
    }
  }
  return (
    <div className="homework-audio">
      {audioId && (
        <>
          <p>التسجيل محفوظ.</p>
          <AudioPlayback key={audioId} audioId={audioId} />
        </>
      )}
      {!disabled && (
        <>
          <p>
            سجل صوتك حتى {maxSeconds} ثانية، أو ارفع ملفًا صوتيًا حتى ٥ ميجابايت. اضغط حفظ التسجيل
            قبل تسليم الواجب.
          </p>
          <div className="homework-actions">
            {recording ? (
              <button type="button" className="btn btn-gold" onClick={stop}>
                إيقاف التسجيل · {seconds} ث
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline"
                disabled={uploading || requesting}
                onClick={() => void start()}
              >
                {requesting ? 'بانتظار إذن الميكروفون…' : 'بدء التسجيل'}
              </button>
            )}
            {requesting && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  revision.current++;
                  setRequesting(false);
                }}
              >
                إلغاء طلب التسجيل
              </button>
            )}
          </div>
          <label className="field">
            رفع ملف صوتي
            <input
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg"
              disabled={recording || uploading || requesting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 5 * 1024 * 1024) setError('الحد الأقصى ٥ ميجابايت');
                  else {
                    setBlob(file);
                    setError('');
                  }
                }
                e.target.value = '';
              }}
            />
          </label>
          {preview && <audio src={preview} controls />}
          {blob && (
            <div className="homework-actions">
              <button
                type="button"
                className="btn btn-gold"
                disabled={uploading}
                onClick={() => void upload()}
              >
                {uploading ? 'جارٍ حفظ التسجيل…' : 'حفظ التسجيل الصوتي'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={uploading}
                onClick={() => setBlob(null)}
              >
                تجاهل التسجيل الجديد
              </button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
