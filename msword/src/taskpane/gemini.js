// GemType for Word — Gemini API calls.
// Same bring-your-own-key model as the browser extension: requests go directly
// from the task pane to Google's Gemini API. No developer server.

(function (root) {
  'use strict';

  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const CHECK_SCHEMA = {
    type: 'OBJECT',
    properties: {
      corrections: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            original: { type: 'STRING' },
            replacement: { type: 'STRING' },
            explanation: { type: 'STRING' },
            type: { type: 'STRING', enum: ['grammar', 'spelling', 'punctuation', 'style'] },
          },
          required: ['original', 'replacement', 'explanation', 'type'],
        },
      },
    },
    required: ['corrections'],
  };

  const REFINE_SCHEMA = {
    type: 'OBJECT',
    properties: { rewritten: { type: 'STRING' } },
    required: ['rewritten'],
  };

  const REFINE_PROMPTS = {
    improve: 'Rewrite the text to be clearer and better written. Keep the meaning, tone, and approximate length.',
    fix: 'Fix all grammar, spelling, and punctuation errors. Change nothing else.',
    shorten: 'Rewrite the text to be significantly more concise while keeping all key information.',
    formal: 'Rewrite the text in a professional, formal tone suitable for business communication.',
    casual: 'Rewrite the text in a friendly, casual, conversational tone.',
  };

  function checkSystemPrompt(settings) {
    const lang =
      !settings.language || settings.language === 'auto'
        ? 'Detect the language of the text and check it in that language.'
        : `The text is in ${settings.language}.`;
    return [
      'You are a thorough proofreader. Find every genuine error in the text: grammar, spelling, punctuation, run-on sentences, and clearly awkward phrasing.',
      'Judge each sentence as a whole. Prefer the MINIMAL edit that makes it correct — keep the author\'s wording and tone; do not rephrase beyond what correctness requires.',
      'For each error, "original" must be the EXACT substring copied from the text (shortest span containing the error, extended with surrounding words only if needed to be unique), and "replacement" the corrected version of that same span.',
      'Keep "original" under 200 characters. Errors must not overlap. Keep "explanation" under 12 words.',
      'If the text has no errors, return an empty corrections array.',
      lang,
    ].join(' ');
  }

  async function callGemini(settings, body) {
    if (!settings.apiKey) throw new Error('NO_API_KEY');
    const model = settings.model || 'gemini-3.1-flash-lite';
    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new Error('RATE_LIMITED');
    if (res.status === 400 || res.status === 403) {
      const d = await res.json().catch(() => null);
      throw new Error('API_KEY_ERROR: ' + (d?.error?.message || 'HTTP ' + res.status));
    }
    if (!res.ok) throw new Error('HTTP_' + res.status);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error('EMPTY_RESPONSE');
    return JSON.parse(text);
  }

  async function check(text, settings) {
    const parsed = await callGemini(settings, {
      contents: [{ parts: [{ text: 'TEXT TO CHECK:\n' + text }] }],
      systemInstruction: { parts: [{ text: checkSystemPrompt(settings) }] },
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: CHECK_SCHEMA,
      },
    });
    return (parsed.corrections || []).filter(
      (c) => c && typeof c.original === 'string' && typeof c.replacement === 'string' &&
        c.original !== c.replacement && text.includes(c.original)
    );
  }

  async function refine(text, action, settings) {
    const instruction = REFINE_PROMPTS[action] || REFINE_PROMPTS.improve;
    const parsed = await callGemini(settings, {
      contents: [{ parts: [{ text: 'TEXT:\n' + text }] }],
      systemInstruction: {
        parts: [{ text: instruction + ' Preserve the original language. Return only the rewritten text — no preamble, no quotes.' }],
      },
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: REFINE_SCHEMA,
      },
    });
    if (typeof parsed.rewritten !== 'string' || !parsed.rewritten.trim()) throw new Error('EMPTY_RESPONSE');
    return parsed.rewritten;
  }

  root.GemTypeAI = { check, refine, REFINE_PROMPTS };
})(typeof window !== 'undefined' ? window : globalThis);
