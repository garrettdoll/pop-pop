// localStorage that never throws (private windows, blocked site data, previews).
export const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { /* nothing to do */ }
  },
  getJSON(key, fallback = null) {
    const raw = storage.get(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  },
  setJSON(key, value) {
    return storage.set(key, JSON.stringify(value));
  },
};
