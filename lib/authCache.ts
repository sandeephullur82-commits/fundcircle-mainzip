const PREFIX = "fc_auth_";
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

export function setCached(key: string, value: unknown, ttl = DEFAULT_TTL) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, exp: Date.now() + ttl }));
  } catch {}
}

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() > parsed.exp) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.v as T;
  } catch {
    return null;
  }
}

export function clearCached(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

export function clearAllAuthCache() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}
