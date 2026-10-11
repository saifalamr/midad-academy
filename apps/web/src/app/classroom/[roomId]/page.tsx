'use client';

import CameraVideo from '@/components/CameraVideo';
import Link from 'next/link';
import Icon, { type IconName } from '@/components/Icon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  StartAudio,
  type LocalUserChoices,
  useTracks,
  ParticipantTile,
  useLocalParticipant,
  RoomAudioRenderer,
  DisconnectButton,
  useRoomContext,
  useRemoteParticipants,
} from '@livekit/components-react';
import '@livekit/components-styles';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track, RoomEvent, DisconnectReason, VideoPresets, AudioPresets, type RoomOptions, type RemoteParticipant } from 'livekit-client';
import Whiteboard, { PALETTE, type Tool, type EraserMode, type WhiteboardHandle } from '@/components/Whiteboard';
import './classroom.css';
import ClassroomLobby, { type LessonInfo } from '@/components/ClassroomLobby';
import { useAuth } from '@/components/AuthProvider';
import { API_URL } from '@/lib/config';



// Video tiles are small. Avoid capturing and decoding HD on mobile, while
// letting LiveKit select visible layers and pause unused encodings.
const CLASSROOM_MEDIA_OPTIONS: RoomOptions = {
  adaptiveStream: { pixelDensity: 1 },
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
  publishDefaults: {
    simulcast: true,
    videoEncoding: VideoPresets.h360.encoding,
    videoSimulcastLayers: [VideoPresets.h180],
    audioPreset: AudioPresets.speech,
  },
};

function authFetch(path: string, options: RequestInit = {}) {
  const token = (localStorage.getItem('token') ?? sessionStorage.getItem('token'));
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

function CallIcon({ name, off = false }: { name: 'mic' | 'camera' | 'screen' | 'draw' | 'hand' | 'react' | 'leave'; off?: boolean }) {
  const paths = { mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8', camera: 'M3 6h12v12H3z M15 10l6-3v10l-6-3', screen: 'M3 4h18v13H3z M8 21h8 M12 17v4', draw: 'M4 16l12-12 4 4L8 20H4z M13 7l4 4', hand: 'M8 12V5a2 2 0 0 1 4 0v6 M12 11V4a2 2 0 0 1 4 0v7 M16 11V7a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2', react: 'M8 10h.01 M16 10h.01 M8 15q4 4 8 0 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', leave: 'M3 15v-4q9-8 18 0v4l-5-1v-3q-4-2-8 0v3z' };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} />{off && <path d="M3 3l18 18" />}</svg>;
}

function getRole(trackRef: TrackReferenceOrPlaceholder): string {
  try {
    return JSON.parse(trackRef.participant.metadata ?? '{}').role ?? 'student';
  } catch {
    return 'student';
  }
}

type RaisedHand = { identity: string; name: string };
const reactionIcons: Record<string, IconName> = { '\u{1f44d}': 'thumbsUp', '\u{2764}\u{fe0f}': 'heart', '\u{1f44f}': 'applause', '\u{1f389}': 'celebration' };
type Reaction  = { id: string; emoji: string; x: number };
type DocType = 'pdf' | 'image' | 'youtube' | 'video' | 'html';
type SharedDoc = { url: string; name: string; docType: DocType; htmlContent?: string };
type CourseContentItem = { id: string; title: string; type: string; contentUrl: string };
type ShareTab = 'plan' | 'content' | 'url' | 'html' | 'file';

function getYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.replace(/^www\./, '');
    const id = host === 'youtu.be' ? parsed.pathname.slice(1) : ['youtube.com', 'm.youtube.com'].includes(host) ? (parsed.searchParams.get('v') || parsed.pathname.split('/')[2]) : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

function detectDocType(url: string): DocType {
  const clean = url.split('?')[0].toLowerCase();
  if (getYouTubeId(url)) return 'youtube';
  if (/\.(jpe?g|png|gif|webp|svg)$/.test(clean)) return 'image';
  if (/\.(mp4|webm|ogg|mov)$/.test(clean)) return 'video';
  return 'pdf';
}

// ── PDF viewer — renders pages with PDF.js onto a canvas ─────────────────────
// The teacher drives the page; students receive page updates over the data
// channel and follow along. Rendering client-side avoids the Google Docs
// viewer, which is unreliable for cross-origin URLs.
function PdfViewer({ url, page, isTeacher, onPageChange }: {
  url: string;
  page: number;
  isTeacher: boolean;
  onPageChange?: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    async function render() {
      setLoading(true); setError('');
      const pdfjsLib = await import('pdfjs-dist');
      // pdfjs v4+ ships an ESM worker (.mjs). jsDelivr mirrors npm, so this
      // always resolves to the exact installed version's worker file.
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      const task = pdfjsLib.getDocument({ url });
      cleanup = () => { void task.destroy(); };
      if (cancelled) { cleanup(); return; }
      const pdf = await task.promise;
      if (cancelled) return;
      setTotalPages(pdf.numPages);
      const pageObj = await pdf.getPage(Math.min(page, pdf.numPages));
      if (cancelled) return;
      const viewport = pageObj.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await pageObj.render({ canvas, canvasContext: ctx, viewport }).promise;
      setLoading(false);
    }
    render().catch(() => { if (!cancelled) { setLoading(false); setError('تعذر فتح الملف. تحقق من الرابط وإمكانية الوصول إليه.'); } });
    return () => { cancelled = true; cleanup?.(); };
  }, [url, page]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, overflow: 'auto', padding: 12 }}>
      {error && <p role="alert" style={{ color: '#f87171' }}>{error}</p>}
      {loading && <p style={{ color: '#8ea0bb', fontSize: 13 }}>جارٍ تحميل الصفحة {page}…</p>}
      <canvas ref={canvasRef} style={{ maxWidth: '100%', boxShadow: '0 4px 20px rgba(0,0,0,.3)', borderRadius: 8, display: loading ? 'none' : 'block' }} />
      {isTeacher && totalPages > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(16,30,52,.9)', padding: '8px 16px', borderRadius: 999, position: 'sticky', bottom: 8 }}>
          <button className="bb-ic" aria-label="الصفحة السابقة" onClick={() => onPageChange?.(Math.max(1, page - 1))} disabled={page <= 1}><Icon name="left" /></button>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{page} / {totalPages}</span>
          <button className="bb-ic" aria-label="الصفحة التالية" onClick={() => onPageChange?.(Math.min(totalPages, page + 1))} disabled={page >= totalPages}><Icon name="right" /></button>
        </div>
      )}
      {!isTeacher && totalPages > 0 && (
        <div style={{ color: '#8ea0bb', fontSize: 12, padding: '4px 12px', background: 'rgba(16,30,52,.7)', borderRadius: 999 }}>
          صفحة {page} من {totalPages} · التنقل بإدارة المعلم
        </div>
      )}
    </div>
  );
}

// ── Inner classroom UI (inside LiveKitRoom context) ──────────────────────────

