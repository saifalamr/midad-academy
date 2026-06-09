'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  useTracks,
  ParticipantTile,
  useLocalParticipant,
  RoomAudioRenderer,
  DisconnectButton,
} from '@livekit/components-react';
import '@livekit/components-styles';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';
import Whiteboard from '@/components/Whiteboard';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL!;

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  return fetch(`http://localhost:4000${path}`, {
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

// ── Inner classroom UI (inside LiveKitRoom context) ──────────────────────────

function ClassroomContent({ roomId, isTeacher, onLeave }: { roomId: string; isTeacher: boolean; onLeave: () => void }) {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  const teacherTrack = cameraTracks.find((t) => getRole(t) === 'teacher');
  const studentTracks = cameraTracks.filter((t) => getRole(t) !== 'teacher');

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  const participantCount = cameraTracks.length;

  return (
    <div className="midad room">
      <RoomAudioRenderer />

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
          <button className="rt-leave btn btn-sm" onClick={onLeave}>Leave</button>
        </div>
      </header>

      {/* ── Video strip ── */}
      <div className="video-strip">
        {/* Teacher tile — wider, gold border */}
        <div className="vtile vteacher">
          {teacherTrack ? (
            <ParticipantTile trackRef={teacherTrack} style={{ width: '100%', height: '100%' }} />
          ) : (
            <div className="vph">
              <span>Waiting for teacher…</span>
            </div>
          )}
          <div className="vlabel">
            <span className="vmic on"></span>
            Teacher
            <span className="vhost">Host</span>
          </div>
        </div>

        {/* Student tiles */}
        {studentTracks.slice(0, 4).map((track) => (
          <div key={track.participant.identity} className="vtile">
            <ParticipantTile trackRef={track} style={{ width: '100%', height: '100%' }} />
            <div className="vlabel">
              <span className="vmic on"></span>
              {track.participant.name ?? track.participant.identity}
            </div>
          </div>
        ))}

        {studentTracks.length > 4 && (
          <div className="vtile vmore"><span>+{studentTracks.length - 4}</span></div>
        )}
      </div>

      {/* ── Whiteboard area ── */}
      <div className="board-wrap">
        <div className="board-stage">
          <div className="board-paper">
            <Whiteboard roomId={roomId} canDraw={isTeacher} />
            <div className="board-guide ar">اِكتُب الحروف هنا ✍️</div>
          </div>
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

        <button className="rc-btn">
          <span className="rci">✋</span>
          <span>Raise hand</span>
        </button>

        <button className="rc-btn">
          <span className="rci">😊</span>
          <span>React</span>
        </button>

        <DisconnectButton
          onClick={onLeave}
          className="rc-btn rc-leave"
        >
          <span className="rci">📞</span>
          <span>Leave</span>
        </DisconnectButton>
      </div>
    </div>
  );
}

// ── Page shell — fetches token then mounts the room ──────────────────────────

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

    // Decode the role straight from our own JWT — relying on the LiveKit
    // participant's `metadata` here would race against the room connection
    // (it's not guaranteed to be populated on first render).
    try {
      const payload = JSON.parse(atob(appToken.split('.')[1]));
      setRole(payload.role?.toLowerCase() ?? null);
    } catch {
      setRole(null);
    }

    console.log('[Classroom] Sending POST /api/sessions/create');

    fetch('http://localhost:4000/api/sessions/create', {
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
