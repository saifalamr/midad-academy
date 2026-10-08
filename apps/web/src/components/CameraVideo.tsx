'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoTrack, isTrackReference, useRoomContext, useConnectionState, type TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { LocalVideoTrack, RemoteTrackPublication, Track, ConnectionQuality, ConnectionState } from 'livekit-client';
import { monitorCamera } from '@/lib/camera-recovery';
import Icon from './Icon';

/** Keep one inline video element attached through board and room-state updates. */
export default function CameraVideo({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
  const room = useRoomContext();
  const connectionState = useConnectionState(room);
  const video = useRef<HTMLVideoElement>(null);
  const current = useRef(trackRef); current.current = trackRef;
  const [stalled, setStalled] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const alive = useRef(true);
  const recoveryInFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const recover = useCallback(async () => {
    const ref = current.current; const track = ref.publication?.track;
    if (recoveryInFlight.current || room.state !== ConnectionState.Connected || !track || track.isMuted || !video.current || document.hidden) return;
    recoveryInFlight.current = true;
    const element = video.current;
    setRecovering(true);
    try {
      if (track instanceof LocalVideoTrack) {
        // The SDK keeps the same published track, replacing its capture source.
        // Do not leave/rejoin the room or touch the microphone.
        await track.restartTrack();
      }
      if (!alive.current || room.state !== ConnectionState.Connected || current.current.publication?.track !== track || track.isMuted || document.hidden || video.current !== element) return;
      track.detach(element); track.attach(element);
      await element.play();
    } finally { recoveryInFlight.current = false; if (alive.current) setRecovering(false); }
  }, [room]);
  useEffect(() => {
    const element = video.current;
    if (!element || !trackRef.publication) return;
    return monitorCamera(element, {
      shouldMonitor: () => {
        const ref = current.current; const track = ref.publication?.track;
        return room.state === ConnectionState.Connected && !!track && !track.isMuted && track.streamState !== Track.StreamState.Paused &&
          (ref.participant.isLocal || (ref.publication instanceof RemoteTrackPublication && ref.publication.isSubscribed && ref.participant.connectionQuality !== ConnectionQuality.Lost));
      },
      restore: recover,
      onStalled: value => { if (alive.current) setStalled(value); },
    });
  }, [trackRef.participant.identity, trackRef.publication, recover, room]);
  const track = trackRef.publication?.track;
  return <div className="camera-video" data-local={trackRef.participant.isLocal}>
    {isTrackReference(trackRef) ? <VideoTrack ref={video} trackRef={trackRef} autoPlay playsInline muted /> : <div className="camera-placeholder"><Icon name="video" size={28} /><span>الكاميرا مغلقة</span></div>}
    {track?.isMuted && <div className="camera-placeholder"><Icon name="video" size={28} /><span>الكاميرا مغلقة</span></div>}
    {stalled && !track?.isMuted && <button className="camera-restore" onClick={() => void recover().catch(() => { if (alive.current) setStalled(true); })} disabled={recovering || connectionState !== ConnectionState.Connected}><Icon name="redo" size={15} />{connectionState !== ConnectionState.Connected ? 'ننتظر عودة الاتصال…' : recovering ? 'نستعيد الفيديو…' : 'استعادة الفيديو'}</button>}
  </div>;
}
