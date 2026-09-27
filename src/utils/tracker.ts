import { getOrCreateDeviceId } from './fingerprint.ts';

let currentSessionId: string | null = null;
let heartbeatInterval: any = null;
let lastHeartbeatTime = Date.now();

export async function initVisitorTracking(): Promise<string> {
  const deviceId = getOrCreateDeviceId();

  try {
    const res = await fetch('/api/tracking/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        userAgent: navigator.userAgent,
        pagePath: window.location.pathname
      })
    });
    const data = await res.json();
    if (data.success && data.sessionId) {
      currentSessionId = data.sessionId;
    }
  } catch (err) {
    console.error('Silent tracking visit failed:', err);
  }

  startHeartbeat(deviceId);
  setupUnloadTracking(deviceId);

  return deviceId;
}

function startHeartbeat(deviceId: string) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  lastHeartbeatTime = Date.now();

  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    const deltaSeconds = Math.round((now - lastHeartbeatTime) / 1000);
    lastHeartbeatTime = now;

    if (deltaSeconds > 0 && document.visibilityState === 'visible') {
      sendHeartbeatBeacon(deviceId, deltaSeconds);
    }
  }, 15000);
}

function sendHeartbeatBeacon(deviceId: string, deltaSeconds: number) {
  const payload = JSON.stringify({
    deviceId,
    sessionId: currentSessionId,
    durationDelta: deltaSeconds
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/tracking/heartbeat', blob);
  } else {
    fetch('/api/tracking/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(() => {});
  }
}

function setupUnloadTracking(deviceId: string) {
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      const now = Date.now();
      const delta = Math.round((now - lastHeartbeatTime) / 1000);
      lastHeartbeatTime = now;
      if (delta > 0) {
        sendHeartbeatBeacon(deviceId, delta);
      }
    } else {
      lastHeartbeatTime = Date.now();
    }
  };

  const onBeforeUnload = () => {
    const now = Date.now();
    const delta = Math.round((now - lastHeartbeatTime) / 1000);
    if (delta > 0) {
      sendHeartbeatBeacon(deviceId, delta);
    }
  };

  window.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', onBeforeUnload);
}
