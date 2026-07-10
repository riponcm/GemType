# GemType for Microsoft Word

An Office task-pane add-in that brings GemType's grammar checking and AI
rewrites into Word — powered by your own free Google Gemini API key. Same
bring-your-own-key, no-server model as the browser extension.

Works in **Word for Windows, Mac, and Word on the web**.

## What it does

- **Check document** — reads your document, finds grammar/spelling/style issues
  with Gemini, and lists them with one-click **Accept**.
- **Rewrite selected text** — select text and choose **Improve, Fix, Shorten,
  Formal,** or **Casual**; the selection is replaced in place (Ctrl/Cmd+Z undoes).
- **Bring your own key** — your Gemini key is stored on your device and sent
  only to Google's Gemini API. There is no GemType server.

```
msword/
├── manifest.xml            the Office add-in manifest (ribbon button + task pane)
├── server.js               tiny HTTPS dev server (Office requires HTTPS)
├── package.json            dev scripts (certs, start, sideload, validate)
├── assets/                 add-in icons
├── src/taskpane/
│   ├── taskpane.html/css/js  the task pane UI + Word (Office.js) integration
│   └── gemini.js             Gemini API calls (shared logic, no Office deps)
└── test/harness.html       run the UI in a browser with a mocked Word + Gemini
```

## Run it locally (developer mode)

Prerequisites: Node.js and Microsoft Word (desktop or web).

```bash
cd msword
npm install
npm run certs      # installs a trusted localhost HTTPS certificate (one time)
npm start          # serves the add-in at https://localhost:3000
```

Then **sideload** the add-in into Word:

- **Easiest (Mac & Windows):** in a second terminal, `npm run sideload` — it
  opens Word with the add-in loaded.
- **Manually in Word:** Insert → **Add-ins** → **My Add-ins** → **Upload My
  Add-in** → choose `manifest.xml`.
- **Word on the web:** Insert → **Add-ins** → **Upload My Add-in** →
  `manifest.xml`.

A **GemType** button appears on the Home ribbon; click it to open the panel.
First run: open Settings (gear), paste your free key from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey), Save & test.

## Test the UI without Word or a key

```bash
# from the repo root
python3 -m http.server 8377
open http://localhost:8377/msword/test/harness.html
```

`test/harness.html` stubs Office.js and the Gemini API, so you can exercise the
check / accept / rewrite logic in a normal browser.

## Publishing

Host the `msword/` files on any HTTPS static host (Cloudflare Pages, Azure
Static Web Apps, GitHub Pages, etc.), then in `manifest.xml` replace every
`https://localhost:3000` with your hosted URL. Submit the manifest to
**Microsoft AppSource** (Partner Center) for public distribution, or deploy it
through your Microsoft 365 admin center for an organization.

## How it works

- The task pane is a web app running in a webview inside Word.
- All Word interaction goes through **Office.js** (`Word.run`): it reads the
  document body / selection, and applies fixes with `body.search()` +
  `range.insertText(..., Replace)`. That code is isolated in a `WordAdapter`
  object so the rest of the logic is testable.
- Corrections come back from Gemini as structured JSON (exact snippet +
  replacement), located in the document via search.

## Notes & limits

- **Word's `search()` matches within a paragraph** and up to ~255 characters,
  so corrections are kept to short, in-sentence snippets (the prompt enforces
  this).
- The **Annotation API** (native squiggly underlines + popup cards, like the
  browser overlay) is a natural next step on Word versions that support it;
  this MVP uses the task-pane list, which works everywhere.
- Requires a free Gemini API key. Google Docs-style canvas issues don't apply
  here — Word gives us real text via Office.js.
