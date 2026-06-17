'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  LiveKitRoom,
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
import { Track, RoomEvent } from 'livekit-client';
import Whiteboard, { PALETTE, type Tool, type WhiteboardHandle } from '@/components/Whiteboard';
import { API_URL } from '@/lib/config';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL!;

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
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
type DocType = 'pdf' | 'image' | 'youtube' | 'video';
type SharedDoc = { url: string; name: string; docType: DocType };
type CourseContentItem = { id: string; title: string; type: string; contentUrl: string };

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function detectDocType(url: string): DocType {
  const clean = url.split('?')[0].toLowerCase();
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/\.(jpe?g|png|gif|webp|svg)$/.test(clean)) return 'image';
  if (/\.(mp4|webm|ogg|mov)$/.test(clean)) return 'video';
  return 'pdf';
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
  const [zoom, setZoom] = useState(1);
  const whiteboardRef = useRef<WhiteboardHandle>(null);

  // ── Document sharing ──────────────────────────────────────────────────────
  const [sharedDoc, setSharedDoc] = useState<SharedDoc | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [courseContent, setCourseContent] = useState<CourseContentItem[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [manualName, setManualName] = useState('');
  const [shareError, setShareError] = useState('');

  // Reset zoom whenever the shared content changes.
  useEffect(() => { setZoom(1); }, [sharedDoc?.url]);

  // ── Data channel: receive raise-hand, draw-permission, reaction, and doc-share msgs ───
  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as {
          type: string;
          identity: string;
          name?: string;
          canDraw?: boolean;
          emoji?: string;
          url?: string;
          docType?: DocType;
        };

        if (msg.type === 'raise-hand') {
          setRaisedHands((prev) =>
            prev.some((h) => h.identity === msg.identity)
              ? prev
              : [...prev, { identity: msg.identity, name: msg.name ?? msg.identity }],
          );
        } else if (msg.type === 'draw-permission' && msg.identity === localParticipant.identity) {
          setDrawPermission(msg.canDraw ?? false);
        } else if (msg.type === 'reaction') {
          addReaction(msg.emoji ?? '👍');
        } else if (msg.type === 'share-doc' && msg.url) {
          setSharedDoc({ url: msg.url, name: msg.name ?? 'Document', docType: msg.docType ?? 'pdf' });
        } else if (msg.type === 'stop-share') {
          setSharedDoc(null);
        }
      } catch { /* malformed message — ignore */ }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room, localParticipant.identity, addReaction]);

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
    setShowShareModal(true);
    authFetch(`/api/courses/${roomId}/lessons`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setCourseContent((json.data ?? []) as CourseContentItem[]);
      })
      .catch(() => {});
  }

  function shareDocument(url: string, name: string, docType: DocType) {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'share-doc', identity: localParticipant.identity, url, name, docType }),
    );
    localParticipant.publishData(payload, { reliable: true });
    setSharedDoc({ url, name, docType });
    setShowShareModal(false);
  }

  function handleShareUrl() {
    const url = manualUrl.trim();
    if (!url) { setShareError('Enter a document or image URL'); return; }
    shareDocument(url, manualName.trim() || 'Document', detectDocType(url));
  }

  function stopSharing() {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'stop-share', identity: localParticipant.identity }),
    );
    localParticipant.publishData(payload, { reliable: true });
    setSharedDoc(null);
  }

  // ── Emoji reaction: broadcast to all, also show locally ──────────────────
  function handleReaction(emoji: string) {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'reaction', identity: localParticipant.identity, emoji }),
    );
    localParticipant.publishData(payload, { reliable: true });
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
    localParticipant.publishData(payload, { reliable: true });
  }

  // ── Drawing Permission: teacher sends targeted grant / revoke ─────────────
  function sendDrawPermission(identity: string, grant: boolean) {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'draw-permission', identity, canDraw: grant }),
    );
    localParticipant.publishData(payload, { reliable: true });
  }

  function grantDraw(identity: string) {
    setPermittedStudents((prev) => new Set([...prev, identity]));
    sendDrawPermission(identity, true);
    setShowPermPicker(false);
  }

  function revokeDraw(identity: string) {
    setPermittedStudents((prev) => { const s = new Set(prev); s.delete(identity); return s; });
    sendDrawPermission(identity, false);
  }

  // ── Derived view helpers ──────────────────────────────────────────────────
  const teacherName = teacherTrack?.participant.name ?? teacherTrack?.participant.identity ?? 'Teacher';
  // Images are annotated on top → the ink layer stays interactive and the
  // content layer ignores pointer events. For PDFs (rendered in an embedded
  // viewer the user scrolls/navigates), video, and YouTube, the content layer
  // is interactive and the ink layer isn't.
  const annotatable = !sharedDoc || sharedDoc.docType === 'image';
  const inkInteractive = drawPermission && annotatable;
  const raisedSet = new Set(raisedHands.map((h) => h.identity));
  const showZoom = !!sharedDoc && sharedDoc.docType === 'image';

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
          <button className="wb-tool" title="Clear board" onClick={() => whiteboardRef.current?.clear()}>
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
                <div className="board-shared" style={{ pointerEvents: annotatable ? 'none' : 'auto' }}>
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
                  ) : (
                    // PDFs render in the Google Docs viewer, which reliably
                    // embeds any public URL (e.g. Cloudinary) cross-origin —
                    // unlike a client-side fetch, which Cloudinary can block.
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(sharedDoc.url)}&embedded=true`}
                      title={sharedDoc.name}
                      style={{ width: '100%', height: '100%', border: 'none' }}
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

      {/* ── Room controls ── */}
      <div className="room-controls">
        <button
          className="rc-btn"
          onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        >
          <span className="rci">{isMicrophoneEnabled ? '🎤' : '🔇'}</span>
          <span>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
        </button>

        <button
          className="rc-btn"
          onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        >
          <span className="rci">📷</span>
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
              <div><h3>Share Document</h3></div>
              <button className="modal-x" onClick={() => setShowShareModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>

            <div className="modal-body">
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

              <div className="field">
                <label htmlFor="doc-url">Or paste a document/image URL</label>
                <input id="doc-url" className="input" type="text" placeholder="https://…"
                  value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="doc-name">Name <span className="muted" style={{ fontSize: 12 }}>(optional)</span></label>
                <input id="doc-name" className="input" type="text" placeholder="e.g. Worksheet 1"
                  value={manualName} onChange={(e) => setManualName(e.target.value)} />
              </div>

              {shareError && <div className="auth-error">{shareError}</div>}
            </div>

            <div className="modal-foot">
              <button className="btn btn-outline" type="button" onClick={() => setShowShareModal(false)}>Cancel</button>
              <button className="btn btn-gold" type="button" onClick={handleShareUrl}>Share</button>
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
  const [error, setError] = useState('');

  useEffect(() => {
    const appToken = localStorage.getItem('token');

    console.log('[Classroom] localStorage token:', appToken ? `${appToken.slice(0, 30)}…` : 'NULL — not found');
    console.log('[Classroom] roomId:', roomId);

    if (!appToken) {
      console.log('[Classroom] No token — redirecting to /login');
      router.push('/login');
      return;
    }

    try {
      const payload = JSON.parse(atob(appToken.split('.')[1]));
      setRole(payload.role?.toLowerCase() ?? null);
    } catch {
      setRole(null);
    }

    console.log('[Classroom] Sending POST /api/sessions/create');

    fetch(`${API_URL}/api/sessions/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appToken}`,
      },
      body: JSON.stringify({ roomName: roomId }),
    })
      .then(async (res) => {
        const json = await res.json();
        console.log('[Classroom] API response →', res.status, json);
        if (!res.ok) { setError(json.error || 'Could not join room'); return; }
        setToken(json.data.token);
      })
      .catch((err) => {
        console.error('[Classroom] Fetch failed:', err);
        setError('Could not connect to server');
      });
  }, [roomId, router]);

  function handleLeave() {
    const appToken = localStorage.getItem('token');
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

  if (error) {
    return (
      <div className="midad room" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: '#f87171', fontWeight: 600, marginBottom: 12 }}>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={handleLeave}>Go back</button>
        </div>
      </div>
    );
  }

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
      serverUrl={LIVEKIT_URL}
      token={token}
      connect
      video
      audio
      onDisconnected={handleLeave}
      style={{ height: '100vh' }}
    >
      <ClassroomContent roomId={roomId} isTeacher={role === 'teacher'} onLeave={handleLeave} />
    </LiveKitRoom>
  );
}
