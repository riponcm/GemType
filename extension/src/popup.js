'use strict';

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

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    hostname = tab?.url ? new URL(tab.url).hostname : null;
  } catch {
    hostname = null;
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