function ClassroomContent({ roomId, title, isTeacher, isObserver, onLeave, onEnd }: {
  title?: string;
  roomId: string;
  isTeacher: boolean;
  isObserver: boolean;
  onLeave: () => void;
  onEnd: () => void;
}) {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const teacherTrack = cameraTracks.find((t) => getRole(t) === 'teacher');
  const studentTracks = cameraTracks.filter((t) => getRole(t) === 'student');
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const participantCount = cameraTracks.filter(t => ['teacher', 'student'].includes(getRole(t))).length;
  const [classError, setClassError] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const screenTrack = screenTracks.find(t => getRole(t) === 'teacher');
  function publish(payload: Uint8Array) { void localParticipant.publishData(payload, { reliable: true }).catch(() => setClassError('تعذر إرسال التحديث. تحقق من الاتصال.')); }

  // ── رفع اليد ───────────────────────────────────────────────────────────
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([]);

  // ── Emoji reactions ───────────────────────────────────────────────────────
  const [reactions, setReactions] = useState<Reaction[]>([]);

  // Stable helper — adds a floating emoji then removes it after the animation.
  const addReaction = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    const x = 15 + Math.random() * 70; // 15-85% of screen width
    setReactions((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 2100);
  }, []);

  // ── إذن الرسم ────────────────────────────────────────────────────
  // Starts true for teachers. Students start view-only; teacher can grant
  // or revoke per-student drawing access via the data channel.
  const [drawPermission, setDrawPermission] = useState(isTeacher);
  const [permittedStudents, setPermittedStudents] = useState<Set<string>>(new Set());
  const [showPermPicker, setShowPermPicker] = useState(false);

  // ── Whiteboard tools (left/right sidebars control the Whiteboard canvas) ──
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PALETTE[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [eraserMode, setEraserMode] = useState<EraserMode>('object');
  const [eraserSize, setEraserSize] = useState(24);
  const [zoom, setZoom] = useState(1);
  const whiteboardRef = useRef<WhiteboardHandle>(null);

  // ── Document sharing ──────────────────────────────────────────────────────
  const [sharedDoc, setSharedDoc] = useState<SharedDoc | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sessionContent, setSessionContent] = useState<CourseContentItem[]>([]);
  const [planLoadError, setPlanLoadError] = useState('');
  const [courseContent, setCourseContent] = useState<CourseContentItem[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [manualName, setManualName] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [view, setView] = useState<'board' | 'content' | 'screen'>('board');
  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareInFlight = useRef(false);
  const [contentNotice, setContentNotice] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [contentLoadError, setContentLoadError] = useState('');
  const contentController = useRef<AbortController | null>(null);
  const contentBusy = uploading || sharing;
  const [shareTab, setShareTab] = useState<ShareTab>('plan');
  const [shareError, setShareError] = useState('');

  // ── PDF page sync — teacher drives the page, students follow ──────────────
  const [pdfPage, setPdfPage] = useState(1);

  // Reset zoom + PDF page whenever the shared content changes.
  useEffect(() => { setZoom(1); }, [sharedDoc?.url]);

  const refreshSequence = useRef(0);
  const refreshState = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const res = await authFetch(`/api/sessions/state/${roomId}`);
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      if (sequence !== refreshSequence.current) return;
      setSharedDoc(data.sharedDoc); setPdfPage(data.pdfPage);
      setDrawPermission(data.canDraw); setPermittedStudents(new Set(data.permittedStudents));
    } catch { setClassError('تعذر تحديث محتوى الحصة. أعد الاتصال.'); }
  }, [roomId]);
  useEffect(() => {
    void refreshState();
    const disconnected = (participant: RemoteParticipant) => setRaisedHands(prev => prev.filter(h => h.identity !== participant.identity));
    const reconnect = () => setReconnecting(true);
    const connected = () => { setReconnecting(false); void refreshState(); };
    room.on(RoomEvent.RoomMetadataChanged, refreshState);
    room.on(RoomEvent.Reconnecting, reconnect);
    room.on(RoomEvent.Reconnected, connected);
    room.on(RoomEvent.ParticipantDisconnected, disconnected);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, refreshState); room.off(RoomEvent.Reconnecting, reconnect);
      room.off(RoomEvent.Reconnected, connected); room.off(RoomEvent.ParticipantDisconnected, disconnected);
      // Invalidate outstanding requests when this room subscription ends.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      refreshSequence.current++;
    };
  }, [room, refreshState]);
  async function saveState(body: { sharedDoc?: SharedDoc | null; pdfPage?: number }) {
    try {
      const res = await authFetch(`/api/sessions/state/${roomId}`, { method: 'PATCH', body: JSON.stringify(body) });
      if (!res.ok) throw new Error('تعذر تحديث محتوى الحصة. تحقق من الاتصال وأعد المحاولة.');
      await refreshState();
      publish(new TextEncoder().encode(JSON.stringify({ type: 'state-changed' })));
      return true;
    } catch (error) { setClassError(error instanceof Error ? error.message : 'تعذر حفظ محتوى الحصة'); return false; }
  }

  // ── Data channel: receive raise-hand, draw-permission, reaction, doc-share, pdf-page ───
  useEffect(() => {
    const onData = (payload: Uint8Array, sender?: RemoteParticipant) => {
      try {
        if (payload.byteLength > 40000) return;
        const msg = JSON.parse(new TextDecoder().decode(payload)) as {
          type: string;
          identity: string;
          name?: string;
          canDraw?: boolean;
          emoji?: string;
          url?: string;
          docType?: DocType;
          htmlContent?: string;
          page?: number;
        };

        let senderRole = '';
        try { senderRole = JSON.parse(sender?.metadata ?? '{}').role; } catch {}
        if (['draw-permission', 'share-doc', 'stop-share', 'pdf-page', 'state-changed'].includes(msg.type) && senderRole !== 'teacher') return;
        if (msg.type === 'state-changed' || msg.type === 'draw-permission') { void refreshState(); return; }
        if (msg.type === 'raise-hand') {
          if (!sender || msg.identity !== sender.identity) return;
          setRaisedHands((prev) =>
            prev.some((h) => h.identity === msg.identity)
              ? prev
              : [...prev, { identity: msg.identity, name: msg.name ?? msg.identity }],
          );
        } else if (msg.type === 'reaction') {
          if (sender && ['\u{1f44d}', '\u{2764}\u{fe0f}', '\u{1f44f}', '\u{1f389}'].includes(msg.emoji ?? '')) addReaction(msg.emoji!);
        }
      } catch { /* malformed message — ignore */ }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room, localParticipant.identity, addReaction, refreshState]);

  const loadCourseContent = useCallback(async () => {
    contentController.current?.abort();
    const controller = new AbortController(); contentController.current = controller;
    setContentLoading(true); setContentLoadError(''); setPlanLoadError('');
    const results = await Promise.allSettled([
      authFetch(`/api/sessions/materials/live/${roomId}`, { signal: controller.signal }).then(async res => { if (!res.ok) throw new Error(); return (await res.json()).data.materials as CourseContentItem[]; }),
      authFetch(`/api/courses/${roomId}/lessons`, { signal: controller.signal }).then(async res => { if (!res.ok) throw new Error(); return (await res.json()).data as CourseContentItem[]; }),
    ]);
    if (controller.signal.aborted) return;
    if (results[0].status === 'fulfilled') setSessionContent(results[0].value);
    else { setSessionContent([]); setPlanLoadError('تعذر تحميل خطة الحصة. أعد المحاولة.'); }
    if (results[1].status === 'fulfilled') setCourseContent(results[1].value.filter(item => item.type !== 'EXERCISE'));
    else { setCourseContent([]); setContentLoadError('تعذر تحميل منهج الدورة. أعد المحاولة.'); }
    setContentLoading(false);
  }, [roomId]);
  useEffect(() => {
    if (isTeacher) void loadCourseContent();
    return () => contentController.current?.abort();
  }, [isTeacher, loadCourseContent]);

  function openShareModal() {
    if (contentBusy) return;
    setShareError(''); setManualUrl(''); setManualName(''); setHtmlContent('');
    setShareTab('plan'); setShowShareModal(true); void loadCourseContent();
  }

  async function shareDocument(url: string, name: string, docType: DocType, html = '') {
    if (shareInFlight.current) return;
    shareInFlight.current = true; setSharing(true); setShareError('');
    try {
      const ok = await saveState({ sharedDoc: { url, name, docType, ...(docType === 'html' ? { htmlContent: html } : {}) }, pdfPage: 1 });
      if (ok) { setShowShareModal(false); setView('content'); setContentNotice(`تمت مشاركة: ${name}`); }
      else setShareError('تعذر مشاركة المحتوى. بياناتك باقية هنا؛ أعد المحاولة.');
    } finally { shareInFlight.current = false; setSharing(false); }
  }

  function handleShareUrl() {
    const url = manualUrl.trim();
    try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error(); } catch { setShareError('اكتب رابط HTTP أو HTTPS صالحًا'); return; }
    shareDocument(url, manualName.trim() || 'محتوى الحصة', detectDocType(url));
  }

  async function uploadFile(file: File) {
    setShareError('');
    if (file.size > 10 * 1024 * 1024) { setShareError('اختر ملفًا أصغر من 10 ميجابايت'); return; }
    setUploading(true);
    try {
      if (/\.html?$/i.test(file.name)) {
        const html = await file.text();
        if (!html.trim() || html.length > 32000) throw new Error('ملف HTML يجب أن يحتوي محتوى وألا يتجاوز 32 ألف حرف');
        await shareDocument('', file.name, 'html', html);
      } else {
        if (!['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type)) throw new Error('اختر PDF أو صورة أو ملف HTML');
        const body = new FormData(); body.append('file', file);
        const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.includes('not configured') ? 'خدمة رفع الملفات تحتاج إعداد التخزين. يمكنك الآن مشاركة رابط الملف أو إضافة HTML.' : 'تعذر رفع الملف. حاول مرة أخرى');
        await shareDocument(json.data.url, file.name, file.type.startsWith('image/') ? 'image' : 'pdf');
      }
    } catch (e) { setShareError(e instanceof Error ? e.message : 'تعذر رفع الملف'); }
    finally { setUploading(false); }
  }

  const sharedContentIdentity = sharedDoc ? JSON.stringify([sharedDoc.url, sharedDoc.name, sharedDoc.docType, sharedDoc.htmlContent]) : '';
  const sharedScreenIdentity = screenTrack?.publication?.trackSid ?? '';
  useEffect(() => { setView(sharedContentIdentity ? 'content' : 'board'); setZoom(1); }, [sharedContentIdentity]);
  useEffect(() => {
    if (sharedScreenIdentity) setView('screen');
    else setView(current => current === 'screen' ? 'board' : current);
  }, [sharedScreenIdentity]);

  function handleShareHtml() {
    if (!htmlContent.trim() || htmlContent.length > 32000) { setShareError('أضف HTML لا يتجاوز 32 ألف حرف'); return; }
    shareDocument('', manualName.trim() || 'نشاط تفاعلي', 'html', htmlContent);
  }

  async function stopSharing() {
    if (shareInFlight.current || uploading) return;
    shareInFlight.current = true; setSharing(true);
    try { if (await saveState({ sharedDoc: null, pdfPage: 1 })) setContentNotice('تم إيقاف عرض المحتوى للطلاب.'); }
    finally { shareInFlight.current = false; setSharing(false); }
  }
  function goPdfPage(page: number) { void saveState({ pdfPage: Math.max(1, page) }); }

  // ── Emoji reaction: broadcast to all, also show locally ──────────────────
  function handleReaction(emoji: string) {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'reaction', identity: localParticipant.identity, emoji }),
    );
    publish(payload);
    addReaction(emoji); // show on the sender's screen immediately
  }

  // ── رفع اليد: student broadcasts their name to all participants ─────────
  function handleRaiseHand() {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        type: 'raise-hand',
        identity: localParticipant.identity,
        name: localParticipant.name ?? localParticipant.identity,
      }),
    );
    publish(payload);
  }

  // ── إذن الرسم: teacher sends targeted grant / revoke ─────────────
  async function sendDrawPermission(identity: string, grant: boolean) {
    const res = await authFetch('/api/sessions/drawing-permission', { method: 'POST', body: JSON.stringify({ roomName: roomId, studentId: identity, canDraw: grant }) });
    if (!res.ok) { setClassError('تعذر تغيير صلاحية الرسم'); return; }
    await refreshState();
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'draw-permission', identity, canDraw: grant }),
    );
    publish(payload);
  }

  function grantDraw(identity: string) {
    void sendDrawPermission(identity, true).catch(() => setClassError('تعذر تغيير صلاحية الرسم'));
    setShowPermPicker(false);
  }

  function revokeDraw(identity: string) {
    void sendDrawPermission(identity, false).catch(() => setClassError('تعذر تغيير صلاحية الرسم'));
  }

  // ── Derived view helpers ──────────────────────────────────────────────────
  const teacherName = teacherTrack?.participant.name ?? teacherTrack?.participant.identity ?? 'Teacher';
  // Images are annotated on top → the ink layer stays interactive and the
  // content layer ignores pointer events. For PDFs, video, YouTube and HTML the
  // content layer is interactive (per role) and the ink layer isn't.
  const contentVisible = view === 'content' && !!sharedDoc;
  const annotatable = view !== 'screen' && (!contentVisible || sharedDoc?.docType === 'image');
  const inkInteractive = !isObserver && drawPermission && annotatable;
  const raisedSet = new Set(raisedHands.map((h) => h.identity));
  const showZoom = contentVisible && sharedDoc?.docType === 'image';

  // Pointer-events for the shared-content layer:
  //  • image → none (so the teacher draws on top via the ink layer)
  //  • pdf   → teacher can navigate/scroll; students are locked out (follow only)
  //  • html / video / youtube → interactive for everyone
  const sharedPointer: 'none' | 'auto' =
    !sharedDoc || (isObserver && sharedDoc.docType === 'html') ? 'none'
    : sharedDoc.docType === 'image' ? 'none'
    : sharedDoc.docType === 'pdf' ? (isTeacher ? 'auto' : 'none')
    : 'auto';

  return (
    <div className={`midad room classroom-v2${isObserver ? ' classroom-observer' : ''}`}>
      <RoomAudioRenderer />

      {/* ── Raised-hand notifications (teacher-only, fixed overlay) ── */}
      {isTeacher && raisedHands.length > 0 && (
        <div className="rh-list">
          {raisedHands.map((h) => (
            <div key={h.identity} className="rh-toast">
              <span><Icon name="hand" /> <b>{h.name}</b> raised their hand</span>
              <button
                className="rh-dismiss"
                aria-label="Dismiss"
                onClick={() => setRaisedHands((prev) => prev.filter((x) => x.identity !== h.identity))}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Drawing-permission picker (teacher-only modal) ── */}
      {isTeacher && showPermPicker && (
        <div
          className="perm-picker-bg"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPermPicker(false); }}
        >
          <div className="perm-picker">
            <h4><Icon name="edit" /> إذن الرسم</h4>
            {remoteParticipants.length === 0 ? (
              <p style={{ color: '#8ea0bb', fontSize: 14 }}>لم ينضم أحد بعد.</p>
            ) : (
              <div className="perm-picker-list">
                {remoteParticipants.filter(p => { try { return JSON.parse(p.metadata ?? '{}').role === 'student'; } catch { return false; } }).map((p) => {
                  const granted = permittedStudents.has(p.identity);
                  return (
                    <div key={p.identity} className="perm-item">
                      <span className="perm-item-name">{p.name ?? p.identity}</span>
                      {granted ? (
                        <button className="perm-btn-revoke" onClick={() => revokeDraw(p.identity)}>
                          سحب الإذن
                        </button>
                      ) : (
                        <button className="perm-btn-grant" onClick={() => grantDraw(p.identity)}>
                          السماح
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button className="perm-close" onClick={() => setShowPermPicker(false)}>
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* ── Room top bar ── */}
      <header className="room-top">
        <div className="rt-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="classroom-logo" src="/midad-logo-transparent.png" alt="مداد" />
          <button className="rt-back" onClick={onLeave} aria-label="Leave room">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div>
            <div className="rt-title ar">{title || 'فصل مداد المباشر'}</div>
            <div className="rt-sub">نتعلم ونشارك معًا</div>
          </div>
        </div>
        <div className="rt-center">
          <span className="badge-live"><span className="dot"></span> مباشر</span>
          <span className="rt-count">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 19v-2a4 4 0 0 0-3-3.9"/></svg>
            {participantCount}
          </span>
        </div>
        <div className="rt-right">
          {isTeacher && <button className="rt-leave btn btn-sm" onClick={async () => {
            if (!window.confirm('إنهاء الحصة لجميع المشاركين؟')) return;
            const res = await authFetch('/api/sessions/end', { method: 'POST', body: JSON.stringify({ roomName: roomId }) });
            if (!res.ok) { window.alert('تعذر إنهاء الحصة. أعد المحاولة.'); return; }
            onEnd();
          }}>إنهاء الحصة</button>}
          <button className="rt-leave btn btn-sm" onClick={onLeave}>مغادرة</button>
        </div>
      </header>

      {/* ── Video strip ── */}
      <div className="video-strip">
        <div className="vtile vteacher">
          {teacherTrack ? (
            <CameraVideo trackRef={teacherTrack} />
          ) : (
            <div className="vph"><span>بانتظار المعلم…</span></div>
          )}
          <div className="vlabel">
            <span className={`vmic ${teacherTrack?.participant.isMicrophoneEnabled ? "on" : ""}`}></span>
            المعلم
            <span className="vhost">المضيف</span>
          </div>
        </div>

        {studentTracks.slice(0, 4).map((track) => (
          <div key={track.participant.identity} className="vtile">
            <CameraVideo trackRef={track} />
            <div className="vlabel">
              <span className={`vmic ${track.participant.isMicrophoneEnabled ? "on" : ""}`}></span>
              {track.participant.name ?? track.participant.identity}
            </div>
            {raisedSet.has(track.participant.identity) && <span className="vhand"><Icon name="hand" /></span>}
          </div>
        ))}

        {studentTracks.length > 4 && (
          <div className="vtile vmore"><span>+{studentTracks.length - 4}</span></div>
        )}
      </div>

      {/* ── Whiteboard area ── */}
      <div className="board-wrap">
        {/* Drawing tools — left sidebar */}
        {!isObserver && <div className="wb-toolbar" role="toolbar" aria-label="أدوات السبورة">
          <button className={`wb-tool ${tool === 'pen' ? 'on' : ''}`} title="قلم" aria-pressed={tool === 'pen'} aria-label="قلم" disabled={!inkInteractive} onClick={() => setTool('pen')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 19l7-7 3 3-7 7-4 1 1-4z"/><path d="M18 13l-1.5-1.5"/><path d="M3 21l5-1 9-9-4-4-9 9z"/></svg>
          <span>قلم</span></button>
          <button className={`wb-tool ${tool === 'highlighter' ? 'on' : ''}`} title="تظليل" aria-pressed={tool === 'highlighter'} aria-label="تظليل" disabled={!inkInteractive} onClick={() => setTool('highlighter')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l-4 4v3h3l4-4"/><path d="M13 7l4 4 4-4-4-4z"/><path d="M12 8l4 4"/></svg>
          <span>تظليل</span></button>
          <button className={`wb-tool ${tool === 'eraser' ? 'on' : ''}`} title="ممحاة" aria-pressed={tool === 'eraser'} aria-label="ممحاة" disabled={!inkInteractive} onClick={() => setTool('eraser')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 14l6-6 8 8-4 4H9z"/><path d="M5 20h14"/></svg>
          <span>ممحاة</span></button>
          <span className="wb-sep"></span>
          <button className={`wb-tool ${tool === 'text' ? 'on' : ''}`} title="نص" aria-pressed={tool === 'text'} aria-label="نص" disabled={!inkInteractive} onClick={() => setTool('text')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6V5h16v1M12 5v14M9 19h6"/></svg>
          <span>نص</span></button>
          <button className={`wb-tool ${tool === 'rectangle' ? 'on' : ''}`} title="مستطيل" aria-pressed={tool === 'rectangle'} aria-label="مستطيل" disabled={!inkInteractive} onClick={() => setTool('rectangle')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>
          <span>مستطيل</span></button>
          <button className={`wb-tool ${tool === 'circle' ? 'on' : ''}`} title="دائرة" aria-pressed={tool === 'circle'} aria-label="دائرة" disabled={!inkInteractive} onClick={() => setTool('circle')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/></svg>
          <span>دائرة</span></button>
          <button className={`wb-tool ${tool === 'line' ? 'on' : ''}`} title="خط" aria-pressed={tool === 'line'} aria-label="خط" disabled={!inkInteractive} onClick={() => setTool('line')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 19L19 5"/></svg>
          <span>خط</span></button>
          <button className={`wb-tool ${tool === 'select' ? 'on' : ''}`} title="تحديد" aria-pressed={tool === 'select'} aria-label="تحديد" disabled={!inkInteractive} onClick={() => setTool('select')}>
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M4 4l7.07 16.97 2.51-7.39 7.39-2.51z"/></svg>
          <span>تحديد</span></button>
          <span className="wb-sep"></span>
          <button disabled={!inkInteractive} className="wb-tool" title="تراجع" aria-label="تراجع" onClick={() => whiteboardRef.current?.undo()}><Icon name="undo" /></button>
          <button disabled={!inkInteractive} className="wb-tool" title="إعادة" aria-label="إعادة" onClick={() => whiteboardRef.current?.redo()}><Icon name="redo" /></button>
          <button className="wb-tool" title="حفظ صورة السبورة" aria-label="حفظ صورة السبورة" onClick={() => whiteboardRef.current?.exportImage()}><Icon name="download" /></button>
          <button disabled={!inkInteractive} className="wb-tool" title="مسح السبورة" aria-label="مسح السبورة" onClick={() => { if (window.confirm('مسح جميع الرسومات؟ يمكنك التراجع بعد المسح.')) whiteboardRef.current?.clear(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>}

        <div className="board-stage">
          {/* Board header: what's being shared + page nav + zoom + share */}
          <div className="board-bar">
            <div className="bb-left">
              {sharedDoc ? (
                <>
                  <span className="badge-live"><span className="dot"></span> معروض للطلاب</span>
                  <span className="bb-name">{sharedDoc.name}</span>
                  <span className="bb-by">
                    <span className="bb-avatar">{teacherName.charAt(0).toUpperCase()}</span>
                    {teacherName}
                  </span>
                </>
              ) : (
                <span className="bb-name">السبورة</span>
              )}
            </div>

            <div className="bb-right">
              {isTeacher && sharedDoc && <button className="stop-content-share" disabled={contentBusy} onClick={() => void stopSharing()} title="إيقاف مشاركة المحتوى"><Icon name="close" /><span>إيقاف المشاركة</span></button>}
              {showZoom && (
                <>
                  <button
                    className="bb-ic" title="تصغير" aria-label="تصغير المحتوى"
                    onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
                    disabled={zoom <= 1}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M8 11h6"/></svg>
                  </button>
                  <button
                    className="bb-ic" title="تكبير" aria-label="تكبير المحتوى"
                    onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
                    disabled={zoom >= 2.5}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M11 8v6M8 11h6"/></svg>
                  </button>
                </>
              )}

              {/* PDF page controls now live inside PdfViewer itself. */}

              {isTeacher && (
                <button className="bb-chip" title="إضافة محتوى" disabled={contentBusy} onClick={openShareModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>
                  إضافة محتوى
                </button>
              )}
            </div>
          </div>

          {/* The board itself: shared content layer + transparent ink canvas on top */}
          <nav className="workspace-tabs" aria-label="مساحة الحصة">
            <button aria-pressed={view === 'board'} onClick={() => { setView('board'); setZoom(1); }}>السبورة</button>
            {sharedDoc && <button aria-pressed={view === 'content'} onClick={() => { setView('content'); setZoom(1); }}>المحتوى</button>}
            {screenTrack && <button aria-pressed={view === 'screen'} onClick={() => { setView('screen'); setZoom(1); }}>الشاشة المشتركة</button>}
            <span>{drawPermission ? 'يمكنك الرسم' : 'مشاهدة · اطلب إذن الرسم'}</span>
          </nav>
          <div className="board-paper">
            <div className="board-zoom" style={{ transform: `scale(${zoom})` }}>
              {/* shared content layer — sits UNDER the ink so the teacher draws on top */}
              {contentVisible && sharedDoc && (
                <div className="board-shared" style={{ pointerEvents: sharedPointer }}>
                  {sharedDoc.docType === 'youtube' ? (
                    (() => {
                      const videoId = getYouTubeId(sharedDoc.url);
                      return videoId ? (
                        <iframe
                          src={`https://www.youtube.com/embed/${videoId}`}
                          title={sharedDoc.name}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <a className="btn btn-gold" href={sharedDoc.url} target="_blank" rel="noreferrer">
                          فتح الفيديو في نافذة جديدة
                        </a>
                      );
                    })()
                  ) : sharedDoc.docType === 'video' ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={sharedDoc.url} controls />
                  ) : sharedDoc.docType === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sharedDoc.url} alt={sharedDoc.name} />
                  ) : sharedDoc.docType === 'html' ? (
                    // HTML تفاعلي lesson — sandboxed so pasted markup can't
                    // touch the parent page; scripts/forms are allowed so the
                    // lesson can be interactive for both teacher and students.
                    <iframe
                      tabIndex={isObserver ? -1 : undefined}
                      srcDoc={sharedDoc.htmlContent}
                      title={sharedDoc.name}
                      sandbox="allow-scripts allow-forms"
                      style={{ width: '100%', height: '100%', border: 'none', borderRadius: 10 }}
                    />
                  ) : (
                    // PDFs render client-side with PDF.js onto a canvas. The
                    // teacher navigates pages; students follow over the data
                    // channel. Page controls live inside PdfViewer itself.
                    <PdfViewer
                      url={sharedDoc.url}
                      page={pdfPage}
                      isTeacher={isTeacher}
                      onPageChange={(p) => goPdfPage(p)}
                    />
                  )}
                </div>
              )}

              {/* ink layer — transparent fabric canvas overlaying the content */}
              <div className="board-ink" style={{ pointerEvents: inkInteractive ? 'auto' : 'none', visibility: annotatable ? 'visible' : 'hidden' }}>
                <Whiteboard
                  ref={whiteboardRef}
                  roomId={roomId}
                  canDraw={inkInteractive}
                  tool={tool}
                  color={color}
                  lineWidth={lineWidth}
                  eraserMode={eraserMode}
                  eraserSize={eraserSize}
                  overlay={contentVisible}
                />
              </div>
            </div>

            {view === 'board' && <div className="board-guide ar">{isObserver ? 'مشاهدة فقط · السبورة تتحدث مع المعلم' : !drawPermission ? 'مشاهدة فقط · المعلم يتحكم بإذن الرسم' : tool === 'text' ? 'اضغط لإضافة نص، ثم اكتب' : tool === 'select' ? 'اضغط على الشكل لتحريكه أو تغيير حجمه' : 'اختر أداة ثم ارسم على السبورة'}</div>}
            {!isObserver && contentVisible && annotatable && <div className="board-guide ar"><Icon name="edit" /> اكتب فوق المحتوى</div>}

            {view === 'screen' && screenTrack && <div className="workspace-screen"><ParticipantTile trackRef={screenTrack} style={{ height: '100%' }} /></div>}
            {/* shared-materials dock (teacher-only) */}
            {isTeacher && (
              <div className="board-dock">
                <span className="dock-label">خطة الحصة</span>
                {sessionContent.map((c) => {
                  const dt = c.type === 'VIDEO' && !getYouTubeId(c.contentUrl) ? 'video' : detectDocType(c.contentUrl);
                  const active = sharedDoc?.url === c.contentUrl;
                  const cls = dt === 'image' ? 'img' : (dt === 'video' || dt === 'youtube') ? 'aud' : 'doc';
                  const label = <Icon name={dt === 'image' ? 'file' : (dt === 'video' || dt === 'youtube') ? 'video' : 'file'} />;
                  return (
                    <button
                      key={c.id}
                      className={`dock-item ${active ? 'on' : ''}`}
                      title={active ? `Stop sharing ${c.title}` : c.title}
                      onClick={() => (active ? stopSharing() : shareDocument(c.contentUrl, c.title, dt))}
                    >
                      <span className={`dk-ic ${cls}`}>{label}</span>
                    </button>
                  );
                })}
                <button className="dock-add" title="إضافة محتوى" disabled={contentBusy} onClick={openShareModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Color palette + line width — right sidebar */}
        {!isObserver && <div className="wb-colors" aria-label="خصائص أداة السبورة"><span className="tool-caption">{tool === 'eraser' ? 'الممحاة' : tool === 'text' ? 'النص' : tool === 'pen' ? 'القلم · اللون والسُمك' : tool === 'highlighter' ? 'التظليل · اللون والسُمك' : 'الشكل · اللون والسُمك'}</span>
          {tool === 'eraser' && <div className="eraser-options">
            <select aria-label="نوع الممحاة" value={eraserMode} onChange={e => setEraserMode(e.target.value as EraserMode)}>
              <option value="object">مسح الشكل كاملًا</option><option value="partial">مسح جزء من الشكل</option>
            </select>
            {eraserMode === 'partial' && <input aria-label="حجم الممحاة" type="range" min="8" max="100" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} />}
          </div>}

          {tool !== 'eraser' && PALETTE.map((c) => (
            <button
              key={c}
              className={`wb-color ${color === c ? 'on' : ''}`}
              style={{ background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #ccc' : undefined }}
              onClick={() => setColor(c)}
              aria-label={`لون ${c}`} aria-pressed={color === c} disabled={!inkInteractive}
            />
          ))}
          {tool !== 'eraser' && <label className="tool-size">السُمك <input
            disabled={!inkInteractive} type="range" min={1} max={20} value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="wb-width"
            aria-label="سُمك الخط"
          /><output>{lineWidth}</output></label>}
        </div>}
      </div>


      {contentNotice && <div className="classroom-notice" role="status"><Icon name="check" /><span>{contentNotice}</span><button aria-label="إغلاق إشعار المحتوى" onClick={() => setContentNotice('')}><Icon name="close" /></button></div>}
      {reconnecting && <div role="status" style={{ color: '#fbbf24', textAlign: 'center' }}>نعيد الاتصال بالحصة…</div>}
      {classError && <div role="alert" style={{ color: '#f87171', textAlign: 'center' }}>{classError} <button onClick={() => setClassError('')}>إغلاق</button></div>}
      <StartAudio className="classroom-start-audio" label="تشغيل صوت الحصة" />
      {/* ── Room controls ── */}
      <div className="room-controls" aria-label="أدوات المكالمة">
        {isObserver && <span className="observer-notice" dir="rtl">وضع المشاهدة · بدون كاميرا أو ميكروفون أو تفاعل</span>}
        {!isObserver && <>

        <button
          className={`rc-btn ${!isMicrophoneEnabled ? "rc-off" : ""}`} aria-pressed={isMicrophoneEnabled}
          onClick={() => { void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => setClassError('تعذر تشغيل الميكروفون. تحقق من إذن المتصفح والجهاز.')); }}
        >
          <CallIcon name="mic" off={!isMicrophoneEnabled} />
          <span>{isMicrophoneEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}</span>
        </button>

        <button
          className={`rc-btn ${!isCameraEnabled ? "rc-off" : ""}`} aria-pressed={isCameraEnabled}
          onClick={() => { void localParticipant.setCameraEnabled(!isCameraEnabled).catch(() => setClassError('تعذر تشغيل الكاميرا. تحقق من إذن المتصفح والجهاز.')); }}
        >
          <CallIcon name="camera" off={!isCameraEnabled} />
          <span>{isCameraEnabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}</span>
        </button>

        <details className="call-more"><summary><Icon name="menu" /><span>المزيد</span></summary><div className="call-more-menu">        {isTeacher && <button className="rc-btn" onClick={() => { void localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled).catch(() => setClassError('تعذر مشاركة الشاشة. قد لا يدعمها متصفح الجوال.')); }}><CallIcon name="screen" /><span>الشاشة</span></button>}        {/* Students: رفع اليد sends a data-channel message to the teacher */}
        {!isTeacher && (
          <button className="rc-btn" onClick={handleRaiseHand}>
            <CallIcon name="hand" />
            <span>رفع اليد</span>
          </button>
        )}

        {/* Teacher: open the drawing-permission picker */}
        {isTeacher && (
          <button className="rc-btn" onClick={() => setShowPermPicker(true)}>
            <CallIcon name="draw" />
            <span>إذن الرسم</span>
          </button>
        )}

        <button className="rc-btn" onClick={() => handleReaction('\u{1f44d}')}>
          <CallIcon name="react" />
          <span>تفاعل</span>
        </button>
</div></details></>}

        <DisconnectButton onClick={onLeave} className="rc-btn rc-leave">
          <CallIcon name="leave" />
          <span>مغادرة</span>
        </DisconnectButton>
      </div>

      {/* ── Floating emoji reactions ── */}
      {reactions.map((r) => (
        <div
          key={r.id}
          className="reaction-float"
          style={{ left: `${r.x}%`, bottom: '90px' }}
        >
          <Icon name={reactionIcons[r.emoji] ?? "thumbsUp"} size={40} />
        </div>
      ))}

      {/* ── Share Document modal (teacher-only) ── */}
      {isTeacher && showShareModal && (
        <div className="modal-bg" onClick={(e) => { if (!contentBusy && e.target === e.currentTarget) setShowShareModal(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
            <div className="modal-head">
              <div><h3 id="share-modal-title">إضافة محتوى للحصة</h3></div>
              <button className="modal-x" disabled={contentBusy} aria-label="إغلاق إضافة المحتوى" onClick={() => setShowShareModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>

            {/* Tab switcher */}
            <div className="share-tabs">
              {([['plan', 'خطة الحصة'], ['content', 'منهج الدورة'], ['file', 'رفع ملف'], ['url', 'رابط / يوتيوب'], ['html', 'HTML']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-sm ${shareTab === key ? 'btn-gold' : 'btn-outline'}`}
                  disabled={contentBusy} onClick={() => { setShareTab(key); setShareError(''); }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="modal-body">
              {(shareTab === 'content' || shareTab === 'plan') && (
                <div className="field">
                  <label>{shareTab === 'plan' ? 'مواد هذه الحصة حسب ترتيب الإدارة' : 'كل مواد منهج الدورة'}</label>
                  {contentLoading ? <p role="status">جارٍ تحميل مواد الدورة…</p> : (shareTab === 'plan' ? planLoadError : contentLoadError) ? <div role="alert"><p>{shareTab === 'plan' ? planLoadError : contentLoadError}</p><button className="btn btn-outline btn-sm" onClick={() => void loadCourseContent()}>إعادة تحميل المواد</button></div> : (shareTab === 'plan' ? sessionContent : courseContent).length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{shareTab === 'plan' ? 'الإدارة لم تخصص مواد لهذه الحصة بعد. يمكنك مراجعة تبويب منهج الدورة.' : 'لا توجد ملفات في الدورة بعد.'}</p>
                  ) : (
                    <div className="share-list">
                      {(shareTab === 'plan' ? sessionContent : courseContent).map((c, index) => {
                        const docType = c.type === 'VIDEO' && !getYouTubeId(c.contentUrl) ? 'video' : detectDocType(c.contentUrl);
                        const icon = docType === 'youtube' || docType === 'video' ? <><Icon name="video" /></> : docType === 'image' ? <><Icon name="file" /></> : <><Icon name="file" /></>;
                        return (
                          <button key={c.id} type="button" className="share-list-item" disabled={contentBusy}
                            onClick={() => shareDocument(c.contentUrl, c.title, docType)}>
                            {icon} {shareTab === 'plan' ? `${index + 1}. ` : ''}{c.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {shareTab === 'file' && <div className="field"><label htmlFor="class-file">PDF أو صورة أو HTML</label><input id="class-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.html,.htm" disabled={contentBusy} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadFile(file); e.target.value = ''; }} /><p role="status">{uploading ? 'جارٍ رفع الملف ومشاركته…' : 'حتى 10 ميجابايت. HTML حتى 32 ألف حرف.'}</p></div>}
              {shareTab === 'url' && (
                <>
                  <div className="field">
                    <label htmlFor="doc-url">رابط PDF أو صورة أو فيديو يوتيوب</label>
                    <input id="doc-url" className="input" type="text" placeholder="https://…"
                      value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
                  </div>

                  <div className="field">
                    <label htmlFor="doc-name">اسم المحتوى <span className="muted" style={{ fontSize: 12 }}>(اختياري)</span></label>
                    <input id="doc-name" className="input" type="text" placeholder="مثال: ورقة التدريب"
                      value={manualName} onChange={(e) => setManualName(e.target.value)} />
                  </div>
                </>
              )}

              {shareTab === 'html' && (
                <>
                  <div className="field">
                    <label htmlFor="html-content">درس HTML</label>
                    <textarea
                      id="html-content"
                      className="input"
                      rows={8}
                      placeholder="الصق محتوى درس HTML هنا…"
                      value={htmlContent}
                      onChange={(e) => setHtmlContent(e.target.value)}
                      style={{ height: 'auto', minHeight: 160, padding: '12px 16px', fontFamily: 'monospace', fontSize: 13 }}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="html-name">اسم المحتوى <span className="muted" style={{ fontSize: 12 }}>(اختياري)</span></label>
                    <input id="html-name" className="input" type="text" placeholder="مثال: نشاط تفاعلي"
                      value={manualName} onChange={(e) => setManualName(e.target.value)} />
                  </div>
                </>
              )}

              {sharing && <p role="status">جارٍ مشاركة المحتوى مع الطلاب…</p>}{shareError && <div role="alert" className="auth-error">{shareError}</div>}
            </div>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" disabled={contentBusy} onClick={() => setShowShareModal(false)}>إلغاء</button>
              {shareTab === 'url' && (
                <button className="btn btn-gold" type="button" disabled={contentBusy} onClick={handleShareUrl}>مشاركة</button>
              )}
              {shareTab === 'html' && (
                <button className="btn btn-gold" type="button" disabled={contentBusy} onClick={handleShareHtml}>مشاركة</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page shell — fetches LiveKit token then mounts the room ─────────────────

export default function ClassroomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { user, status } = useAuth();
  const isObserver = user?.role === 'PARENT';
  const [lesson, setLesson] = useState<LessonInfo | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    authFetch('/api/sessions/upcoming', { signal: controller.signal }).then(async res => {
      if (!res.ok) return;
      const json = await res.json();
      if (controller.signal.aborted) return;
      const matches = (json.data as LessonInfo[]).filter(item => item.courseId === roomId);
      setLesson(matches.find(item => item.status === 'LIVE') ?? matches[0] ?? null);
    }).catch(() => { /* Session details are optional; joining stays available. */ });
    return () => controller.abort();
  }, [roomId]);

  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState('');
  const [choices, setChoices] = useState<LocalUserChoices | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [exit, setExit] = useState<'left' | 'ended' | 'removed' | null>(null);
  useEffect(() => {
    if (exit !== 'ended' || user?.role !== 'STUDENT' || !lesson?.id) return;
    const controller = new AbortController();
    authFetch(`/api/homework/${lesson.id}`, {signal: controller.signal}).then(res => {if (res.ok && !controller.signal.aborted) router.replace(`/student/homework/${lesson.id}`);}).catch(() => {});
    return () => controller.abort();
  }, [exit, user?.role, lesson?.id, router]);

  useEffect(() => {
    if (!choices || exit) return;
    const appToken = (localStorage.getItem('token') ?? sessionStorage.getItem('token'));




    if (!appToken) {

      router.push('/login');
      return;
    }

    let currentRole = '';
    try {
      const payload = JSON.parse(atob(appToken.split('.')[1]));
      currentRole = payload.role?.toLowerCase() ?? '';
      setRole(currentRole);
    } catch {
      setRole(null);
    }



    const controller = new AbortController();
    let active = true;
    fetch(`${API_URL}/api/sessions/${currentRole === 'teacher' ? 'create' : currentRole === 'parent' ? 'observe' : 'join'}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appToken}`,
      },
      body: JSON.stringify({ roomName: roomId }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!active) return;
        if (!res.ok) { setError(res.status === 409 ? 'الحصة غير مباشرة الآن. انتظر بدء المعلم للحصة ثم أعد المحاولة.' : res.status === 503 ? 'الحصة غير متاحة مؤقتًا. أعد المحاولة لاحقًا أو تواصل مع الأكاديمية.' : res.status === 403 ? 'هذا الحساب ليس مسجّلًا في هذه الحصة. ارجع إلى صفوفك وتأكد من الدورة.' : 'تعذر دخول الحصة. أعد المحاولة أو تواصل مع الأكاديمية.'); return; }
        setToken(json.data.token);
        setLivekitUrl(json.data.livekitUrl);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setError('تعذر الاتصال بالخادم. تحقق من الإنترنت وأعد المحاولة.');
      });
    return () => { active = false; controller.abort(); };
  }, [roomId, router, choices, attempt, exit]);

  const goDashboard = useCallback(() => {
    const appToken = (localStorage.getItem('token') ?? sessionStorage.getItem('token'));
    if (appToken) {
      try {
        const payload = JSON.parse(atob(appToken.split('.')[1]));
        const r = payload.role?.toLowerCase();
        if (r === 'teacher') { router.push('/teacher'); return; }
        if (r === 'parent')  { router.push('/parent');  return; }
        if (r === 'student') { router.push('/student'); return; }
      } catch { /* fall through */ }
    }
    router.push('/login');
  }, [router]);

  const handleLeave = useCallback(() => setExit(value => value ?? 'left'), []);
  const handleEnd = useCallback(() => setExit('ended'), []);

  function retryJoin() {
    setToken(null); setError(''); setAttempt(value => value + 1);
  }

  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    if (reason === DisconnectReason.CLIENT_INITIATED) { handleLeave(); return; }
    if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED) { setExit('ended'); return; }
    if (reason === DisconnectReason.PARTICIPANT_REMOVED) { setExit('removed'); return; }
    setError(reason === DisconnectReason.DUPLICATE_IDENTITY
      ? 'تم فتح الحصة بحسابك في جهاز أو نافذة أخرى. أغلقها هناك قبل إعادة الدخول.'
      : 'انقطع الاتصال بالحصة. تحقق من الإنترنت ثم أعد الدخول.');
  }, [handleLeave]);
  const handleRoomError = useCallback(() => setError('تعذر الاتصال بالحصة. تحقق من الإنترنت وأعد الدخول.'), []);
  const cameraCapture = useMemo(() => !isObserver && choices?.videoEnabled ? { deviceId: choices.videoDeviceId } : false, [isObserver, choices?.videoEnabled, choices?.videoDeviceId]);
  const audioCapture = useMemo(() => !isObserver && choices?.audioEnabled ? { deviceId: choices.audioDeviceId } : false, [isObserver, choices?.audioEnabled, choices?.audioDeviceId]);

  if (exit) return <main className="midad classroom-lobby" dir="rtl"><section className="lobby-state classroom-exit"><div className="exit-icon"><Icon name={exit === 'removed' ? 'warning' : 'check'} size={30} /></div><h1>{exit === 'ended' ? 'انتهت الحصة' : exit === 'removed' ? 'تم إغلاق دخولك للحصة' : 'غادرت الحصة'}</h1><p>{exit === 'ended' ? 'شكرًا لمشاركتك. يمكنك متابعة مواد الدورة من لوحة التحكم.' : exit === 'removed' ? 'تواصل مع المعلم إذا كنت تحتاج العودة. يمكنك الرجوع إلى صفوفك الآن.' : isObserver ? 'انتهت المشاهدة. يمكنك العودة ما دامت الحصة مستمرة.' : 'تم قطع اتصالك بالكاميرا والميكروفون. يمكنك العودة ما دامت الحصة مستمرة.'}</p>{lesson && <strong>{lesson.title}</strong>}<div className="exit-actions"><button className="btn btn-gold" onClick={goDashboard}>الرجوع للوحة التحكم</button>{exit === 'left' && <button className="btn btn-outline" onClick={() => { setChoices(null); setToken(null); setError(''); setExit(null); }}>{isObserver ? 'العودة للمشاهدة' : 'العودة لتجهيز الحصة'}</button>}{role === 'student' && <Link className="btn btn-gold" href={`/student/homework${lesson?.id ? '/' + lesson.id : ''}`}>واجب الحصة</Link>}{role === 'teacher' && <Link className="btn btn-gold" href={`/teacher/reports?course=${encodeURIComponent(roomId)}`}>كتابة تقارير الطلاب</Link>}{!isObserver && <Link className="btn btn-outline" href={`/courses/${roomId}/lessons`}>مواد الدورة</Link>}</div></section></main>;

  if (error) {
    return (
      <div className="midad classroom-lobby" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="lobby-state">
          <p role="alert" dir="rtl" style={{ color: '#a83232', fontWeight: 600, marginBottom: 12 }}>{error}</p>
          <button className="btn btn-gold btn-sm" onClick={retryJoin}>إعادة دخول الحصة</button>
          <button className="btn btn-ghost btn-sm" onClick={goDashboard}>الرجوع للوحة التحكم</button>
        </div>
      </div>
    );
  }

  if (status === 'loading') return <main className="midad classroom-lobby"><p role="status">جارٍ تحميل الحساب…</p></main>;
  if (!choices && isObserver) return <main className="midad classroom-lobby" dir="rtl"><section className="lobby-state"><Icon name="eye" size={36} /><h1>مشاهدة حصة طفلك</h1><p>يمكنك متابعة صوت الحصة والكاميرا والمحتوى والسبورة. دخولك للمشاهدة فقط، بدون كاميرا أو ميكروفون أو تفاعل.</p><button className="btn btn-gold" onClick={() => setChoices({ audioEnabled: false, videoEnabled: false, audioDeviceId: '', videoDeviceId: '', username: user.name })}>دخول للمشاهدة</button><button className="btn btn-outline" onClick={goDashboard}>الرجوع لصفحة ولي الأمر</button></section></main>;
  if (!choices) return <ClassroomLobby lesson={lesson} name={user?.name || 'مشارك'} onJoin={setChoices} onBack={goDashboard} />;

  if (!token) {
    return (
      <div className="midad classroom-lobby" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="lobby-state">
          <div aria-hidden="true" className="animate-spin" style={{ width: 32, height: 32, border: '2px solid #e7d8b9', borderTopColor: '#c9922a', borderRadius: '50%', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: '#60728a' }}>جارٍ دخول الحصة…</p><button className="btn btn-outline" onClick={() => { setChoices(null); setToken(null); setError(''); }}>{isObserver ? 'العودة للمشاهدة' : 'العودة لتجهيز الأجهزة'}</button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      key={attempt}
      serverUrl={livekitUrl}
      token={token}
      connect
      options={CLASSROOM_MEDIA_OPTIONS}
      video={cameraCapture}
      audio={audioCapture}
      onDisconnected={handleDisconnected}
      onError={handleRoomError}
      style={{ height: '100dvh' }}
    >
      <ClassroomContent title={lesson?.title} roomId={roomId} isTeacher={role === 'teacher'} isObserver={isObserver} onLeave={handleLeave} onEnd={handleEnd} />
    </LiveKitRoom>
  );
}
