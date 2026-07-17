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
  ipcMain, screen, systemPreferences, nativeImage, shell, dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const AI = require('./gemini.js');

const isMac = process.platform === 'darwin';
const HOTKEY = 'CommandOrControl+Shift+G';
const REPO_URL = 'https://github.com/riponcm/GemType';
const RELEASES_URL = REPO_URL + '/releases';
const SITE_URL = 'https://gemtype.matily.org';
const MATILY_URL = 'https://matily.org';

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
    return;
  }
  // Windows: use real key events (keybd_event) rather than WScript SendKeys,
  // which is unreliable in Office/Electron apps (Word, Outlook, Claude). Send
  // Ctrl down, <key> down/up, Ctrl up with tiny gaps so the target registers it.
  const vk = key === 'c' ? '0x43' : '0x56'; // C / V ; Ctrl = 0x11, KEYUP = 2
  const script =
    "Add-Type -Namespace N -Name K -MemberDefinition @'\n" +
    '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);\n' +
    "'@\n" +
    '$z=[System.UIntPtr]::Zero;' +
    '[N.K]::keybd_event(0x11,0,0,$z); Start-Sleep -Milliseconds 15;' +
    `[N.K]::keybd_event(${vk},0,0,$z); Start-Sleep -Milliseconds 15;` +
    `[N.K]::keybd_event(${vk},0,2,$z); Start-Sleep -Milliseconds 15;` +
    '[N.K]::keybd_event(0x11,0,2,$z)';
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  await execP(`powershell -NoProfile -EncodedCommand ${b64}`);
}

function ensureMacAccessibility() {
  if (!isMac) return true;
  // Prompts the user (once) to grant Accessibility permission if missing.
  return systemPreferences.isTrustedAccessibilityClient(true);
}

// Remember the frontmost app so we can hand focus back to it right before
// pasting. Needed for the click path: clicking the popup activates GemType, so
// the target would otherwise no longer be frontmost when Cmd/Ctrl+V fires.
async function getFrontTarget() {
  try {
    if (isMac) {
      const out = await execP(
        `osascript -e 'tell application "System Events" to unix id of first application process whose frontmost is true'`);
      const pid = parseInt(String(out).trim(), 10);
      return Number.isFinite(pid) ? { pid } : null;
    }
    const script =
      "Add-Type -Namespace N -Name U -MemberDefinition @'\n" +
      '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();\n' +
      '[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int pid);\n' +
      "'@\n" +
      '$h=[N.U]::GetForegroundWindow(); $p=0; [void][N.U]::GetWindowThreadProcessId($h,[ref]$p); $p';
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    const out = await execP(`powershell -NoProfile -EncodedCommand ${b64}`);
    const pid = parseInt(String(out).trim(), 10);
    return Number.isFinite(pid) ? { pid } : null;
  } catch { return null; }
}

async function restoreTarget(t) {
  if (!t || !t.pid) return;
  try {
    if (isMac) {
      await execP(
        `osascript -e 'tell application "System Events" to set frontmost of (first application process whose unix id is ${t.pid}) to true'`);
    } else {
      const script = `(New-Object -ComObject WScript.Shell).AppActivate([int]${t.pid})`;
      const b64 = Buffer.from(script, 'utf16le').toString('base64');
      await execP(`powershell -NoProfile -EncodedCommand ${b64}`);
    }
  } catch { /* best effort */ }
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
    // Focusable (so mouse clicks on the buttons work — a non-focusable window
    // can't receive clicks on macOS and just beeps), but shown with
    // showInactive() so it does NOT steal focus on appear. It only activates on
    // an explicit click; before pasting we hand focus back to the target app.
    // acceptFirstMouse lets that activating click also register as a button press.
    acceptFirstMouse: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  popup.setAlwaysOnTop(true, 'screen-saver');
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popup.loadFile(path.join(__dirname, 'popup.html'));
}

