/** Observe rendered frames, not just a connected track or a nonzero video size. */
export function monitorCamera(video: HTMLVideoElement, options: {
  shouldMonitor: () => boolean;
  restore: () => Promise<void>;
  onStalled: (stalled: boolean) => void;
  staleMs?: number;
  intervalMs?: number;
  cooldownMs?: number;
  stableMs?: number;
}) {
  const staleMs = options.staleMs ?? 12000;
  const cooldownMs = options.cooldownMs ?? 45000;
  let stopped = false, restoring = false, recoveryCount = 0;
  let lastFrame = performance.now(), lastRecovery = -Infinity, frameRequest = 0;
  let lastPosition = video.currentTime;
  let healthySince: number | null = performance.now();
  let stalled = false;
  const report = (value: boolean) => { if (stalled !== value) { stalled = value; options.onStalled(value); } };
  const supportsFrames = typeof video.requestVideoFrameCallback === 'function';
  function progress() {
    lastFrame = performance.now();
    healthySince ??= lastFrame;
    if (lastFrame - healthySince >= (options.stableMs ?? 60000)) recoveryCount = 0;
    report(false);
  }
  function frame() {
    if (stopped) return;
    progress();
    frameRequest = video.requestVideoFrameCallback(frame);
  }
  if (supportsFrames) frameRequest = video.requestVideoFrameCallback(frame);
  async function play() {
    if (stopped || document.hidden || !options.shouldMonitor()) return;
    try { if (video.paused) await video.play(); }
    catch { if (!stopped) report(true); }
  }
  const visibility = () => { lastFrame = performance.now(); if (!document.hidden) void play(); };
  const paused = () => { void play(); };
  document.addEventListener('visibilitychange', visibility);
  video.addEventListener('pause', paused);
  video.addEventListener('canplay', paused);
  window.addEventListener('pageshow', visibility);
  const timer = window.setInterval(async () => {
    if (stopped || restoring) return;
    const bounds = video.getBoundingClientRect();
    if (document.hidden || !options.shouldMonitor() || bounds.width === 0 || bounds.height === 0 || bounds.bottom <= 0 || bounds.top >= innerHeight || bounds.right <= 0 || bounds.left >= innerWidth) {
      lastFrame = performance.now(); return;
    }
    if (!supportsFrames && video.currentTime !== lastPosition) { lastPosition = video.currentTime; progress(); }
    if (performance.now() - lastFrame < staleMs) return;
    healthySince = null;
    report(true);
    // Never continually restart a camera on a stalled connection.
    if (recoveryCount >= 2 || performance.now() - lastRecovery < cooldownMs) return;
    recoveryCount++; lastRecovery = performance.now(); restoring = true;
    try { await options.restore(); if (!stopped) { lastFrame = performance.now(); await play(); } }
    catch { /* Keep the explicit recovery action visible. */ }
    finally { restoring = false; }
  }, options.intervalMs ?? 2000);
  return () => {
    stopped = true; window.clearInterval(timer);
    if (supportsFrames) video.cancelVideoFrameCallback(frameRequest);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pageshow', visibility);
    video.removeEventListener('pause', paused); video.removeEventListener('canplay', paused);
  };
}
