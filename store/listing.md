# Chrome Web Store listing — GemType

Everything to copy-paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole).
One-time $5 developer registration fee applies to new accounts.

## Product details

| Field | Value |
|---|---|
| Name | GemType — AI Writing Assistant |
| Summary (max 132 chars) | Grammar checking and one-click rewrites on any website, powered by your own free Gemini API key. Private — no account, no server. |
| Category | Workflow & Planning (or Tools) |
| Language | English |

## Description (detailed)

```
GemType checks your writing on every website and fixes it with one click — like Grammarly, but powered by Google's Gemini AI and your own free API key. No account, no subscription, no company server in the middle.

HOW IT WORKS
✔ Type anywhere — Gmail, LinkedIn, X, Reddit, GitHub, any text field
✔ Pause for a second — mistakes get wavy underlines
✔ Click an underline — accept the fix (Ctrl/Cmd+Z always undoes)
✔ After each fix, the whole sentence is automatically re-checked

REWRITE ON DEMAND
Select any text and choose: Improve, Fix grammar, Shorten, Formal, or Casual. Also available from the right-click menu. Rewrites keep your meaning — corrections keep your exact wording.

BRING YOUR OWN KEY (FREE)
GemType uses your personal Gemini API key from Google AI Studio (aistudio.google.com/apikey — free tier, no credit card). Requests go directly from your browser to Google. We never see your text or your key.

PRIVATE BY DESIGN
• No accounts, no tracking, no analytics
• Your key and settings stay on your device
• Your text is sent only to Google's Gemini API
• Turn GemType off globally or per-site in one click

WORKS IN YOUR LANGUAGE
Auto-detects the language you write in, or pin one in settings.

Open source: github.com/riponcm/GemType
Privacy policy: github.com/riponcm/GemType/blob/main/PRIVACY.md
```

## Privacy tab

**Single purpose description:**
```
GemType checks the grammar and spelling of text the user is actively writing in web page text fields and, on the user's request, rewrites selected text — using the Gemini API with the user's own API key.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's Gemini API key and preferences (model, language, disabled sites) locally on the device. Nothing is synced or transmitted. |
| `contextMenus` | Adds the "GemType" right-click menu with rewrite actions (Improve, Fix grammar, Shorten, Formal, Casual) for the selected text. |
| `activeTab` | Reads the current tab's hostname when the user opens the popup, so they can toggle GemType for that specific site. |
| Host permission `https://generativelanguage.googleapis.com/*` | The Gemini API endpoint — the only network destination. Grammar checks and rewrites are sent here with the user's own API key. |
| Content scripts on `<all_urls>` | The extension's single purpose is checking writing in text fields on whatever site the user writes on; this cannot be predicted in advance. The script is inert until the user focuses an editable field, and users can disable specific sites or the whole extension from the popup. |
| Remote code | None. All code is packaged in the extension. |

**Data usage disclosures (check these boxes):**
- Website content (the text the user is editing) → sent to Google's Gemini API for processing → NOT sold, NOT used for unrelated purposes, NOT transferred except to the API the user configured
- No personally identifiable information collected by the developer
- Privacy policy URL: `https://github.com/riponcm/GemType/blob/main/PRIVACY.md`

## Assets

| Asset | File | Status |
|---|---|---|
| Icon 128×128 | `extension/icons/icon128.png` | ✅ auto-included in package |
| Screenshots (1280×800) | `store/screenshots/underlines.png`, `card.png`, `panel.png`, `toolbar.png` | ✅ upload all four |
| Small promo tile 440×280 | `store/promo-tile.png` | ✅ |
| Package | `store/gemtype-v<version>.zip` | ✅ regenerate with `store/build.sh` |

## Review notes (for the reviewer box)

```
This extension requires the user's own Gemini API key. To test:
1. Get a free key at https://aistudio.google.com/apikey
2. Open the extension options, paste the key, click "Save & test key"
3. Open any site with a text field (e.g. the GitHub comment box), type a sentence with errors, pause ~1 second.
No developer server is involved; all requests go directly to generativelanguage.googleapis.com with the user's key.
```
