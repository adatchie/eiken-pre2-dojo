// storage.js — localStorage wrapper with namespacing
const Store = (() => {
  const PREFIX = "dojo2_";

  function key(k) { return PREFIX + k; }

  function get(k, fallback = null) {
    try {
      const raw = localStorage.getItem(key(k));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Store.get failed:", k, e);
      return fallback;
    }
  }

  function set(k, v) {
    try {
      localStorage.setItem(key(k), JSON.stringify(v));
      return true;
    } catch (e) {
      console.error("Store.set failed:", k, e);
      return false;
    }
  }

  function remove(k) {
    try { localStorage.removeItem(key(k)); } catch (e) {}
  }

  function clearAll() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }

  return { get, set, remove, clearAll };
})();
