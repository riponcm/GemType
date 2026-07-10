// GemType for Word — task pane logic.
// All Office.js calls live in WordAdapter so the UI/logic can be unit-tested
// with a fake document (see test/harness.html).

'use strict';

// ---------------------------------------------------------------------------
// Word adapter — the only place that touches Office.js.

const WordAdapter = {
  async getDocumentText() {
    return Word.run(async (context) => {
      const body = context.document.body;
      body.load('text');
      await context.sync();
      return body.text;
    });
  },
  async getSelectionText() {
    return Word.run(async (context) => {
      const sel = context.document.getSelection();
      sel.load('text');
      await context.sync();
      return sel.text;
    });
  },
  // Find `original` in the document and replace the first match with `replacement`.
  async replaceText(original, replacement) {
    return Word.run(async (context) => {
      const results = context.document.body.search(original, { matchCase: true, matchWildcards: false });
      results.load('items');
      await context.sync();
      if (results.items.length === 0) return false;
      results.items[0].insertText(replacement, Word.InsertLocation.replace);
      await context.sync();
      return true;
    });
  },
  async replaceSelection(text) {
    return Word.run(async (context) => {
      const sel = context.document.getSelection();
      sel.insertText(text, Word.InsertLocation.replace);
      await context.sync();
    });
  },
};
if (typeof window !== 'undefined') window.GemTypeWord = WordAdapter;

// ---------------------------------------------------------------------------
// Settings (task pane webview localStorage — persists per user across docs).

const DEFAULT_SETTINGS = { apiKey: '', model: 'gemini-3.1-flash-lite', language: 'auto' };

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('gemtype') || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(s) {
  localStorage.setItem('gemtype', JSON.stringify(s));
}

// ---------------------------------------------------------------------------
// UI

const $ = (id) => document.getElementById(id);
let corrections = [];

function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status ' + (kind || '');
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function showView(name) {
  $('main-view').style.display = name === 'main' ? 'block' : 'none';
  $('settings-view').style.display = name === 'settings' ? 'block' : 'none';
}

function friendlyError(err) {
  const m = String(err && err.message || err);
  if (m === 'NO_API_KEY') return 'Add your Gemini API key in Settings.';
  if (m === 'RATE_LIMITED') return 'Gemini rate limit hit — try again shortly.';
  if (m.startsWith('API_KEY_ERROR')) return 'API key rejected. Check it in Settings.';
  return 'Something went wrong: ' + m;
}

function renderCorrections() {
  const list = $('suggestions');
  list.textContent = '';
  if (corrections.length === 0) {
    list.innerHTML = '<div class="empty">No issues found. Your document looks clean.</div>';
    return;
  }
  for (const c of corrections) {
    const item = document.createElement('div');
    item.className = 'item';

    const diff = document.createElement('div');
    diff.className = 'diff';
    const oldS = document.createElement('span'); oldS.className = 'old'; oldS.textContent = c.original;
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→';
    const newS = document.createElement('span'); newS.className = 'new'; newS.textContent = c.replacement;
    diff.append(oldS, arrow, newS);

    const why = document.createElement('div');
    why.className = 'why';
    why.textContent = c.explanation || c.type;

    const actions = document.createElement('div');
    actions.className = 'actions';
    const accept = document.createElement('button');
    accept.className = 'btn btn-accept'; accept.textContent = 'Accept';
    accept.addEventListener('click', () => acceptCorrection(c, item));
    const dismiss = document.createElement('button');
    dismiss.className = 'btn btn-ghost'; dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => { removeCorrection(c); item.remove(); });
    actions.append(accept, dismiss);

    item.append(diff, why, actions);
    list.appendChild(item);
  }
}

function removeCorrection(c) {
  corrections = corrections.filter((x) => x !== c);
  if (corrections.length === 0) renderCorrections();
}

