// GemType Desktop — Electron main process.
// A menu-bar/tray app: select text in ANY application, press the global
// hotkey, and GemType fixes or rewrites it via Gemini (your own key), then
// pastes the result back in place.
//
// Selection capture rides on the clipboard (simulated Cmd/Ctrl+C), which is
// what makes it work in every app rather than only accessibility-friendly
// ones. The user's clipboard is restored afterward.

'use strict';

const {
  app, Tray, Menu, BrowserWindow, globalShortcut, clipboard,
  ipcMain, screen, systemPreferences, nativeImage, shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const AI = require('./gemini.js');

const isMac = process.platform === 'darwin';
const HOTKEY = 'CommandOrControl+Shift+G';

// ---------------------------------------------------------------------------
// Settings (plain JSON in userData)

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = { apiKey: '', model: 'gemini-3.1-flash-lite', language: 'auto' };

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
}

// ---------------------------------------------------------------------------
// OS keystrokes (copy / paste into the frontmost app)

function execP(cmd) {
  return new Promise((resolve, reject) =>
    exec(cmd, { timeout: 5000 }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr || err.message).trim())) : resolve(stdout)));
}

async function sendCombo(key) { // key: 'c' | 'v'
  if (isMac) {
    await execP(`osascript -e 'tell application "System Events" to keystroke "${key}" using {command down}'`);
  } else {
    await execP(`powershell -NoProfile -Command "$w = New-Object -ComObject wscript.shell; $w.SendKeys('^${key}')"`);
  }
}

