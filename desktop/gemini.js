// GemType Desktop — Gemini API calls (Node/Electron main process).
// Same bring-your-own-key model as every other GemType surface: requests go
// directly to Google's Gemini API. No GemType server.

'use strict';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const REFINE_PROMPTS = {
  fix: 'Fix all grammar, spelling, and punctuation errors. Change nothing else — keep the wording, tone, and formatting.',
  improve: 'Rewrite the text to be clearer and better written. Keep the meaning, tone, and approximate length.',
  shorten: 'Rewrite the text to be significantly more concise while keeping all key information.',
  formal: 'Rewrite the text in a professional, formal tone suitable for business communication.',
  casual: 'Rewrite the text in a friendly, casual, conversational tone.',
};

const REFINE_SCHEMA = {
  type: 'OBJECT',
  properties: { rewritten: { type: 'STRING' } },
  required: ['rewritten'],
};

async function callGemini(settings, body, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  if (!settings.apiKey) throw new Error('NO_API_KEY');
  const model = settings.model || 'gemini-3.1-flash-lite';
  const res = await doFetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (res.status === 400 || res.status === 403) {
    const d = await res.json().catch(() => null);
    throw new Error('API_KEY_ERROR: ' + ((d && d.error && d.error.message) || 'HTTP ' + res.status));
  }
  if (!res.ok) throw new Error('HTTP_' + res.status);
  const data = await res.json();
  const text = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (typeof text !== 'string') throw new Error('EMPTY_RESPONSE');
  return JSON.parse(text);
}

// Rewrite `text` with the given action. Returns the rewritten string.
async function refine(text, action, settings, fetchImpl) {
  const instruction = REFINE_PROMPTS[action] || REFINE_PROMPTS.fix;
  const lang =
    !settings.language || settings.language === 'auto'
      ? 'Preserve the language of the original text.'
      : `The text is in ${settings.language}; keep it in that language.`;
  const parsed = await callGemini(settings, {
    contents: [{ parts: [{ text: 'TEXT:\n' + text }] }],
    systemInstruction: {
      parts: [{ text: `${instruction} ${lang} Return only the resulting text — no preamble, no quotes, no markdown.` }],
    },
    generationConfig: {
      temperature: action === 'fix' ? 0 : 0.4,
      responseMimeType: 'application/json',
      responseSchema: REFINE_SCHEMA,
    },
  }, fetchImpl);
  if (typeof parsed.rewritten !== 'string' || !parsed.rewritten.trim()) throw new Error('EMPTY_RESPONSE');
  return parsed.rewritten;
}

module.exports = { refine, REFINE_PROMPTS };
