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

// ── Inner classroom UI (rendered inside LiveKitRoom context) ─────────────────

function ClassroomContent({ onLeave }: { onLeave: () => void }) {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  const teacherTrack = cameraTracks.find((t) => getRole(t) === 'teacher');
  const studentTracks = cameraTracks.filter((t) => getRole(t) !== 'teacher');

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  const studentGridCols =
    studentTracks.length === 1 ? 'grid-cols-1' :
    studentTracks.length === 2 ? 'grid-cols-2' :
    studentTracks.length <= 4 ? 'grid-cols-2' :
    'grid-cols-4';

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white select-none">
      <RoomAudioRenderer />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <span className="text-sm font-semibold text-gray-300">🌙 Arabic Live Class</span>
        <span className="text-xs text-gray-500">{cameraTracks.length} participant{cameraTracks.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden min-h-0">

        {/* Teacher feed — large */}
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-gray-800 min-h-0">
          {teacherTrack ? (
            <ParticipantTile
              trackRef={teacherTrack}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-500">
              <span className="text-4xl">👨‍🏫</span>
              <span className="text-sm">Waiting for teacher to join…</span>
            </div>
          )}
        </div>

        {/* Student feeds — small strip */}
        {studentTracks.length > 0 && (
          <div className={`grid ${studentGridCols} gap-2 h-36 shrink-0`}>
            {studentTracks.map((track) => (
              <div
                key={track.participant.identity}
                className="relative rounded-xl overflow-hidden bg-gray-800"
              >
                <ParticipantTile
                  trackRef={track}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-3 py-4 px-6 border-t border-gray-800 bg-gray-900 shrink-0">
        <button
          onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors ${
            isMicrophoneEnabled
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isMicrophoneEnabled ? '🎤 Mute' : '🔇 Unmute'}
        </button>

        <button
          onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors ${
            isCameraEnabled
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isCameraEnabled ? '📷 Stop Video' : '📷 Start Video'}
        </button>

        <DisconnectButton
          onClick={onLeave}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors"
        >
          Leave Class
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

  // Redirect back to the role dashboard after leaving
  function handleLeave() {
    const appToken = localStorage.getItem('token');
    if (appToken) {
      try {
        const payload = JSON.parse(atob(appToken.split('.')[1]));
        const role = payload.role?.toLowerCase();
        if (role === 'teacher') { router.push('/teacher'); return; }
        if (role === 'parent')  { router.push('/parent');  return; }
        if (role === 'student') { router.push('/student'); return; }
      } catch { /* fall through */ }
    }
    router.push('/login');
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">{error}</p>
          <button onClick={handleLeave} className="text-sm text-gray-400 hover:text-white underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Joining classroom…</p>
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
      <ClassroomContent onLeave={handleLeave} />
    </LiveKitRoom>
  );
}