function ensureMacAccessibility() {
  if (!isMac) return true;
  // Prompts the user (once) to grant Accessibility permission if missing.
  return systemPreferences.isTrustedAccessibilityClient(true);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollClipboard() {
  for (let i = 0; i < 10; i++) {           // poll up to ~600ms
    await sleep(60);
    const t = clipboard.readText();
    if (t) return t;
  }
  return '';
}

// Copy the current selection of the frontmost app via the clipboard.
// `fromHotkey`: when the flow was triggered by the global shortcut, the user
// is still physically holding Cmd+Shift. Sending Cmd+C right away makes the OS
// see Cmd+Shift+C (not copy), so nothing is captured. We wait for the
// modifiers to release, and retry the copy once if the first attempt is empty.
// Returns { text, previousClipboard } — text is null if nothing was selected.
async function captureSelection(fromHotkey) {
  const previousClipboard = clipboard.readText();
  clipboard.clear();
  if (fromHotkey) await sleep(250);        // let Cmd+Shift lift
  await sendCombo('c');
  let text = await pollClipboard();
  if (!text) {                             // modifiers are surely up now — retry
    await sleep(120);
    await sendCombo('c');
    text = await pollClipboard();
  }
  return { text: text || null, previousClipboard };
}

// ---------------------------------------------------------------------------
// Windows

let tray = null;
let popup = null;
let settingsWin = null;
let currentJob = null; // { text, previousClipboard, action }

function createPopup() {
  popup = new BrowserWindow({
    width: 460, height: 260, show: false, frame: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, transparent: true, hasShadow: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  popup.loadFile(path.join(__dirname, 'popup.html'));
  popup.on('blur', () => { if (popup.isVisible() && !popup.webContents.isDevToolsFocused()) hidePopup(); });
}

function showPopupNearCursor() {
  const { x, y } = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint({ x, y });
  const [w, h] = popup.getSize();
  const px = Math.min(Math.max(x - 40, display.workArea.x + 8), display.workArea.x + display.workArea.width - w - 8);
  const py = Math.min(y + 18, display.workArea.y + display.workArea.height - h - 8);
  popup.setPosition(Math.round(px), Math.round(py));
  popup.show();
  popup.focus();
}

function hidePopup() {
  if (popup && popup.isVisible()) popup.hide();
  if (isMac) app.hide(); // hand focus back to the previous app
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 460, height: 560, resizable: false, title: 'GemType Settings',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
}

// ---------------------------------------------------------------------------
// The hotkey flow

async function onHotkey(action = 'fix', fromHotkey = false) {
  const settings = loadSettings();
  if (!settings.apiKey) { openSettings(); return; }
  if (!ensureMacAccessibility()) {
    // The macOS permission prompt was shown; user must grant + retry.
    return;
  }

  const { text, previousClipboard } = await captureSelection(fromHotkey);
  if (!text || !text.trim()) {
    // restore clipboard and tell the user nothing was selected
    if (previousClipboard) clipboard.writeText(previousClipboard);
    currentJob = null;
    showPopupNearCursor();
    popup.webContents.send('state', { kind: 'empty' });
    return;
  }

  currentJob = { text, previousClipboard, action };
  showPopupNearCursor();
  popup.webContents.send('state', { kind: 'loading', action, original: text });
  runJob();
}

async function runJob() {
  const job = currentJob;
  if (!job) return;
  try {
    const result = await AI.refine(job.text, job.action, loadSettings());
    if (currentJob !== job) return; // superseded
    job.result = result;
    popup.webContents.send('state', { kind: 'result', action: job.action, original: job.text, result });
  } catch (err) {
    if (currentJob !== job) return;
    popup.webContents.send('state', { kind: 'error', message: friendly(err) });
  }
}

function friendly(err) {
  const m = String((err && err.message) || err);
  if (m === 'NO_API_KEY') return 'Add your Gemini API key in Settings.';
  if (m === 'RATE_LIMITED') return 'Gemini rate limit hit — try again in a moment.';
  if (m.startsWith('API_KEY_ERROR')) return 'API key rejected — check it in Settings.';
  if (/not allowed assistive|osascript/i.test(m)) return 'macOS Accessibility permission needed: System Settings → Privacy & Security → Accessibility → enable GemType.';
  return 'Something went wrong: ' + m;
}

// Paste the result over the original selection in the previous app.
async function replaceSelection() {
  const job = currentJob;
  if (!job || !job.result) return;
  hidePopup();
  await sleep(isMac ? 300 : 400);        // let focus return to the target app
  clipboard.writeText(job.result);
  try { await sendCombo('v'); } catch { /* surfaced on next use */ }
  await sleep(500);
  if (job.previousClipboard) clipboard.writeText(job.previousClipboard);
  currentJob = null;
}

// ---------------------------------------------------------------------------
// IPC

ipcMain.on('popup', async (_e, msg) => {
  if (msg.type === 'replace') await replaceSelection();
  else if (msg.type === 'copy') {
    if (currentJob && currentJob.result) clipboard.writeText(currentJob.result);
    hidePopup(); currentJob = null;
  } else if (msg.type === 'rerun') {
    if (!currentJob) return;
    currentJob.action = msg.action;
    popup.webContents.send('state', { kind: 'loading', action: msg.action, original: currentJob.text });
    runJob();
  } else if (msg.type === 'close') { hidePopup(); currentJob = null; }
  else if (msg.type === 'openSettings') { hidePopup(); openSettings(); }
});

ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:save', (_e, s) => { saveSettings({ ...loadSettings(), ...s }); return true; });
ipcMain.handle('settings:test', async (_e, s) => {
  try { await AI.refine('She dont like it.', 'fix', s); return { ok: true }; }
  catch (err) { return { ok: false, error: friendly(err) }; }
});

// ---------------------------------------------------------------------------
// App lifecycle

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(() => {
  if (isMac && app.dock) app.dock.hide(); // pure menu-bar app

  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(trayIcon);
  tray.setToolTip('GemType — select text anywhere, press ' + (isMac ? '⌘⇧G' : 'Ctrl+Shift+G'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Fix selection  (${isMac ? '⌘⇧G' : 'Ctrl+Shift+G'})`, click: () => onHotkey('fix') },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Website', click: () => shell.openExternal('https://gemtype.matily.org') },
    { type: 'separator' },
    { label: 'Quit GemType', role: 'quit' },
  ]));

  createPopup();

  const ok = globalShortcut.register(HOTKEY, () => onHotkey('fix', true));
  if (!ok) console.error('GemType: failed to register global hotkey', HOTKEY);

  if (!loadSettings().apiKey) openSettings();
  console.log('GemType desktop ready (hotkey: ' + HOTKEY + ')');
});

app.on('window-all-closed', (e) => e.preventDefault()); // tray app: keep running
app.on('will-quit', () => globalShortcut.unregisterAll());