async function checkDocument() {
  const settings = loadSettings();
  if (!settings.apiKey) { showView('settings'); toast('Add your Gemini API key first'); return; }
  setStatus('Reading document…');
  try {
    const text = await WordAdapter.getDocumentText();
    if (!text || text.trim().length < 4) { setStatus('The document is empty.'); corrections = []; renderCorrections(); return; }
    setStatus('Checking with Gemini…');
    corrections = await GemTypeAI.check(text, settings);
    setStatus(corrections.length ? corrections.length + ' suggestion(s)' : 'No issues found', 'ok');
    renderCorrections();
  } catch (err) {
    setStatus(friendlyError(err), 'err');
  }
}

async function acceptCorrection(c, itemEl) {
  try {
    const ok = await WordAdapter.replaceText(c.original, c.replacement);
    if (ok) {
      removeCorrection(c);
      if (itemEl) itemEl.remove();
      toast('Fixed');
    } else {
      toast('Could not locate that text (it may have changed)');
    }
  } catch (err) {
    toast(friendlyError(err));
  }
}

async function rewriteSelection(action) {
  const settings = loadSettings();
  if (!settings.apiKey) { showView('settings'); toast('Add your Gemini API key first'); return; }
  try {
    const text = await WordAdapter.getSelectionText();
    if (!text || text.trim().length < 2) { toast('Select some text in the document first'); return; }
    setStatus('Rewriting (' + action + ')…');
    const rewritten = await GemTypeAI.refine(text, action, settings);
    await WordAdapter.replaceSelection(rewritten);
    setStatus('Rewritten', 'ok');
    toast('Rewritten — use Ctrl/Cmd+Z to undo');
  } catch (err) {
    setStatus(friendlyError(err), 'err');
  }
}

// ---------------------------------------------------------------------------
// Settings view

function openSettings() {
  const s = loadSettings();
  $('apiKey').value = s.apiKey;
  $('model').value = s.model;
  $('language').value = s.language;
  showView('settings');
}

function persistSettings() {
  const s = {
    apiKey: $('apiKey').value.trim(),
    model: $('model').value,
    language: $('language').value,
  };
  saveSettings(s);
  showView('main');
  toast('Settings saved');
}

async function testKey() {
  const s = { apiKey: $('apiKey').value.trim(), model: $('model').value, language: 'English' };
  if (!s.apiKey) { toast('Enter a key first'); return; }
  $('test-result').textContent = 'Testing…';
  try {
    await GemTypeAI.check('She dont like it.', s);
    $('test-result').textContent = 'Key works ✓';
  } catch (err) {
    $('test-result').textContent = 'Failed: ' + friendlyError(err);
  }
}

// ---------------------------------------------------------------------------
// Init

function init() {
  $('check-btn').addEventListener('click', checkDocument);
  $('settings-btn').addEventListener('click', openSettings);
  $('save-settings').addEventListener('click', persistSettings);
  $('cancel-settings').addEventListener('click', () => showView('main'));
  $('test-key').addEventListener('click', testKey);
  $('toggle-key').addEventListener('click', () => {
    const i = $('apiKey');
    i.type = i.type === 'password' ? 'text' : 'password';
    $('toggle-key').textContent = i.type === 'password' ? 'Show' : 'Hide';
  });
  document.querySelectorAll('[data-refine]').forEach((b) =>
    b.addEventListener('click', () => rewriteSelection(b.getAttribute('data-refine')))
  );
  if (!loadSettings().apiKey) { openSettings(); $('no-key-hint').style.display = 'block'; }
  else showView('main');
}

// Office.onReady fires when the host (Word) is ready. The test harness stubs it.
if (typeof Office !== 'undefined' && Office.onReady) {
  Office.onReady(() => init());
} else {
  document.addEventListener('DOMContentLoaded', init);
}

if (typeof window !== 'undefined') {
  window.GemType = { checkDocument, acceptCorrection, rewriteSelection, loadSettings, saveSettings, get corrections() { return corrections; } };
}
