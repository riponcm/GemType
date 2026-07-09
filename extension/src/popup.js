'use strict';

if (typeof browser !== 'undefined') globalThis.chrome = browser;

const $ = (id) => document.getElementById(id);

let settings = null;
let hostname = null;

async function load() {
  const stored = await chrome.storage.local.get('settings');
  settings = {
    enabled: true,
    apiKey: '',
    disabledSites: [],
    ...(stored.settings || {}),
  };

  // Ask the content script (top frame) for the hostname instead of reading
  // tab.url — this avoids needing the "activeTab" permission entirely.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  hostname = null;
  if (tab?.id != null) {
    try {
      const res = await chrome.tabs.sendMessage(
        tab.id,
        { type: 'GET_HOSTNAME' },
        { frameId: 0 }
      );
      hostname = res?.hostname || null;
    } catch {
      hostname = null; // no content script here (chrome://, web store, PDF…)
    }
  }

  $('enabled').checked = settings.enabled;
  $('noKey').style.display = settings.apiKey ? 'none' : 'block';

  if (hostname) {
    $('host').textContent = hostname;
    $('site').checked = !settings.disabledSites.includes(hostname);
  } else {
    $('host').textContent = 'unavailable on this page';
    $('site').disabled = true;
  }
}

async function persist() {
  await chrome.storage.local.set({ settings });
}

$('enabled').addEventListener('change', async (e) => {
  settings.enabled = e.target.checked;
  await persist();
});

$('site').addEventListener('change', async (e) => {
  if (!hostname) return;
  const list = new Set(settings.disabledSites);
  if (e.target.checked) list.delete(hostname);
  else list.add(hostname);
  settings.disabledSites = [...list];
  await persist();
});

$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('setKey').addEventListener('click', () => chrome.runtime.openOptionsPage());

load();
