<div align="center">

<img src="assets/logo.svg" alt="GemType" width="420" />

**Grammarly-style writing assistant for every website — powered by your own free Gemini API key.**

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-coming%20soon-4285F4?logo=googlechrome&logoColor=white)](#-install)
[![Version](https://img.shields.io/badge/version-0.1.2-10a37f)](extension/manifest.json)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-6366f1)](extension/manifest.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../pulls)

<img src="assets/hero.svg" alt="GemType demo: typing with mistakes, wavy underlines appear, one click fixes them" width="820" />

</div>

---

## ✨ Features

- 🔍 **Live grammar & spelling check** — wavy underlines appear in any text field a second after you stop typing: Gmail, LinkedIn, X, Reddit, GitHub, anywhere
- ✅ **One-click fixes** — click an underline, accept the correction; `Ctrl/Cmd+Z` always undoes
- 🔁 **Sentence verification** — after every accepted fix, the whole sentence is automatically re-checked so word-level fixes never leave broken sentences behind
- ✍️ **Rewrite on demand** — select text for a floating toolbar: *Improve · Fix · Shorten · Formal · Casual* (also in the right-click menu)
- 🧠 **LLM-grade suggestions** — context-aware corrections in any language, not just pattern matching
- 🔑 **Bring your own key** — uses your free [Google AI Studio](https://aistudio.google.com/apikey) key; no account, no subscription, no middleman server
- 🕶️ **Private by design** — your text goes only to Google's Gemini API; no tracking, no analytics, nothing else phones home
- ⚙️ **Full control** — per-site disable, global toggle, model picker, language setting; honors `data-gramm="false"` opt-outs

## ⚖️ GemType vs. Grammarly

| | **GemType** | **Grammarly** |
|---|---|---|
| 💰 Price | **Free** — bring your own Gemini key ([free tier](https://aistudio.google.com/apikey), no card) | Free plan is limited; Premium **$12–30 / month** |
| ✅ Grammar & spelling fixes | ✔️ unlimited | ✔️ (full corrections need Premium) |
| 🔁 Sentence re-check after each accepted fix | ✔️ automatic | — |
| ✍️ AI rewrites (Improve / Shorten) | ✔️ included | Premium |
| 🎭 Preset styles (Formal / Casual) | ✔️ included | Premium |
| 🌐 Languages | Any language Gemini understands — auto-detected | English + a handful |
| 🕶️ Trackers / analytics | **None** | Product analytics & telemetry |
| 👤 Account required | **No** | Yes |
| 🖥️ Where your text is processed | Google's Gemini API only, with **your** key — no middleman server | Grammarly's servers |
| 🔓 Open source | ✔️ MIT | — |
| 📄 Google Docs | — (Google whitelists specific vendors) | ✔️ |

**What does "bring your own key" really cost?** For a single person typing,
the **free Gemini tier is more than enough** — GemType checks only after you
pause, skips unchanged text, and caches results, so even a heavy writing day
stays comfortably inside the free quota. If you ever switch the key to the
paid tier, a typical check costs ~$0.0003 — around **$1/month** for very
heavy daily use. Compare that to $144–360/year for Premium.

## 🚀 Install

**Chrome Web Store** — *coming soon.*

**Manual (developer mode):**

1. Download or clone this repo
2. Open `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (2 clicks, no credit card)
5. Open GemType **Settings** from the toolbar icon → paste the key → **Save & test**

**Safari** — the same code base wraps into a Safari App Extension; see [Safari build](#safari) below.

## 🧭 How it works

```
             page (any website)
┌──────────────────────────────────────────┐
│  content script                          │
│  ├─ detects textarea / contenteditable   │
│  ├─ draws underline overlay (shadow DOM, │
│  │   never touches the page's editor)    │
│  └─ applies fixes via execCommand        │
│      (native undo + framework-safe)      │
└──────────────┬───────────────────────────┘
               │ chrome.runtime messaging
┌──────────────▼───────────────────────────┐
│  background service worker               │
│  ├─ queue + cache + 429 backoff          │
│  └─ Gemini generateContent               │
│      (structured JSON output)            │
└──────────────┬───────────────────────────┘
               ▼
   generativelanguage.googleapis.com
        (your API key, your data)
```

- **Overlay, not injection** — underline positions come from `Range.getClientRects()` (rich editors) or a mirror element (plain fields); the page's DOM is never modified, so React/Vue/ProseMirror editors stay stable
- **Snippet anchoring** — the model returns exact text snippets, located client-side and re-anchored live as you type (LLM character offsets are unreliable)
- **Token-frugal** — debounced checks, unchanged-text skipping, response caching, and sentence-scoped re-checks keep free-tier quota comfortable for daily use

## 🌐 Site support

| Editor type | Status |
|---|---|
| Plain `textarea` / `input` (GitHub, forums, most forms) | ✅ |
| `contenteditable` rich editors (Gmail, LinkedIn, X) | ✅ |
| Shadow-DOM web components (Reddit) | ✅ |
| Google Docs (canvas rendering, requires Google-whitelisted extension ID) | ❌ use right-click rewrite instead |

## 🔒 Privacy

- The text you're editing is sent **only** to `generativelanguage.googleapis.com` (Google's Gemini API) using **your** key — see [PRIVACY.md](PRIVACY.md)
- Your API key lives in `chrome.storage.local` on your device and is never synced or transmitted elsewhere
- No accounts, no telemetry, no third-party servers
- Sites can opt out with `data-gemtype="false"`; Grammarly-style opt-outs are honored too

## 🗂 Project structure

```
extension/              the Chrome extension (MV3, no build step)
├── manifest.json
└── src/
    ├── background.js       Gemini API calls, cache, rate limiting
    ├── content/
    │   ├── content.js      field discovery + checking loop
    │   ├── overlay.js      underlines, badge, suggestion card
    │   ├── refine.js       selection rewrite toolbar
    │   └── util.js         text extraction, offset maps, safe replacement
    ├── options.html/js     API key, model, language, disabled sites
    └── popup.html/js       global + per-site toggles
test/
├── test-page.html      manual test fields (incl. scroll + opt-out cases)
└── harness.html        automated harness with a mocked Gemini backend
store/                  Chrome Web Store listing assets
safari/                 Xcode wrapper project (generated)
```

## 🛠 Development

```bash
# run the mock harness (no API key needed)
python3 -m http.server 8377
open http://localhost:8377/test/harness.html
```

<a name="safari"></a>**Safari build** (needs Xcode):

```bash
xcrun safari-web-extension-converter extension --project-location safari --app-name GemType --macos-only
xcodebuild -project safari/GemType/GemType.xcodeproj -scheme GemType -configuration Debug build
```

Then in Safari: Settings → Developer → **Allow unsigned extensions** → enable GemType.

## 🗺 Roadmap

- [ ] Chrome Web Store release
- [ ] Hosted key option (proxy backend) — no setup at all for end users
- [ ] Tone/style preferences per site
- [ ] Firefox port
- [ ] iOS / Android keyboards sharing the same brain

## ⚖️ Responsible use

GemType sends the text you are actively editing to Google's Gemini API for analysis. Don't use it in fields containing passwords, secrets, or text you're not comfortable processing with a cloud AI service — or disable it for those sites with one click.

## 📄 License

[MIT](LICENSE) © 2026 Matily
