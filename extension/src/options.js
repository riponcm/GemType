'use strict';

const KNOWN_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get('settings');
  const s = stored.settings || {};
  $('apiKey').value = s.apiKey || '';
  const model = s.model || 'gemini-3.1-flash-lite';
  if (KNOWN_MODELS.includes(model)) {
    $('model').value = model;
  } else {
    $('model').value = '__custom__';
    $('customModel').style.display = 'block';
    $('customModel').value = model;
  }
  $('language').value = s.language || 'auto';
  $('disabledSites').value = (s.disabledSites || []).join('\n');
}

function collect() {
  const model =
    $('model').value === '__custom__'
      ? $('customModel').value.trim() || 'gemini-3.1-flash-lite'
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

async function save() {
  const stored = await chrome.storage.local.get('settings');
  const settings = { enabled: true, ...(stored.settings || {}), ...collect() };
  await chrome.storage.local.set({ settings });
  return settings;
}

function setStatus(text, ok) {
  const el = $('status');
  el.textContent = text;
  el.className = ok ? 'ok' : 'err';
}

$('toggleKey').addEventListener('click', () => {
  const input = $('apiKey');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  $('toggleKey').textContent = showing ? 'Show' : 'Hide';
});

$('model').addEventListener('change', () => {
  $('customModel').style.display =
    $('model').value === '__custom__' ? 'block' : 'none';
});

$('save').addEventListener('click', async () => {
  await save();
  setStatus('Saved ✓', true);
  setTimeout(() => setStatus('', true), 2500);
});

$('test').addEventListener('click', async () => {
  const settings = await save();
  if (!settings.apiKey) {
    setStatus('Enter an API key first', false);
    return;
  }
  setStatus('Testing…', true);
  const res = await chrome.runtime.sendMessage({
    type: 'CHECK_TEXT',
    text: 'She dont like going their on the weekends because it are far.',
  });
  if (res?.ok) {
    setStatus(
      `Key works ✓ (${res.result.corrections.length} test corrections returned)`,
      true
    );
  } else {
    setStatus(`Failed: ${res?.error || 'no response'}`, false);
  }
});

load();
