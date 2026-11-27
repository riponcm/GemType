'use strict';

const $ = (id) => document.getElementById(id);

let settings = null;
let stats = null;
let meta = {};
let hostname = null;
let tabId = null;

function render() {
  const active = settings.enabled && !(hostname && settings.disabledSites.includes(hostname));
  const mode = GTShared.effectiveMode(settings);

  $('enabled').checked = settings.enabled;
  $('site').disabled = !hostname || !settings.enabled;
  if (hostname) $('site').checked = !settings.disabledSites.includes(hostname);
  $('noKey').style.display = settings.apiKey ? 'none' : 'block';
  const modeTip = settings.showModeTip && settings.checkMode === 'auto';
  $('tip').style.display = modeTip ? 'block' : 'none';
  const askRate = !modeTip && GTShared.shouldAskRating(meta, stats);
  $('rate').style.display = askRate ? 'block' : 'none';
  if (askRate) {
    $('rateText').textContent = `It has fixed ${GTShared.num(stats.total.fixes)} mistakes for you.`;
  }

  const pill = $('pill');
  pill.textContent = !settings.enabled ? 'Off' : !active ? 'Paused here' : GTShared.modeLabel(settings);
  pill.classList.toggle('off', !active);

  $('body').classList.toggle('dim', !active);
  for (const b of document.querySelectorAll('.seg button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
  $('modeHint').textContent = GTShared.modeHint(settings);

  const today = stats.days[GTShared.dayKey()] || {};
  $('sWords').textContent = GTShared.num(today.words);
  $('sFixes').textContent = GTShared.num(today.fixes);
  $('sReq').textContent = GTShared.num(today.requests);
  const limit = GTShared.limitStatus(stats);
  $('limitDot').classList.toggle('warnd', !!limit);
  $('limitText').textContent = limit ? limit.text : `Gemini limits OK · ${settings.model || 'gemini-3.5-flash-lite'}`;
}

async function load() {
  ({ settings, stats, meta } = await GTShared.load());

  // Ask the content script (top frame) for the hostname instead of reading
  // tab.url — this avoids needing the "activeTab" permission entirely.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  hostname = null;
  if (tabId != null) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'GET_HOSTNAME' }, { frameId: 0 });
      hostname = res?.hostname || null;
    } catch {
      hostname = null; // no content script here (chrome://, web store, PDF…)
    }
  }
  $('host').textContent = hostname || 'unavailable on this page';
  render();
}

async function patch(p) {
  settings = await GTShared.patchSettings(p);
  render();
}

$('enabled').addEventListener('change', (e) => patch({ enabled: e.target.checked }));

$('site').addEventListener('change', (e) => {
  if (!hostname) return;
  const list = new Set(settings.disabledSites);
  if (e.target.checked) list.delete(hostname);
  else list.add(hostname);
  patch({ disabledSites: [...list] });
});

for (const b of document.querySelectorAll('.seg button')) {
  b.addEventListener('click', () => patch({ ...GTShared.modePatch(b.dataset.mode), showModeTip: false }));
}

$('rateYes').addEventListener('click', async () => {
  meta = await GTShared.updateRate({ done: true });
  chrome.tabs.create({ url: GTShared.store().review });
});
$('rateShare').addEventListener('click', async () => {
  meta = await GTShared.updateRate({ until: Date.now() + 60 * 86400000 });
  chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html#share') });
});
$('rateLater').addEventListener('click', async () => {
  const snoozes = (meta.rate?.snoozes || 0) + 1;
  meta = await GTShared.updateRate({ snoozes, until: Date.now() + 30 * 86400000 });
  render();
});

$('tipYes').addEventListener('click', () => patch({ ...GTShared.modePatch('demand'), showModeTip: false }));
$('tipNo').addEventListener('click', () => patch({ showModeTip: false }));

$('checkNow').addEventListener('click', async () => {
  let res = null;
  if (tabId != null) {
    try {
      res = await chrome.tabs.sendMessage(tabId, { type: 'CHECK_NOW', fromPopup: true });
    } catch {
      res = null;
    }
  }
  if (res?.checking) {
    window.close(); // hand focus back to the page so the results show
  } else {
    $('checkHint').textContent = 'Click into a text box on the page first, then try again.';
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !settings) return;
  if (changes.settings) settings = { ...settings, ...(changes.settings.newValue || {}) };
  if (changes.stats) stats = changes.stats.newValue || stats;
  if (changes.meta) meta = changes.meta.newValue || meta;
  render();
});

$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('setKey').addEventListener('click', () => chrome.runtime.openOptionsPage());

load();
