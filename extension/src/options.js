'use strict';

const KNOWN_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const DEFAULT_MODEL = KNOWN_MODELS[0];
const REWRITE_NAMES = {
  fix: 'Fix', improve: 'Improve', shorten: 'Shorten', formal: 'Formal', casual: 'Casual',
  my: 'My style', english: 'English',
};
const IS_FIREFOX = navigator.userAgent.includes('Firefox');

const $ = (id) => document.getElementById(id);

let settings = null;
let stats = null;
let range = 'today';

// ---------------------------------------------------------------------------
// Dashboard

function sumBuckets(keys) {
  const out = { requests: 0, tokens: 0, ms: 0, words: 0, fixes: 0, rewrites: 0, rw: {} };
  for (const k of keys) {
    const d = stats.days[k];
    if (!d) continue;
    for (const f of ['requests', 'tokens', 'ms', 'words', 'fixes', 'rewrites']) out[f] += d[f] || 0;
    for (const [a, n] of Object.entries(d.rw || {})) out.rw[a] = (out.rw[a] || 0) + n;
  }
  return out;
}

function lastDays(n) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push({ key: GTShared.dayKey(d), date: d });
  }
  return keys;
}

function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function renderStats() {
  const week = lastDays(7);
  const bucket =
    range === 'all'
      ? { ...{ words: 0, fixes: 0, rewrites: 0, rw: {} }, ...stats.total }
      : sumBuckets(range === 'week' ? week.map((d) => d.key) : [GTShared.dayKey()]);
  $('tWords').textContent = GTShared.num(bucket.words);
  $('tFixes').textContent = GTShared.num(bucket.fixes);
  $('tRewrites').textContent = GTShared.num(bucket.rewrites);
  const top = Object.entries(bucket.rw || {}).sort((a, b) => b[1] - a[1])[0];
  $('tTop').textContent = top ? REWRITE_NAMES[top[0]] || top[0] : '—';
  for (const b of document.querySelectorAll('.seg button')) {
    b.setAttribute('aria-pressed', String(b.dataset.range === range));
  }

  // 7-day chart, built as DOM (never innerHTML).
  const vals = week.map((d) => stats.days[d.key]?.words || 0);
  const max = Math.max(1, ...vals);
  const chart = $('chart');
  const days = $('days');
  chart.textContent = '';
  days.textContent = '';
  week.forEach((d, i) => {
    const bar = document.createElement('div');
    bar.className = i === 6 ? 'bar today' : 'bar';
    const label = document.createElement('span');
    label.textContent = GTShared.num(vals[i]);
    const fill = document.createElement('i');
    fill.style.height = `${Math.round((vals[i] / max) * 130)}px`;
    bar.append(label, fill);
    chart.append(bar);
    const day = document.createElement('span');
    day.textContent = i === 6 ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'short' });
    days.append(day);
  });
  chart.setAttribute(
    'aria-label',
    `Words checked per day for the last 7 days: ${vals.map((v) => GTShared.num(v)).join(', ')}`
  );

  // Gemini usage today.
  const today = stats.days[GTShared.dayKey()] || {};
  $('uReq').textContent = GTShared.num(today.requests);
  $('uTok').textContent = compact(today.tokens || 0);
  $('uMs').textContent = today.requests ? `${(today.ms / today.requests / 1000).toFixed(1)} s` : '—';
  const limit = GTShared.limitStatus(stats);
  const daily = limit?.kind === 'day';
  const minute = limit?.kind === 'minute';
  $('uMinute').textContent = minute ? 'Busy' : 'OK';
  $('uMinute').classList.toggle('warn', minute);
  $('uDay').textContent = daily ? 'Reached' : 'Not reached';
  $('uDay').classList.toggle('warn', daily);

  $('limitBanner').style.display = daily ? 'flex' : 'none';
  if (daily) {
    $('limitMsg').textContent =
      `Google says this key has used today's requests for ${limit.model}. ` +
      `It resets at midnight Pacific time (${limit.text.replace('Daily limit reached · ', '')}).`;
  }
  $('keyDot').className = !settings.apiKey ? 'dot bad' : daily ? 'dot warn' : 'dot';
  $('keyLabel').textContent = !settings.apiKey
    ? 'No Gemini key yet'
    : daily ? 'Key paused until reset' : 'Gemini key connected';
  $('keyModel').textContent = settings.model || DEFAULT_MODEL;
}

