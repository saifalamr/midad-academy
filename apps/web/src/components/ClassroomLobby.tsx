'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { LocalUserChoices } from '@livekit/components-react';
import Icon from './Icon';

type Kind = 'audio' | 'video';
export type LessonInfo = { title: string; courseId: string; scheduledAt: string; status: string; teacherName?: string; course: { title: string } }; 
export default function ClassroomLobby({ name, lesson, onJoin, onBack }: { name: string; lesson?: LessonInfo | null; onJoin: (choices: LocalUserChoices) => void; onBack: () => void }) {
  const [enabled, setEnabled] = useState({ audio: false, video: false });
  const [busy, setBusy] = useState<Kind | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState({ audio: '', video: '' });
  const [errors, setErrors] = useState({ audio: '', video: '' });
  const error = Object.values(errors).filter(Boolean).join(' ');
  const streams = useRef<Partial<Record<Kind, MediaStream>>>({});
  const revisions = useRef({ audio: 0, video: 0 });
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const tracks = streams.current; const requests = revisions.current;
    return () => { requests.audio++; requests.video++; Object.values(tracks).forEach(stream => stream?.getTracks().forEach(track => track.stop())); };
  }, []);
  useEffect(() => { if (video.current) video.current.srcObject = enabled.video ? streams.current.video ?? null : null; }, [enabled.video, selected.video]);
  async function change(kind: Kind, turnOn: boolean, deviceId = selected[kind]) {
    const revision = ++revisions.current[kind];
    streams.current[kind]?.getTracks().forEach(track => track.stop()); delete streams.current[kind];
    setEnabled(prev => ({ ...prev, [kind]: false })); setErrors(prev => ({ ...prev, [kind]: '' }));
    if (!turnOn) return;
    setBusy(kind);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ [kind]: deviceId ? { deviceId: { exact: deviceId } } : true });
      if (revision !== revisions.current[kind]) { stream.getTracks().forEach(track => track.stop()); return; }
      streams.current[kind] = stream;
      const actualDevice = stream.getTracks()[0]?.getSettings().deviceId ?? deviceId;
      setSelected(prev => ({ ...prev, [kind]: actualDevice })); setEnabled(prev => ({ ...prev, [kind]: true }));
      stream.getTracks().forEach(track => track.addEventListener('ended', () => {
        if (revision !== revisions.current[kind]) return;
        setEnabled(prev => ({ ...prev, [kind]: false }));
        setErrors(prev => ({ ...prev, [kind]: kind === 'video' ? 'توقفت الكاميرا. اضغط تشغيل الكاميرا للمحاولة مجددًا.' : 'توقف الميكروفون. اضغط تشغيل الصوت للمحاولة مجددًا.' }));
      }, { once: true }));
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        if (revision === revisions.current[kind]) setDevices(available);
      } catch { /* Device labels are optional; capture remains usable. */ }
    } catch (err) {
      if (revision !== revisions.current[kind]) return;
      const blocked = err instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(err.name);
      setErrors(prev => ({ ...prev, [kind]: `${kind === 'video' ? 'الكاميرا: ' : 'الميكروفون: '}` + (blocked ? 'الإذن مرفوض. اسمح باستخدام الكاميرا والميكروفون من إعدادات الموقع في المتصفح، ثم جرّب مجددًا. يمكنك الدخول وهما مغلقان.' : 'تعذر تشغيل الجهاز. تأكد أنه متصل ولا يستخدمه تطبيق آخر، أو اختر جهازًا آخر. يمكنك الدخول بدون تشغيله.') }));
    } finally { if (revision === revisions.current[kind]) setBusy(null); }
  }
  return <main className="midad classroom-lobby lobby-v3" dir="rtl">
    <header className="lobby-header"><Image src="/midad-logo-transparent.png" width={64} height={50} alt="مداد" /><span>مداد أكاديمي <small>مساحة التعلم المباشر</small></span><button className="lobby-back" onClick={onBack}><Icon name="right" /> العودة لصفوفي</button></header>
    <section className="lobby-layout" aria-labelledby="lobby-title">
      <div className="lobby-preview-panel">
        <div className="lobby-video">
          <video ref={video} autoPlay muted playsInline aria-label="معاينة الكاميرا" hidden={!enabled.video} />
          {!enabled.video && <div className="lobby-camera-off"><span className="lobby-avatar">{name.slice(0, 1)}</span><strong>{busy === 'video' ? 'بانتظار تشغيل الكاميرا…' : errors.video ? 'تعذر تشغيل الكاميرا' : 'الكاميرا مغلقة'}</strong><span>{errors.video ? 'راجع الرسالة أدناه أو ادخل والكاميرا مغلقة' : 'افتحها لمعاينة صورتك قبل الدخول'}</span></div>}
          <span className="lobby-preview-name">{name}</span>
        </div>
        <div className="lobby-device-controls" aria-label="تجهيز الأجهزة">
          <button disabled={busy !== null} aria-pressed={enabled.audio} onClick={() => void change('audio', !enabled.audio)}><Icon name="mic" /><span>{busy === 'audio' ? 'جارٍ التشغيل…' : enabled.audio ? 'كتم الصوت' : 'تشغيل الصوت'}<small>{enabled.audio ? 'الميكروفون مفتوح' : 'الميكروفون مغلق'}</small></span><i className={enabled.audio ? 'device-on' : ''} /></button>
          <button disabled={busy !== null} aria-pressed={enabled.video} onClick={() => void change('video', !enabled.video)}><Icon name="video" /><span>{busy === 'video' ? 'جارٍ التشغيل…' : enabled.video ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}<small>{enabled.video ? 'الكاميرا مفتوحة' : 'الكاميرا مغلقة'}</small></span><i className={enabled.video ? 'device-on' : ''} /></button>
        </div>
        {devices.length > 0 && <div className="lobby-device-selects">{(['audio', 'video'] as const).map(kind => <label key={kind}>{kind === 'audio' ? 'الميكروفون' : 'الكاميرا'}<select disabled={busy !== null} value={selected[kind]} onChange={e => { const id = e.target.value; setSelected(prev => ({ ...prev, [kind]: id })); if (enabled[kind]) void change(kind, true, id); }}>{devices.filter(d => d.kind === `${kind}input`).map((d, index) => <option key={d.deviceId} value={d.deviceId}>{d.label || `جهاز ${index + 1}`}</option>)}</select></label>)}</div>}
        {error && <p className="lobby-device-error" role="alert"><Icon name="warning" />{error}</p>}
      </div>
      <div className="lobby-intro"><span className="lobby-eyebrow">قبل دخول الحصة</span><h1 id="lobby-title">جاهز للتعلّم؟</h1><p>راجع صوتك وصورتك، ثم ادخل الحصة. تستطيع تغييرهما في أي وقت أثناء الدرس.</p><div className="lobby-lesson">{lesson && <><h2>{lesson.title}</h2><p>{lesson.course.title}{lesson.teacherName ? ` · ${lesson.teacherName}` : ''}</p><span><Icon name="calendar" />{new Date(lesson.scheduledAt).toLocaleString('ar', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></>}</div><div className="lobby-identity"><span className="avatar">{name.slice(0, 1)}</span><div><small>تدخل باستخدام حسابك</small><strong>{name}</strong></div></div><button className="btn btn-gold lobby-join" onClick={() => { revisions.current.audio++; revisions.current.video++; Object.values(streams.current).forEach(stream => stream?.getTracks().forEach(track => track.stop())); onJoin({ username: name, audioEnabled: enabled.audio, videoEnabled: enabled.video, audioDeviceId: selected.audio || 'default', videoDeviceId: selected.video || 'default' }); }}>دخول الحصة <Icon name="left" /></button><p className="lobby-join-summary">{enabled.audio ? 'المايك مفتوح' : 'المايك مغلق'} · {enabled.video ? 'الكاميرا مفتوحة' : 'الكاميرا مغلقة'}</p><div className="lobby-tip"><Icon name="check" /><span>لن يسمعك أو يراك أحد حتى تدخل الحصة.</span></div></div>
    </section>
  </main>;
}
