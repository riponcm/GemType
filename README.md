<div align="center">

<img src="assets/logo.svg" alt="GemType" width="420" />

**Grammarly-style writing assistant for every website — powered by your own free Gemini API key.**

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/linnnamnhkciekgpnegkcajcafmjlhgh?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4)](https://chromewebstore.google.com/detail/linnnamnhkciekgpnegkcajcafmjlhgh)
[![Users](https://img.shields.io/chrome-web-store/users/linnnamnhkciekgpnegkcajcafmjlhgh?color=10a37f)](https://chromewebstore.google.com/detail/linnnamnhkciekgpnegkcajcafmjlhgh)
[![Rating](https://img.shields.io/chrome-web-store/rating/linnnamnhkciekgpnegkcajcafmjlhgh?color=f59e0b)](https://chromewebstore.google.com/detail/linnnamnhkciekgpnegkcajcafmjlhgh)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-6366f1)](extension/manifest.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../../pulls)

### [➜ Install GemType free from the Chrome Web Store](https://chromewebstore.google.com/detail/linnnamnhkciekgpnegkcajcafmjlhgh)

<img src="assets/hero.svg" alt="GemType demo: typing with mistakes, wavy underlines appear, one click fixes them" width="820" />

</div>

---

## Features

- **Live grammar and spelling checking** — underlines appear in any text field about a second after you stop typing: Gmail, LinkedIn, X, Reddit, GitHub, anywhere
- **One-click fixes** — click an underline and accept the correction; `Ctrl/Cmd+Z` always undoes
- **Sentence verification** — after every accepted fix, the surrounding sentence is automatically re-checked, so word-level fixes never leave broken sentences behind
- **Rewrite on demand** — select text for a floating toolbar with *Improve, Fix, Shorten, Formal,* and *Casual* actions, also available from the right-click menu
- **Context-aware suggestions** — an LLM judges whole sentences in any language, not just pattern rules
- **Bring your own key** — uses your free [Google AI Studio](https://aistudio.google.com/apikey) key; no account, no subscription, no middleman server
- **Private by design** — text goes only to Google's Gemini API; no tracking, no analytics, nothing else phones home
- **Full control** — per-site disable, global toggle, model picker, language setting; honors `data-gramm="false"` opt-outs

## Comparison with Grammarly

| | GemType | Grammarly |
|---|---|---|
| Price | Free — bring your own Gemini key ([free tier](https://aistudio.google.com/apikey), no card required) | Free plan is limited; Premium $12–30 per month |
| Grammar and spelling fixes | Unlimited | Full corrections require Premium |
| Sentence re-check after each accepted fix | Automatic | Not available |
| AI rewrites (Improve, Shorten) | Included | Premium |
| Preset styles (Formal, Casual) | Included | Premium |
| Languages | Any language Gemini understands, auto-detected | English and a small set of variants |
| Trackers and analytics | None | Product analytics and telemetry |
| Account required | No | Yes |
| Where your text is processed | Google's Gemini API only, with your key — no middleman server | Grammarly's servers |
| Open source | Yes (MIT) | No |
| Google Docs | Not supported (Google whitelists specific vendors) | Supported |

**What does "bring your own key" really cost?** For a single person typing,
the free Gemini tier is more than enough — GemType checks only after you
pause, skips unchanged text, and caches results, so even a heavy writing day
stays comfortably inside the free quota. On the paid tier, a typical check
costs around $0.0003 — roughly one dollar per month for very heavy daily
use, compared with $144–360 per year for Premium.

## Screenshots

| | |
|---|---|
| ![Live checking with underlines and the issue-count badge](assets/screenshots/underlines.png) | ![Suggestion card with one-click Accept](assets/screenshots/card.png) |
| *Live checking — underlines and issue-count badge* | *Click an underline, accept the fix* |
| ![All suggestions in one panel](assets/screenshots/panel.png) | ![Rewrite toolbar on selected text](assets/screenshots/toolbar.png) |
| *Review all suggestions from the badge* | *Select text to rewrite: Improve, Fix, Shorten, Formal, Casual* |

## Install

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/linnnamnhkciekgpnegkcajcafmjlhgh)** — one click, then add your free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

<details>
<summary><b>Or install manually (developer mode)</b></summary>

**Manual (developer mode):**

1. Download or clone this repository
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (no credit card required)
5. Open GemType **Settings** from the toolbar icon, paste the key, and click **Save & test**

</details>

**Safari** — the same code base wraps into a Safari App Extension; see [Safari build](#safari) below.

## How it works

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

- **Overlay, not injection** — underline positions come from `Range.getClientRects()` (rich editors) or a mirror element (plain fields); the page's DOM is never modified, so React, Vue, and ProseMirror editors stay stable
- **Snippet anchoring** — the model returns exact text snippets, located client-side and re-anchored live as you type (LLM character offsets are unreliable)
- **Token-frugal** — debounced checks, unchanged-text skipping, response caching, and sentence-scoped re-checks keep free-tier quota comfortable for daily use

## Site support

| Editor type | Status |
|---|---|
| Plain `textarea` / `input` (GitHub, forums, most forms) | Supported |
| `contenteditable` rich editors (Gmail, LinkedIn, X) | Supported |
| Shadow-DOM web components (Reddit) | Supported |
| Google Docs (canvas rendering; requires a Google-whitelisted extension ID) | Not supported — use the right-click rewrite instead |

## Privacy

- The text you are editing is sent **only** to `generativelanguage.googleapis.com` (Google's Gemini API) using your own key — see [PRIVACY.md](PRIVACY.md)
- Your API key lives in `chrome.storage.local` on your device; it is never synced or transmitted anywhere else
- Password fields are never read, and payment or one-time-code fields are skipped at the code level
- No accounts, no telemetry, no third-party servers
- Sites can opt out with `data-gemtype="false"`; Grammarly-style opt-outs are honored as well

## Project structure

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
assets/                 logo, hero animation, screenshots
test/
├── test-page.html      manual test fields (incl. scroll + opt-out cases)
└── harness.html        automated harness with a mocked Gemini backend
safari/                 Xcode wrapper project (generated)
```

## Development

```bash
# run the mock harness (no API key needed)
python3 -m http.server 8377
open http://localhost:8377/test/harness.html
```

<a name="safari"></a>**Safari build** (requires Xcode):

```bash
xcrun safari-web-extension-converter extension --project-location safari --app-name GemType --macos-only
xcodebuild -project safari/GemType/GemType.xcodeproj -scheme GemType -configuration Debug build
```

Then in Safari: Settings → Developer → **Allow unsigned extensions** → enable GemType.

## Roadmap

- [x] **Chrome Web Store release** — [live now](https://chromewebstore.google.com/detail/linnnamnhkciekgpnegkcajcafmjlhgh)
- [ ] Hosted key option (proxy backend) — zero setup for end users
- [ ] Tone and style preferences per site
- [ ] Safari App Store release (build ready; needs Apple Developer membership — [sponsor](#sponsor-this-project))
- [ ] Firefox port
- [ ] iOS / Android keyboards sharing the same backend

## Responsible use

GemType sends the text you are actively editing to Google's Gemini API for
analysis. Do not use it in fields containing passwords, secrets, or text you
are not comfortable processing with a cloud AI service — or disable it for
those sites with one click.

## Frequently asked questions

**Is GemType a free alternative to Grammarly?**
Yes. GemType provides live grammar checking, one-click fixes, and AI rewrites
on any website at no cost — you supply your own free Gemini API key from
Google AI Studio. There is no subscription and no premium tier.

**Is the Gemini API key really free? Do I need a credit card?**
Google AI Studio issues free API keys with no credit card required. The free
quota is far more than one person needs for everyday typing; GemType is built
to stay inside it (debounced checks, caching, sentence-scoped re-checks).

**Is GemType safe? Where does my text go?**
The text you edit is sent directly from your browser to Google's Gemini API,
authenticated with your own key. There is no GemType server, no account, and
no analytics — the developers never see your text. Password, payment, and
one-time-code fields are never read. See [PRIVACY.md](PRIVACY.md).

**Which websites does it work on?**
Any site with a normal text field or rich editor: Gmail, LinkedIn, X
(Twitter), Reddit, GitHub, forums, web mail, CMS editors. Google Docs is the
one notable exception, because it renders documents to a canvas and restricts
its annotation API to Google-whitelisted vendors.

**Does it work in languages other than English?**
Yes. GemType auto-detects the language you are writing in and checks it with
the same model — Spanish, French, German, Portuguese, Bengali, Hindi, Arabic,
Chinese, Japanese, and anything else Gemini understands. You can also pin a
language in settings.

**How is this different from pasting my text into ChatGPT or Gemini?**
GemType works where you type: mistakes are underlined in place while you
write, fixes apply with one click and native undo, and each fix triggers an
automatic re-check of the sentence. No copy-paste round trips.

**Does it slow down my browser?**
No. The content script stays inert until you focus a text field, checks only
after you pause typing, and draws its UI on a lightweight overlay without
touching the page's own editor.

**Can it run fully offline or with a local model?**
Not yet. A pluggable backend (including self-hosted models) is on the
roadmap.

## Contributing

Contributions are welcome — this project went from an empty folder to a
working extension in a day, and there is plenty of interesting work left:

- Firefox port (WebExtension API is nearly identical)
- Compatibility fixes for stubborn editors (report a site, ideally with a
  reduced test case in `test/test-page.html`)
- Translations for the UI
- The proxy backend for a zero-setup hosted mode

Open an issue to discuss anything bigger before you build it. If GemType
helped you, starring the repository genuinely helps others find it.

## Sponsor this project

GemType is free, open source, and unfunded. The Safari version is built and
working — but shipping it to the App Store requires the **Apple Developer
Program fee of $99/year**, which is currently the only thing standing between
this project and Safari users (and, later, the iOS keyboard).

If you or your company find GemType useful, consider sponsoring:
**[github.com/sponsors/riponcm](https://github.com/sponsors/riponcm)** — the
first goal is exactly one thing: the Apple Developer fee. Every sponsor is
credited in this README.

## License

[MIT](LICENSE) © 2026 Matily

The GemType name and logo are not covered by the MIT license — see
[TRADEMARK.md](TRADEMARK.md). Please give forks their own name and icon.

---

<div align="center">

Another open source product from <b>Matily</b> — open source software studio.

</div>