function renderMode() {
  const mode = GTShared.effectiveMode(settings);
  for (const b of document.querySelectorAll('.mode')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
  $('timedDesc').textContent =
    mode === 'timed'
      ? `On now: ${GTShared.minutesLeft(settings)} min left, then back to on demand.`
      : 'Checks as you type for 15 minutes, then goes back to on demand.';
}

async function renderShortcut() {
  let shortcut = '';
  try {
    const cmds = await chrome.commands.getAll();
    shortcut = cmds.find((c) => c.name === 'check-now')?.shortcut || '';
  } catch {
    /* commands API unavailable */
  }
  const keys = $('keys');
  keys.textContent = '';
  if (!shortcut) {
    keys.textContent = 'no shortcut set';
    return;
  }
  // Chrome on Mac reports "⇧⌘Space"; elsewhere "Ctrl+Shift+Space".
  const parts = shortcut.includes('+') ? shortcut.split('+') : shortcut.match(/Space|[^\s]/g);
  for (const p of parts) {
    const k = document.createElement('kbd');
    k.textContent = p;
    keys.append(k, ' ');
  }
}

function renderShare() {
  const fixes = stats.total?.fixes || 0;
  const links = GTShared.shareLinks(fixes);
  $('shX').href = links.x;
  $('shLinkedin').href = links.linkedin;
  $('shFacebook').href = links.facebook;
  $('shWhatsapp').href = links.whatsapp;
  $('shEmail').href = links.email;
  $('shareStat').textContent = fixes ? `${GTShared.num(fixes)} mistakes fixed so far` : '';
  const store = GTShared.store();
  $('rateLink').href = store ? store.review : 'https://github.com/riponcm/GemType';
  $('rateLabel').textContent = store ? `Rate GemType on ${store.name}` : 'Star GemType on GitHub';
}

// ---------------------------------------------------------------------------
// Settings form

function fillForm() {
  $('apiKey').value = settings.apiKey || '';
  const model = settings.model || DEFAULT_MODEL;
  if (KNOWN_MODELS.includes(model)) {
    $('model').value = model;
    $('customModel').style.display = 'none';
  } else {
    $('model').value = '__custom__';
    $('customModel').style.display = 'block';
    $('customModel').value = model;
  }
  $('language').value = settings.language || 'auto';
  $('disabledSites').value = (settings.disabledSites || []).join('\n');

  const r = settings.rules || {};
  $('rIgnoreCase').checked = !!r.ignoreCase;
  $('rIgnorePunct').checked = !!r.ignorePunctuation;
  $('rInformal').checked = !!r.informal;
  $('rSpelling').value = r.spelling || 'auto';
  $('rCustom').value = r.custom || '';
  $('rStyle').value = r.myStyle || '';
  $('rEnglish').value = r.englishVariant || 'us';
}

function collect() {
  const model =
    $('model').value === '__custom__'
      ? $('customModel').value.trim() || DEFAULT_MODEL
      : $('model').value;
  return {
    apiKey: $('apiKey').value.trim(),
    model,
    language: $('language').value,
    disabledSites: $('disabledSites')
      .value.split('\n')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

function collectRules() {
  return {
    ignoreCase: $('rIgnoreCase').checked,
    ignorePunctuation: $('rIgnorePunct').checked,
    informal: $('rInformal').checked,
    spelling: $('rSpelling').value,
    custom: $('rCustom').value.slice(0, 2000),
    myStyle: $('rStyle').value.slice(0, 2000),
    englishVariant: $('rEnglish').value,
  };
}

async function save() {
  settings = await GTShared.patchSettings({ enabled: settings.enabled ?? true, ...collect() });
  renderStats();
  return settings;
}

function setStatus(text, ok) {
  const el = $('status');
  el.textContent = text;
  el.className = ok ? 'ok' : 'err';
}

// ---------------------------------------------------------------------------
// Events

for (const b of document.querySelectorAll('.mode')) {
  b.addEventListener('click', async () => {
    settings = await GTShared.patchSettings({ ...GTShared.modePatch(b.dataset.mode), showModeTip: false });
    renderMode();
  });
}

for (const b of document.querySelectorAll('.seg button')) {
  b.addEventListener('click', () => {
    range = b.dataset.range;
    renderStats();
  });
}

// Rules save as you change them.
let rulesTimer = null;
async function saveRules() {
  settings = await GTShared.patchSettings({ rules: collectRules() });
}
for (const id of ['rIgnoreCase', 'rIgnorePunct', 'rInformal', 'rSpelling', 'rEnglish']) {
  $(id).addEventListener('change', saveRules);
}
for (const id of ['rCustom', 'rStyle']) {
  $(id).addEventListener('input', () => {
    clearTimeout(rulesTimer);
    rulesTimer = setTimeout(saveRules, 600);
  });
}

$('changeShortcut').addEventListener('click', (e) => {
  e.preventDefault();
  if (IS_FIREFOX) {
    $('changeShortcut').textContent = 'Firefox: Add-ons → ⚙ → Manage Extension Shortcuts';
  } else {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  }
});

$('shCopy').addEventListener('click', () => {
  navigator.clipboard.writeText(`${GTShared.shareText(stats.total?.fixes)} ${GTShared.SHARE_URL}`).then(() => {
    $('shCopyLabel').textContent = 'Copied ✓';
    setTimeout(() => ($('shCopyLabel').textContent = 'Copy link'), 2000);
  });
});
$('rateLink').addEventListener('click', () => GTShared.updateRate({ done: true }));

$('resetStats').addEventListener('click', async () => {
  if (!confirm('Reset all GemType stats in this browser? This cannot be undone.')) return;
  stats = { days: {}, total: {}, limit: stats.limit };
  await chrome.storage.local.set({ stats });
  renderStats();
});

$('toggleKey').addEventListener('click', () => {
  const input = $('apiKey');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  $('toggleKey').textContent = showing ? 'Show' : 'Hide';
});

$('model').addEventListener('change', () => {
  $('customModel').style.display = $('model').value === '__custom__' ? 'block' : 'none';
});

$('save').addEventListener('click', async () => {
  await save();
  setStatus('Saved ✓', true);
  setTimeout(() => setStatus('', true), 2500);
});

$('test').addEventListener('click', async () => {
  const s = await save();
  if (!s.apiKey) {
    setStatus('Enter an API key first', false);
    return;
  }
  setStatus('Testing…', true);
  const res = await chrome.runtime.sendMessage({
    type: 'CHECK_TEXT',
    text: 'She dont like going their on the weekends because it are far.',
  });
  if (res?.ok) {
    setStatus(`Key works ✓ (${res.result.corrections.length} test corrections returned)`, true);
  } else {
    setStatus(`Failed: ${res?.error || 'no response'}`, false);
  }
});

// Highlight the nav item of the section in view.
const navLinks = [...document.querySelectorAll('nav a')];
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of navLinks) a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`);
    }
  },
  { rootMargin: '-10% 0px -70% 0px' }
);
for (const a of navLinks) {
  const target = document.querySelector(a.getAttribute('href'));
  if (target) observer.observe(target);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !settings) return;
  if (changes.stats) {
    stats = changes.stats.newValue || stats;
    renderStats();
  }
  if (changes.settings) {
    settings = { ...settings, ...(changes.settings.newValue || {}) };
    renderMode();
  }
});

// ---------------------------------------------------------------------------

async function load() {
  ({ settings, stats } = await GTShared.load());
  stats.total = stats.total || {};
  const v = chrome.runtime.getManifest().version;
  $('ver').textContent = `v${v}`;
  $('ver2').textContent = `v${v}`;
  fillForm();
  renderMode();
  renderStats();
  renderShare();
  renderShortcut();
}

load();
setInterval(renderMode, 30000); // keep the 15-minute countdown fresh