// While the popup is up we handle Enter/Escape via temporary global shortcuts
// (the window is non-focusable, so it can't receive key events itself). They
// are registered only for the short life of the popup and released on hide.
let autoDismiss = null;
function reg(accel, cb) { try { return globalShortcut.register(accel, cb); } catch { return false; } }
function registerPopupKeys() {
  unregisterPopupKeys();
  const accept = () => { if (currentJob && currentJob.result) replaceSelection(); };
  if (!reg('Enter', accept)) reg('Return', accept);
  reg('Escape', () => { hidePopup(); currentJob = null; });
  autoDismiss = setTimeout(() => { hidePopup(); currentJob = null; }, 20000);
}
function unregisterPopupKeys() {
  ['Enter', 'Return', 'Escape'].forEach((a) => { try { globalShortcut.unregister(a); } catch { /* noop */ } });
  if (autoDismiss) { clearTimeout(autoDismiss); autoDismiss = null; }
}

function showPopupNearCursor() {
  const { x, y } = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint({ x, y });
  const [w, h] = popup.getSize();
  const px = Math.min(Math.max(x - 40, display.workArea.x + 8), display.workArea.x + display.workArea.width - w - 8);
  const py = Math.min(y + 18, display.workArea.y + display.workArea.height - h - 8);
  popup.setPosition(Math.round(px), Math.round(py));
  popup.showInactive();          // show WITHOUT stealing focus from the target
  registerPopupKeys();
}

function hidePopup() {
  unregisterPopupKeys();
  if (popup && popup.isVisible()) popup.hide();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 460, height: 640, resizable: false, title: 'GemType Settings',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
}

function showAbout() {
  const btn = dialog.showMessageBoxSync({
    type: 'info',
    title: 'About GemType',
    message: 'GemType Desktop',
    detail:
      `Version ${app.getVersion()}\n\n` +
      'Fix and rewrite text in any application with your own Gemini API key.\n\n' +
      'Made by Matily — matily.org\n' +
      '© 2026 Matily. Licensed under Apache-2.0.',
    buttons: ['Check for Updates', 'Close'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')),
  });
  if (btn === 0) shell.openExternal(RELEASES_URL);
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

  const target = await getFrontTarget();
  const { text, previousClipboard } = await captureSelection(fromHotkey);
  if (!text || !text.trim()) {
    // restore clipboard and tell the user nothing was selected
    if (previousClipboard) clipboard.writeText(previousClipboard);
    currentJob = null;
    showPopupNearCursor();
    popup.webContents.send('state', { kind: 'empty' });
    return;
  }

  currentJob = { text, previousClipboard, action, target };
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

// Paste the result over the original selection. The target app kept focus the
// whole time (the popup never took it), so Ctrl/Cmd+V lands directly — no
// focus-return dance needed, just a brief settle after hiding the overlay.
async function replaceSelection() {
  const job = currentJob;
  if (!job || !job.result) return;
  currentJob = null;                     // guard against a double Enter
  hidePopup();
  clipboard.writeText(job.result);       // may wake a clipboard-manager popup...
  await restoreTarget(job.target);       // ...so refocus the target AFTER that
  await sleep(160);
  try { await sendCombo('v'); } catch { /* surfaced on next use */ }
  await sleep(450);
  if (job.previousClipboard) clipboard.writeText(job.previousClipboard);
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

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  repo: REPO_URL, releases: RELEASES_URL, site: SITE_URL, matily: MATILY_URL,
}));
ipcMain.on('app:open', (_e, which) => {
  const url = { releases: RELEASES_URL, site: SITE_URL, matily: MATILY_URL, repo: REPO_URL }[which];
  if (url) shell.openExternal(url);
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

  // Menu-bar icon: the colored brand mark (padded so it isn't an edge-to-edge
  // tile). Not a template image — we want it to stay in brand color. Electron
  // auto-picks tray@2x.png on Retina from the base path.
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(trayIcon);
  tray.setToolTip('GemType — select text anywhere, press ' + (isMac ? '⌘⇧G' : 'Ctrl+Shift+G'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Fix selection  (${isMac ? '⌘⇧G' : 'Ctrl+Shift+G'})`, click: () => onHotkey('fix') },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Check for Updates…', click: () => shell.openExternal(RELEASES_URL) },
    { label: 'Website', click: () => shell.openExternal(SITE_URL) },
    { label: 'About GemType', click: showAbout },
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
