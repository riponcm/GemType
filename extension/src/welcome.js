'use strict';

const $ = (id) => document.getElementById(id);

if (/Mac/.test(navigator.platform)) $('k1').textContent = '⌘';
if (GTShared.isSafari()) $('safariNote').hidden = false;

function setStatus(text, ok) {
  $('status').textContent = text;
  $('status').className = ok ? 'ok' : 'err';
}

$('save').addEventListener('click', async () => {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) {
    setStatus('Paste your key first.', false);
    return;
  }
  await GTShared.patchSettings({ apiKey });
  setStatus('Testing…', true);
  const res = await chrome.runtime.sendMessage({
    type: 'CHECK_TEXT',
    text: 'She dont like going their on the weekends.',
  });
  if (res?.ok) {
    setStatus('Your key works ✓ GemType is ready.', true);
    $('step1').classList.add('done');
  } else {
    setStatus(`That didn't work: ${res?.error || 'no response'}. Check the key and try again.`, false);
  }
});

async function renderMode() {
  const { settings } = await GTShared.load();
  const mode = GTShared.effectiveMode(settings);
  for (const b of document.querySelectorAll('.mode')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
}

for (const b of document.querySelectorAll('.mode')) {
  b.addEventListener('click', async () => {
    await GTShared.patchSettings(GTShared.modePatch(b.dataset.mode));
    renderMode();
  });
}

GTShared.load().then(({ settings }) => {
  if (settings.apiKey) {
    $('apiKey').value = settings.apiKey;
    $('step1').classList.add('done');
  }
  renderMode();
});
