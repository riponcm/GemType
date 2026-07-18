# GemType Desktop

Fix and rewrite text in **any application** on your computer — Word, Slack,
email clients, editors, anything where text can be selected. Same
bring-your-own-key model as every GemType surface: your text goes straight to
Google's Gemini API with your key; there is no GemType server.

## How it works

1. Select text in any app.
2. Press the global hotkey — **⌘⇧G** on Mac, **Ctrl+Shift+G** on Windows.
3. GemType grabs the selection, fixes it with Gemini, and shows a small popup.
4. Press **Enter** to paste the fix back over your selection (your clipboard
   is restored afterward). Or pick another action: Improve, Shorten, Formal,
   Casual.

Because the capture rides on select-and-copy rather than per-app integrations,
it works in effectively every application — no compatibility list.

## Run it (development)

Requires Node.js.

```bash
cd desktop
npm install
npm start
```

A gem icon appears in the menu bar (Mac) / system tray (Windows). First run
opens Settings — paste your free Gemini API key from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) and click
**Save & test**.

**macOS:** the first hotkey press asks for **Accessibility permission**
(System Settings → Privacy & Security → Accessibility). That permission is
what lets GemType send the copy/paste keystrokes — standard for tools like
this (Grammarly Desktop, Raycast, etc. require the same).

## Files

```
desktop/
├── main.js          Electron main: tray, hotkey, clipboard capture, paste-back
├── gemini.js        Gemini API calls (Node; unit-tested with a stubbed fetch)
├── popup.html       the result popup (Replace / Copy / action chips)
├── settings.html    API key, model, language
├── assets/          icons
└── test/            plain-node tests: `npm test`
```

## Download

Prebuilt apps are attached to the [latest release](../../releases/latest):
macOS (`.dmg` / `.zip`), Windows (`.exe` installer / `.zip`), Linux
(`.AppImage`).

## Packaging

`electron-builder` builds all three platforms:

```bash
npm run dist -- --mac     # dmg + zip
npm run dist -- --win     # nsis installer + zip
npm run dist -- --linux   # AppImage
```

Notes:

- **Windows**: distributable immediately; unsigned builds show a SmartScreen
  warning (a code-signing certificate removes it — optional).
- **Linux**: the AppImage is portable — `chmod +x` and run.
- **macOS**: builds run unsigned for local/direct distribution (Gatekeeper
  shows an "unidentified developer" notice). App Store / notarized distribution
  needs the Apple Developer Program ($99/yr) — the same membership that unlocks
  the Safari extension.

## Roadmap

- Stage 2: live checking in accessibility-friendly apps (suggestion card near
  the caret) via AX (macOS) / UI Automation (Windows).
- Stage 3: inline underlines in apps that report text bounds.
