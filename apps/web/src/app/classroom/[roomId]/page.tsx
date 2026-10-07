'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  PreJoin,
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
import { Track, RoomEvent, DisconnectReason, type RemoteParticipant } from 'livekit-client';
import Whiteboard, { PALETTE, type Tool, type EraserMode, type WhiteboardHandle } from '@/components/Whiteboard';
import { API_URL } from '@/lib/config';



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

function getRole(trackRef: TrackReferenceOrPlaceholder): string {
  try {
    return JSON.parse(trackRef.participant.metadata ?? '{}').role ?? 'student';
  } catch {
    return 'student';
  }
}

type RaisedHand = { identity: string; name: string };
type Reaction  = { id: string; emoji: string; x: number };
type DocType = 'pdf' | 'image' | 'youtube' | 'video' | 'html';
type SharedDoc = { url: string; name: string; docType: DocType; htmlContent?: string };
type CourseContentItem = { id: string; title: string; type: string; contentUrl: string };
type ShareTab = 'content' | 'url' | 'html';

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
      {loading && <p style={{ color: '#8ea0bb', fontSize: 13 }}>Loading page {page}…</p>}
      <canvas ref={canvasRef} style={{ maxWidth: '100%', boxShadow: '0 4px 20px rgba(0,0,0,.3)', borderRadius: 8, display: loading ? 'none' : 'block' }} />
      {isTeacher && totalPages > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(16,30,52,.9)', padding: '8px 16px', borderRadius: 999, position: 'sticky', bottom: 8 }}>
          <button className="bb-ic" onClick={() => onPageChange?.(Math.max(1, page - 1))} disabled={page <= 1}>◀</button>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{page} / {totalPages}</span>
          <button className="bb-ic" onClick={() => onPageChange?.(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>▶</button>
        </div>
      )}
      {!isTeacher && totalPages > 0 && (
        <div style={{ color: '#8ea0bb', fontSize: 12, padding: '4px 12px', background: 'rgba(16,30,52,.7)', borderRadius: 999 }}>
          Page {page} of {totalPages} — teacher controls navigation
        </div>
      )}
    </div>
  );
}

// ── Inner classroom UI (inside LiveKitRoom context) ──────────────────────────

