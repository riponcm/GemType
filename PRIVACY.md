# GemType Privacy Policy

*Last updated: July 2, 2026*

GemType is a browser extension that checks grammar and rewrites text using
Google's Gemini API. It is designed so that **we (the developers) never see,
receive, or store any of your data**. There is no GemType server.

## What data is processed, and where it goes

- **Text you are actively editing.** When you type in a text field on a
  website (and GemType is enabled for that site), the text of that field is
  sent to **Google's Gemini API** (`generativelanguage.googleapis.com`) to
  detect errors or produce a rewrite you requested. This is the extension's
  single purpose. The request is made directly from your browser to Google
  using **your own API key** — it never passes through any server of ours.
  Google's handling of this data is governed by the
  [Google API Terms](https://developers.google.com/terms) and the
  [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms).
- **Your Gemini API key.** Stored only on your device in
  `chrome.storage.local`. It is not synced through your Google account and is
  sent only to `generativelanguage.googleapis.com` as authentication.
- **Your settings** (model choice, language, disabled sites, on/off state).
  Stored only on your device in `chrome.storage.local`.

## What we do NOT do

- No analytics, telemetry, or usage tracking of any kind
- No accounts, no sign-up, no cookies
- No data sold, shared, or transmitted to anyone other than Google's Gemini
  API as described above
- No browsing-history collection; the extension reads only the text fields
  you actively edit, and only on sites where it is enabled
- **Password fields are never read** (`<input type="password">` is excluded
  by design), and fields marked as payment (`autocomplete="cc-*"`),
  one-time-code, or password-manager fields are skipped as well
- No remote code — all extension code ships in the package

## Your controls

- Disable GemType globally or per-site from the toolbar popup
- Website owners can opt fields out with `data-gemtype="false"`
  (`data-gramm="false"` is honored as well)
- Uninstalling the extension deletes all stored settings, including your API
  key
- Avoid using GemType in fields containing passwords or other secrets; text
  in checked fields is processed by Google's cloud API

## Permissions explained

| Permission | Why |
|---|---|
| `storage` | Save your API key and settings locally |
| `contextMenus` | The right-click "GemType" rewrite menu |
| `generativelanguage.googleapis.com` | The Gemini API endpoint — the only network destination |
| Content scripts on all sites | Grammar checking must run inside the text fields of whatever site you write on; it stays inert until you focus a field |

## Contact

Questions or concerns: email **support@matily.org**, or open an issue on the
[GitHub repository](https://github.com/riponcm/GemType/issues) once it is
public.
