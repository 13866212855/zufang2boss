/**
 * Device Fingerprinting & Persistence Utility
 * Generates and stores a unique persistent visitor device fingerprint
 * using localStorage with document.cookie fallback and browser canvas/screen attributes.
 */

const STORAGE_KEY = 'tenant_device_fingerprint_v1';
const COOKIE_KEY = 'tenant_device_id';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

function setCookie(name: string, value: string, days = 3650): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function generateCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'nocanvas';

    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial', sans-serif";
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('RentHouse_FP_2026', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('RentHouse_FP_2026', 4, 17);

    const dataUrl = canvas.toDataURL();
    let hash = 0;
    for (let i = 0; i < dataUrl.length; i++) {
      hash = (hash << 5) - hash + dataUrl.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  } catch {
    return 'cf_fallback';
  }
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_render_id';

  // 1. Check localStorage
  let deviceId = localStorage.getItem(STORAGE_KEY);

  // 2. Check Cookie fallback
  if (!deviceId) {
    deviceId = getCookie(COOKIE_KEY);
  }

  // 3. Generate if not present
  if (!deviceId || deviceId.length < 8) {
    const canvasHash = generateCanvasFingerprint();
    const screenInfo = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}`;
    const lang = navigator.language || 'zh';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now().toString(36);

    // Assemble deterministic + unique seed
    deviceId = `dev_${canvasHash.slice(0, 6)}_${screenInfo.replace(/[^0-9x]/g, '')}_${timestamp}_${randomSuffix}`;

    try {
      localStorage.setItem(STORAGE_KEY, deviceId);
    } catch {
      // Ignore localStorage quotas
    }
    setCookie(COOKIE_KEY, deviceId);
  } else {
    // Ensure both storages are synchronized
    try {
      localStorage.setItem(STORAGE_KEY, deviceId);
    } catch {}
    setCookie(COOKIE_KEY, deviceId);
  }

  return deviceId;
}