function ClassroomContent({ roomId, isTeacher, onLeave }: {
  roomId: string;
  isTeacher: boolean;
  onLeave: () => void;
}) {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const teacherTrack = cameraTracks.find((t) => getRole(t) === 'teacher');
  const studentTracks = cameraTracks.filter((t) => getRole(t) !== 'teacher');
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const participantCount = cameraTracks.length;
  const [classError, setClassError] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const screenTrack = screenTracks.find(t => getRole(t) === 'teacher');
  function publish(payload: Uint8Array) { void localParticipant.publishData(payload, { reliable: true }).catch(() => setClassError('تعذر إرسال التحديث. تحقق من الاتصال.')); }

  // ── Raise Hand ───────────────────────────────────────────────────────────
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

  // ── Drawing Permission ────────────────────────────────────────────────────
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
  const [courseContent, setCourseContent] = useState<CourseContentItem[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [manualName, setManualName] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [shareTab, setShareTab] = useState<ShareTab>('content');
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
      if (!res.ok) { const json = await res.json(); throw new Error(json.error || 'تعذر حفظ محتوى الحصة'); }
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
          if (sender && ['👍', '❤️', '👏', '🎉'].includes(msg.emoji ?? '')) addReaction(msg.emoji!);
        }
      } catch { /* malformed message — ignore */ }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room, localParticipant.identity, addReaction, refreshState]);

  // Preload the teacher's course content so the shared-materials dock is populated.
  useEffect(() => {
    if (!isTeacher) return;
    authFetch(`/api/courses/${roomId}/lessons`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setCourseContent((json.data ?? []) as CourseContentItem[]);
      })
      .catch(() => {});
  }, [isTeacher, roomId]);

  // ── Document sharing: teacher broadcasts a doc to share / stop sharing ────
  function openShareModal() {
    setShareError('');
    setManualUrl('');
    setManualName('');
    setHtmlContent('');
    setShareTab('content');
    setShowShareModal(true);
    authFetch(`/api/courses/${roomId}/lessons`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setCourseContent((json.data ?? []) as CourseContentItem[]);
      })
      .catch(() => {});
  }

  async function shareDocument(url: string, name: string, docType: DocType, html = '') {
    const ok = await saveState({ sharedDoc: { url, name, docType, ...(docType === 'html' ? { htmlContent: html } : {}) }, pdfPage: 1 });
    if (ok) setShowShareModal(false);
  }

  function handleShareUrl() {
    const url = manualUrl.trim();
    try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error(); } catch { setShareError('اكتب رابط HTTP أو HTTPS صالحًا'); return; }
    shareDocument(url, manualName.trim() || 'Document', detectDocType(url));
  }

  function handleShareHtml() {
    if (!htmlContent.trim()) { setShareError('Paste some HTML to share'); return; }
    shareDocument('', manualName.trim() || 'Interactive Lesson', 'html', htmlContent);
  }

  function stopSharing() { void saveState({ sharedDoc: null, pdfPage: 1 }); }
  function goPdfPage(page: number) { void saveState({ pdfPage: Math.max(1, page) }); }

  // ── Emoji reaction: broadcast to all, also show locally ──────────────────
  function handleReaction(emoji: string) {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'reaction', identity: localParticipant.identity, emoji }),
    );
    publish(payload);
    addReaction(emoji); // show on the sender's screen immediately
  }

  // ── Raise Hand: student broadcasts their name to all participants ─────────
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

  // ── Drawing Permission: teacher sends targeted grant / revoke ─────────────
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
  const annotatable = !sharedDoc || sharedDoc.docType === 'image';
  const inkInteractive = drawPermission && annotatable;
  const raisedSet = new Set(raisedHands.map((h) => h.identity));
  const showZoom = !!sharedDoc && sharedDoc.docType === 'image';

  // Pointer-events for the shared-content layer:
  //  • image → none (so the teacher draws on top via the ink layer)
  //  • pdf   → teacher can navigate/scroll; students are locked out (follow only)
  //  • html / video / youtube → interactive for everyone
  const sharedPointer: 'none' | 'auto' =
    !sharedDoc ? 'none'
    : sharedDoc.docType === 'image' ? 'none'
    : sharedDoc.docType === 'pdf' ? (isTeacher ? 'auto' : 'none')
    : 'auto';

  return (
    <div className="midad room">
      <RoomAudioRenderer />

      {/* ── Raised-hand notifications (teacher-only, fixed overlay) ── */}
      {isTeacher && raisedHands.length > 0 && (
        <div className="rh-list">
          {raisedHands.map((h) => (
            <div key={h.identity} className="rh-toast">
              <span>✋ <b>{h.name}</b> raised their hand</span>
              <button
                className="rh-dismiss"
                aria-label="Dismiss"
                onClick={() => setRaisedHands((prev) => prev.filter((x) => x.identity !== h.identity))}
              >
                ✕
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
            <h4>✏️ Drawing Permission</h4>
            {remoteParticipants.length === 0 ? (
              <p style={{ color: '#8ea0bb', fontSize: 14 }}>No other participants in the room yet.</p>
            ) : (
              <div className="perm-picker-list">
                {remoteParticipants.map((p) => {
                  const granted = permittedStudents.has(p.identity);
                  return (
                    <div key={p.identity} className="perm-item">
                      <span className="perm-item-name">{p.name ?? p.identity}</span>
                      {granted ? (
                        <button className="perm-btn-revoke" onClick={() => revokeDraw(p.identity)}>
                          Revoke
                        </button>
                      ) : (
                        <button className="perm-btn-grant" onClick={() => grantDraw(p.identity)}>
                          Grant
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button className="perm-close" onClick={() => setShowPermPicker(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Room top bar ── */}
      <header className="room-top">
        <div className="rt-left">
          <button className="rt-back" onClick={onLeave} aria-label="Leave room">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div>
            <div className="rt-title ar">Arabic Live Class</div>
            <div className="rt-sub">Interactive whiteboard session</div>
          </div>
        </div>
        <div className="rt-center">
          <span className="badge-live"><span className="dot"></span> Live</span>
          <span className="rt-count">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 19v-2a4 4 0 0 0-3-3.9"/></svg>
            {participantCount}
          </span>
        </div>
        <div className="rt-right">
          {isTeacher && sharedDoc && (
            <button className="rt-icon" title="Stop sharing" onClick={stopSharing}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          )}
          {isTeacher && <button className="rt-leave btn btn-sm" onClick={async () => {
            if (!window.confirm('End this class for everyone?')) return;
            const res = await authFetch('/api/sessions/end', { method: 'POST', body: JSON.stringify({ roomName: roomId }) });
            if (!res.ok) { window.alert('Could not end the class. Please try again.'); return; }
            onLeave();
          }}>End class</button>}
          <button className="rt-leave btn btn-sm" onClick={onLeave}>Leave</button>
        </div>
      </header>

      {/* ── Video strip ── */}
      <div className="video-strip">
        <div className="vtile vteacher">
          {teacherTrack ? (
            <ParticipantTile trackRef={teacherTrack} style={{ width: '100%', height: '100%' }} />
          ) : (
            <div className="vph"><span>Waiting for teacher…</span></div>
          )}
          <div className="vlabel">
            <span className="vmic on"></span>
            Teacher
            <span className="vhost">Host</span>
          </div>
        </div>

        {studentTracks.slice(0, 4).map((track) => (
          <div key={track.participant.identity} className="vtile">
            <ParticipantTile trackRef={track} style={{ width: '100%', height: '100%' }} />
            <div className="vlabel">
              <span className="vmic on"></span>
              {track.participant.name ?? track.participant.identity}
            </div>
            {raisedSet.has(track.participant.identity) && <span className="vhand">✋</span>}
          </div>
        ))}

        {studentTracks.length > 4 && (
          <div className="vtile vmore"><span>+{studentTracks.length - 4}</span></div>
        )}
      </div>

      {/* ── Whiteboard area ── */}
      <div className="board-wrap">
        {/* Drawing tools — left sidebar */}
        <div className="wb-toolbar">
          <button className={`wb-tool ${tool === 'pen' ? 'on' : ''}`} title="Pen" onClick={() => setTool('pen')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 19l7-7 3 3-7 7-4 1 1-4z"/><path d="M18 13l-1.5-1.5"/><path d="M3 21l5-1 9-9-4-4-9 9z"/></svg>
          </button>
          <button className={`wb-tool ${tool === 'highlighter' ? 'on' : ''}`} title="Highlighter" onClick={() => setTool('highlighter')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l-4 4v3h3l4-4"/><path d="M13 7l4 4 4-4-4-4z"/><path d="M12 8l4 4"/></svg>
          </button>
          <button className={`wb-tool ${tool === 'eraser' ? 'on' : ''}`} title="Eraser" onClick={() => setTool('eraser')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 14l6-6 8 8-4 4H9z"/><path d="M5 20h14"/></svg>
          </button>
          <span className="wb-sep"></span>
          <button className={`wb-tool ${tool === 'text' ? 'on' : ''}`} title="Text" onClick={() => setTool('text')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6V5h16v1M12 5v14M9 19h6"/></svg>
          </button>
          <button className={`wb-tool ${tool === 'rectangle' ? 'on' : ''}`} title="Rectangle" onClick={() => setTool('rectangle')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>
          </button>
          <button className={`wb-tool ${tool === 'circle' ? 'on' : ''}`} title="Circle" onClick={() => setTool('circle')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/></svg>
          </button>
          <button className={`wb-tool ${tool === 'line' ? 'on' : ''}`} title="Line" onClick={() => setTool('line')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 19L19 5"/></svg>
          </button>
          <button className={`wb-tool ${tool === 'select' ? 'on' : ''}`} title="Select" onClick={() => setTool('select')}>
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M4 4l7.07 16.97 2.51-7.39 7.39-2.51z"/></svg>
          </button>
          <span className="wb-sep"></span>
          <button className="wb-tool" title="تراجع" aria-label="تراجع" onClick={() => whiteboardRef.current?.undo()}>↶</button>
          <button className="wb-tool" title="إعادة" aria-label="إعادة" onClick={() => whiteboardRef.current?.redo()}>↷</button>
          <button className="wb-tool" title="حفظ صورة السبورة" aria-label="حفظ صورة السبورة" onClick={() => whiteboardRef.current?.exportImage()}>⇩</button>
          <button className="wb-tool" title="Clear board" onClick={() => { if (window.confirm('مسح جميع الرسومات؟ يمكنك التراجع بعد المسح.')) whiteboardRef.current?.clear(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>

        <div className="board-stage">
          {/* Board header: what's being shared + page nav + zoom + share */}
          <div className="board-bar">
            <div className="bb-left">
              {sharedDoc ? (
                <>
                  <span className="badge-live"><span className="dot"></span> Sharing</span>
                  <span className="bb-name">{sharedDoc.name}</span>
                  <span className="bb-by">
                    <span className="bb-avatar">{teacherName.charAt(0).toUpperCase()}</span>
                    {teacherName}
                  </span>
                </>
              ) : (
                <span className="bb-name">Whiteboard · السبورة</span>
              )}
            </div>

            <div className="bb-right">
              {showZoom && (
                <>
                  <button
                    className="bb-ic" title="Zoom out"
                    onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
                    disabled={zoom <= 1}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M8 11h6"/></svg>
                  </button>
                  <button
                    className="bb-ic" title="Zoom in"
                    onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
                    disabled={zoom >= 2.5}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M11 8v6M8 11h6"/></svg>
                  </button>
                </>
              )}

              {/* PDF page controls now live inside PdfViewer itself. */}

              {isTeacher && (
                <button className="bb-chip" title="Share content" onClick={openShareModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>
                  Share content
                </button>
              )}
            </div>
          </div>

          {/* The board itself: shared content layer + transparent ink canvas on top */}
          <div className="board-paper">
            <div className="board-zoom" style={{ transform: `scale(${zoom})` }}>
              {/* shared content layer — sits UNDER the ink so the teacher draws on top */}
              {sharedDoc && (
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
                          Open video in new tab
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
                    // Interactive HTML lesson — sandboxed so pasted markup can't
                    // touch the parent page; scripts/forms are allowed so the
                    // lesson can be interactive for both teacher and students.
                    <iframe
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
              <div className="board-ink" style={{ pointerEvents: inkInteractive ? 'auto' : 'none' }}>
                <Whiteboard
                  ref={whiteboardRef}
                  roomId={roomId}
                  canDraw={drawPermission}
                  tool={tool}
                  color={color}
                  lineWidth={lineWidth}
                  eraserMode={eraserMode}
                  eraserSize={eraserSize}
                  overlay={!!sharedDoc}
                />
              </div>
            </div>

            {!sharedDoc && <div className="board-guide ar">✍️ اكتب على السبورة</div>}
            {sharedDoc && annotatable && <div className="board-guide ar">✍️ اكتب فوق المحتوى</div>}

            {/* shared-materials dock (teacher-only) */}
            {isTeacher && (
              <div className="board-dock">
                <span className="dock-label">Shared</span>
                {courseContent.map((c) => {
                  const dt = detectDocType(c.contentUrl);
                  const active = sharedDoc?.url === c.contentUrl;
                  const cls = dt === 'image' ? 'img' : (dt === 'video' || dt === 'youtube') ? 'aud' : 'doc';
                  const label = dt === 'image' ? 'IMG' : (dt === 'video' || dt === 'youtube') ? '▶' : 'PDF';
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
                <button className="dock-add" title="Share a file" onClick={openShareModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Color palette + line width — right sidebar */}
        <div className="wb-colors">
          {tool === 'eraser' && <div style={{ position: 'absolute', right: 16, top: 100, zIndex: 22, background: '#fff', color: '#101e34', padding: 8, borderRadius: 8 }}>
            <select aria-label="نوع الممحاة" value={eraserMode} onChange={e => setEraserMode(e.target.value as EraserMode)}>
              <option value="object">حذف الشكل كامل</option><option value="partial">مسح جزء من الشكل</option>
            </select>
            {eraserMode === 'partial' && <input aria-label="حجم الممحاة" type="range" min="8" max="100" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} />}
          </div>}

          {PALETTE.map((c) => (
            <button
              key={c}
              className={`wb-color ${color === c ? 'on' : ''}`}
              style={{ background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #ccc' : undefined }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
          <input
            type="range" min={1} max={20} value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="wb-width"
            aria-label="Line width"
          />
        </div>
      </div>

      {screenTrack && <div style={{ position: 'fixed', inset: '10% 10% 20%', zIndex: 30, background: '#101e34' }}><ParticipantTile trackRef={screenTrack} style={{ height: '100%' }} /></div>}
      {reconnecting && <div role="status" style={{ color: '#fbbf24', textAlign: 'center' }}>نعيد الاتصال بالحصة…</div>}
      {classError && <div role="alert" style={{ color: '#f87171', textAlign: 'center' }}>{classError} <button onClick={() => setClassError('')}>إغلاق</button></div>}
      <StartAudio label="تشغيل صوت الحصة" />
      {/* ── Room controls ── */}
      <div className="room-controls">
        {isTeacher && <button className="rc-btn" onClick={() => { void localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled).catch(() => setClassError('تعذر مشاركة الشاشة. قد لا يدعمها متصفح الجوال.')); }}>🖥 مشاركة الشاشة</button>}
        <button
          className="rc-btn"
          onClick={() => { void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => setClassError('تعذر تشغيل الميكروفون. تحقق من إذن المتصفح والجهاز.')); }}
        >
          <span className="rci">{isMicrophoneEnabled ? '🎤' : '🔇'}</span>
          <span>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
        </button>

        <button
          className="rc-btn"
          onClick={() => { void localParticipant.setCameraEnabled(!isCameraEnabled).catch(() => setClassError('تعذر تشغيل الكاميرا. تحقق من إذن المتصفح والجهاز.')); }}
        >
          <span className="rci">{isCameraEnabled ? '📷' : '📵'}</span>
          <span>{isCameraEnabled ? 'Stop Video' : 'Start Video'}</span>
        </button>

        {/* Students: Raise Hand sends a data-channel message to the teacher */}
        {!isTeacher && (
          <button className="rc-btn" onClick={handleRaiseHand}>
            <span className="rci">✋</span>
            <span>Raise Hand</span>
          </button>
        )}

        {/* Teacher: open the drawing-permission picker */}
        {isTeacher && (
          <button className="rc-btn" onClick={() => setShowPermPicker(true)}>
            <span className="rci">✏️</span>
            <span>Draw Access</span>
          </button>
        )}

        <button className="rc-btn" onClick={() => handleReaction('👍')}>
          <span className="rci">👍</span>
          <span>React</span>
        </button>

        <DisconnectButton onClick={onLeave} className="rc-btn rc-leave">
          <span className="rci">📞</span>
          <span>Leave</span>
        </DisconnectButton>
      </div>

      {/* ── Floating emoji reactions ── */}
      {reactions.map((r) => (
        <div
          key={r.id}
          className="reaction-float"
          style={{ left: `${r.x}%`, bottom: '90px' }}
        >
          {r.emoji}
        </div>
      ))}

      {/* ── Share Document modal (teacher-only) ── */}
      {isTeacher && showShareModal && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setShowShareModal(false); }}>
          <div className="modal">
            <div className="modal-head">
              <div><h3>Share Content</h3></div>
              <button className="modal-x" onClick={() => setShowShareModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 8, padding: '14px 28px 0' }}>
              {([['content', 'Course Content'], ['url', 'URL'], ['html', 'Interactive HTML']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-sm ${shareTab === key ? 'btn-gold' : 'btn-outline'}`}
                  onClick={() => { setShareTab(key); setShareError(''); }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="modal-body">
              {shareTab === 'content' && (
                <div className="field">
                  <label>From course content</label>
                  {courseContent.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>This course has no content yet.</p>
                  ) : (
                    <div className="share-list">
                      {courseContent.map((c) => {
                        const docType = detectDocType(c.contentUrl);
                        const icon = docType === 'youtube' || docType === 'video' ? '🎬' : docType === 'image' ? '🖼️' : '📄';
                        return (
                          <button key={c.id} type="button" className="share-list-item"
                            onClick={() => shareDocument(c.contentUrl, c.title, docType)}>
                            {icon} {c.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {shareTab === 'url' && (
                <>
                  <div className="field">
                    <label htmlFor="doc-url">Document / image URL</label>
                    <input id="doc-url" className="input" type="text" placeholder="https://…"
                      value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
                  </div>

                  <div className="field">
                    <label htmlFor="doc-name">Name <span className="muted" style={{ fontSize: 12 }}>(optional)</span></label>
                    <input id="doc-name" className="input" type="text" placeholder="e.g. Worksheet 1"
                      value={manualName} onChange={(e) => setManualName(e.target.value)} />
                  </div>
                </>
              )}

              {shareTab === 'html' && (
                <>
                  <div className="field">
                    <label htmlFor="html-content">HTML lesson</label>
                    <textarea
                      id="html-content"
                      className="input"
                      rows={8}
                      placeholder="Paste your HTML lesson here…"
                      value={htmlContent}
                      onChange={(e) => setHtmlContent(e.target.value)}
                      style={{ height: 'auto', minHeight: 160, padding: '12px 16px', fontFamily: 'monospace', fontSize: 13 }}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="html-name">Name <span className="muted" style={{ fontSize: 12 }}>(optional)</span></label>
                    <input id="html-name" className="input" type="text" placeholder="e.g. Interactive Quiz"
                      value={manualName} onChange={(e) => setManualName(e.target.value)} />
                  </div>
                </>
              )}

              {shareError && <div className="auth-error">{shareError}</div>}
            </div>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" onClick={() => setShowShareModal(false)}>Cancel</button>
              {shareTab === 'url' && (
                <button className="btn btn-gold" type="button" onClick={handleShareUrl}>Share</button>
              )}
              {shareTab === 'html' && (
                <button className="btn btn-gold" type="button" onClick={handleShareHtml}>Share</button>
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

  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState('');
  const [choices, setChoices] = useState<LocalUserChoices | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!choices) return;
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
    fetch(`${API_URL}/api/sessions/${currentRole === 'teacher' ? 'create' : 'join'}`, {
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
        if (!res.ok) { setError(res.status === 409 ? 'الحصة غير مباشرة الآن. انتظر بدء المعلم للحصة ثم أعد المحاولة.' : json.error || 'تعذر دخول الحصة'); return; }
        setToken(json.data.token);
        setLivekitUrl(json.data.livekitUrl);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setError('تعذر الاتصال بالخادم. تحقق من الإنترنت وأعد المحاولة.');
      });
    return () => { active = false; controller.abort(); };
  }, [roomId, router, choices, attempt]);

  function handleLeave() {
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
  }

  function retryJoin() {
    setToken(null); setError(''); setAttempt(value => value + 1);
  }

  function handleDisconnected(reason?: DisconnectReason) {
    if ([DisconnectReason.CLIENT_INITIATED, DisconnectReason.ROOM_DELETED, DisconnectReason.ROOM_CLOSED, DisconnectReason.PARTICIPANT_REMOVED].includes(reason ?? DisconnectReason.UNKNOWN_REASON)) {
      handleLeave(); return;
    }
    setError(reason === DisconnectReason.DUPLICATE_IDENTITY
      ? 'تم فتح الحصة بحسابك في جهاز أو نافذة أخرى. أغلقها هناك قبل إعادة الدخول.'
      : 'انقطع الاتصال بالحصة. تحقق من الإنترنت ثم أعد الدخول.');
  }

  if (error) {
    return (
      <div className="midad room" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <p role="alert" dir="rtl" style={{ color: '#f87171', fontWeight: 600, marginBottom: 12 }}>{error}</p>
          <button className="btn btn-gold btn-sm" onClick={retryJoin}>إعادة دخول الحصة</button>
          <button className="btn btn-ghost btn-sm" onClick={handleLeave}>الرجوع للوحة التحكم</button>
        </div>
      </div>
    );
  }

  if (!choices) return <div className="midad" style={{ minHeight: '100vh', background: '#101e34', color: '#fff', padding: 24 }}>
    <h1 dir="rtl" style={{ textAlign: 'center' }}>تجهيز الكاميرا والميكروفون قبل الحصة</h1>
    <PreJoin onSubmit={setChoices} persistUserChoices={false} joinLabel="دخول الحصة" defaults={{ username: 'مشارك', audioEnabled: false, videoEnabled: false }} />
    <p dir="rtl" style={{ textAlign: 'center' }}>اختر الأجهزة أو ادخل والصوت والكاميرا مغلقان، ثم شغّلهما داخل الحصة.</p>
  </div>;

  if (!token) {
    return (
      <div className="midad room" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div className="animate-spin" style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: '#8ea0bb' }}>Joining classroom…</p>
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
      video={choices.videoEnabled ? { deviceId: choices.videoDeviceId } : false}
      audio={choices.audioEnabled ? { deviceId: choices.audioDeviceId } : false}
      onDisconnected={handleDisconnected}
      onError={() => setError("تعذر الاتصال بالحصة. تحقق من الإنترنت وأعد الدخول.")}
      style={{ height: '100vh' }}
    >
      <ClassroomContent roomId={roomId} isTeacher={role === 'teacher'} onLeave={handleLeave} />
    </LiveKitRoom>
  );
}
