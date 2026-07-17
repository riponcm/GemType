// Node test for desktop/gemini.js with a stubbed fetch — no Electron, no key.
'use strict';
const assert = require('assert');
const AI = require('../gemini.js');

function fakeFetch(responder) {
  return async (url, opts) => {
    const body = JSON.parse(opts.body);
    return responder(url, opts, body);
  };
}

const envelope = (payload) => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
});

(async () => {
  // 1. refine returns the rewritten text and sends the right model + key
  let seen = {};
  const f1 = fakeFetch((url, opts, body) => {
    seen = { url, headers: opts.headers, body };
    return envelope({ rewritten: "She doesn't like it." });
  });
  const out = await AI.refine('She dont like it.', 'fix', { apiKey: 'K', model: 'gemini-3.1-flash-lite' }, f1);
  assert.strictEqual(out, "She doesn't like it.");
  assert.ok(seen.url.includes('gemini-3.1-flash-lite:generateContent'), 'model in URL');
  assert.strictEqual(seen.headers['x-goog-api-key'], 'K', 'key header');
  assert.strictEqual(seen.body.generationConfig.temperature, 0, 'fix uses temperature 0');
  assert.ok(seen.body.systemInstruction.parts[0].text.includes('Fix all grammar'), 'fix prompt');

  // 2. non-fix action uses its prompt and non-zero temperature
  const f2 = fakeFetch((u, o, body) => {
    assert.ok(body.systemInstruction.parts[0].text.includes('formal'), 'formal prompt');
    assert.strictEqual(body.generationConfig.temperature, 0.4);
    return envelope({ rewritten: 'Good day.' });
  });
  assert.strictEqual(await AI.refine('yo', 'formal', { apiKey: 'K' }, f2), 'Good day.');

  // 3. error mapping
  await assert.rejects(() => AI.refine('x', 'fix', { apiKey: '' }, f1), /NO_API_KEY/);
  const f429 = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(() => AI.refine('x', 'fix', { apiKey: 'K' }, f429), /RATE_LIMITED/);
  const f403 = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'bad key' } }) });
  await assert.rejects(() => AI.refine('x', 'fix', { apiKey: 'K' }, f403), /API_KEY_ERROR: bad key/);

  // 4. language pinning
  const f3 = fakeFetch((u, o, body) => {
    assert.ok(body.systemInstruction.parts[0].text.includes('in Bengali'), 'language pinned');
    return envelope({ rewritten: 'ok' });
  });
  await AI.refine('x', 'improve', { apiKey: 'K', language: 'Bengali' }, f3);

  console.log('gemini.test.js: all assertions passed');
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
