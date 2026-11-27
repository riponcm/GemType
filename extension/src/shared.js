// Helpers shared by the popup and the settings dashboard.

'use strict';

if (typeof browser !== 'undefined') globalThis.chrome = browser;

const GTShared = {
  TIMED_MS: 15 * 60 * 1000,

  // Same local-date key the background uses for daily stats.
  dayKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  // The mode actually in force: 'timed' becomes 'demand' once its time is up.
  effectiveMode(s) {
    if (s.checkMode === 'timed') return Date.now() < (s.autoUntil || 0) ? 'timed' : 'demand';
    return s.checkMode === 'auto' ? 'auto' : 'demand';
  },

  minutesLeft(s) {
    return Math.max(1, Math.ceil(((s.autoUntil || 0) - Date.now()) / 60000));
  },

  // Picking a mode; 'timed' starts a fresh 15 minutes.
  modePatch(mode) {
    return mode === 'timed'
      ? { checkMode: 'timed', autoUntil: Date.now() + GTShared.TIMED_MS }
      : { checkMode: mode, autoUntil: 0 };
  },

  modeLabel(s) {
    const m = GTShared.effectiveMode(s);
    if (m === 'timed') return `Auto · ${GTShared.minutesLeft(s)} min left`;
    return m === 'auto' ? 'Auto' : 'On demand';
  },

  modeHint(s) {
    const m = GTShared.effectiveMode(s);
    if (m === 'auto') return 'Checks as you type, after each sentence. Burns your free Gemini quota fast.';
    if (m === 'timed') return `Checks as you type for ${GTShared.minutesLeft(s)} more min (burns quota fast), then goes back to on demand.`;
    return 'Checks only when you click the badge or press the shortcut. Uses the least quota.';
  },

  num(n) {
    return Number(n || 0).toLocaleString();
  },

  // Human status of the last limit Google reported, or null when all is fine.
  limitStatus(stats) {
    const l = stats?.limit;
    if (!l || !l.resetAt || Date.now() >= l.resetAt) return null;
    const mins = Math.ceil((l.resetAt - Date.now()) / 60000);
    if (l.kind === 'day') {
      const h = Math.floor(mins / 60);
      const left = h ? `${h} h ${mins % 60} min` : `${mins} min`;
      return { kind: 'day', model: l.model, resetAt: l.resetAt, text: `Daily limit reached · resets in ${left}` };
    }
    return { kind: 'minute', model: l.model, resetAt: l.resetAt, text: 'Busy · retrying in a moment' };
  },

  // Where this copy came from, for "Rate GemType". null in Safari: its App
  // Store page has no review link to send people to from here.
  store() {
    const ua = navigator.userAgent;
    if (GTShared.isSafari()) return null;
    if (ua.includes('Firefox')) {
      return { name: 'Firefox Add-ons', review: 'https://addons.mozilla.org/firefox/addon/gemtype-ai-writing-assistant/reviews/' };
    }
    if (ua.includes('Edg/')) {
      return { name: 'Edge Add-ons', review: 'https://microsoftedge.microsoft.com/addons/detail/edbehlnmfcjhlbdlnmklicdoaopobbel' };
    }
    return { name: 'Chrome Web Store', review: 'https://chromewebstore.google.com/detail/linnnamnhkciekgpnegkcajcafmjlhgh/reviews' };
  },

  isSafari() {
    const ua = navigator.userAgent;
    return /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|Firefox/.test(ua);
  },

  SHARE_URL: 'https://gemtype.matily.org',

  shareText(fixes) {
    const n = Number(fixes || 0);
    const brag = n >= 10 ? ` It has fixed ${n.toLocaleString('en-US')} of my mistakes so far.` : '';
    return `I use GemType, a free, open-source Grammarly alternative that runs on my own Gemini key.${brag} Works in Chrome, Edge, Firefox, Word, on the desktop, Android and iPhone.`;
  },

  shareLinks(fixes) {
    const url = encodeURIComponent(GTShared.SHARE_URL);
    const text = encodeURIComponent(GTShared.shareText(fixes));
    return {
      x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      email: `mailto:?subject=${encodeURIComponent('A free Grammarly alternative')}&body=${text}%0A%0A${url}`,
    };
  },

  // Ask for a rating only after GemType has proved useful (30+ fixes, 3+ days),
  // never more than twice, and never again after a click.
  shouldAskRating(meta, stats) {
    if (!GTShared.store()) return false;
    const r = meta?.rate || {};
    if (r.done || (r.snoozes || 0) >= 2) return false;
    if (r.until && Date.now() < r.until) return false;
    const days = (Date.now() - (meta?.installedAt || Date.now())) / 86400000;
    return (stats?.total?.fixes || 0) >= 30 && days >= 3;
  },

  async updateRate(patch) {
    const { meta } = await chrome.storage.local.get('meta');
    const next = { ...(meta || {}), rate: { ...(meta?.rate || {}), ...patch } };
    await chrome.storage.local.set({ meta: next });
    return next;
  },

  async load() {
    const { settings, stats, meta } = await chrome.storage.local.get(['settings', 'stats', 'meta']);
    return {
      meta: meta || {},
      settings: { enabled: true, apiKey: '', disabledSites: [], checkMode: 'demand', ...(settings || {}) },
      stats: stats || { days: {}, total: {}, limit: null },
    };
  },

  async patchSettings(patch) {
    const { settings } = await chrome.storage.local.get('settings');
    const next = { ...(settings || {}), ...patch };
    await chrome.storage.local.set({ settings: next });
    return next;
  },
};
