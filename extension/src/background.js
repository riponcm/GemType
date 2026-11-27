// GemType background service worker.
// Owns all Gemini API traffic: the content script never talks to the network
// directly (page CSP would break it); everything is routed through here.

// Cross-browser: alias Firefox's promise-based `browser` to `chrome`. No-op in
// Chrome. (In Firefox this file runs as an event-page background script.)
if (typeof browser !== 'undefined') globalThis.chrome = browser;

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
// Models Google has shut down or restricted; stored settings move off them.
const RETIRED_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

const DEFAULT_RULES = {
  myStyle: '', // the user's own style, for the "My" rewrite
  englishVariant: 'us', // the "English" rewrite: us | uk
  ignoreCase: false,
  ignorePunctuation: false,
  informal: false,
  spelling: 'auto', // auto | us | uk
  custom: '',
};

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: DEFAULT_MODEL,
  enabled: true,
  disabledSites: [],
  language: 'auto',
  tone: 'neutral',
  checkMode: 'demand', // demand | auto | timed
  autoUntil: 0, // timed mode: auto-check until this timestamp
  rules: DEFAULT_RULES,
};

// ---------------------------------------------------------------------------
// Settings

async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  const s = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  s.rules = { ...DEFAULT_RULES, ...(s.rules || {}) };
  return s;
}

// ---------------------------------------------------------------------------
// Usage stats: counts only, never text. Kept in this browser, never uploaded.

const STATS_DAYS = 30;

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function emptyBucket() {
  return { requests: 0, tokens: 0, ms: 0, words: 0, fixes: 0, rewrites: 0, rw: {} };
}

let statsChain = Promise.resolve();

// Serialize read-modify-write so concurrent bumps never lose a count.
function updateStats(fn) {
  statsChain = statsChain
    .then(async () => {
      const { stats } = await chrome.storage.local.get('stats');
      const s = stats || { days: {}, total: emptyBucket(), limit: null };
      const key = dayKey();
      s.days[key] = { ...emptyBucket(), ...(s.days[key] || {}) };
      fn(s, s.days[key]);
      const keys = Object.keys(s.days).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - STATS_DAYS))) {
        delete s.days[k];
      }
      await chrome.storage.local.set({ stats: s });
    })
    .catch(() => {});
  return statsChain;
}

function bump(fields) {
  return updateStats((s, day) => {
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'rw') {
        day.rw[v] = (day.rw[v] || 0) + 1;
        s.total.rw = s.total.rw || {};
        s.total.rw[v] = (s.total.rw[v] || 0) + 1;
      } else {
        day[k] = (day[k] || 0) + v;
        s.total[k] = (s.total[k] || 0) + v;
      }
    }
  });
}

const countWords = (text) => (text.match(/\S+/g) || []).length;

// ---------------------------------------------------------------------------
// Response cache + in-flight dedup. The SW may be killed at any time, which
// just empties the cache — that's fine, it's a cost optimization only.

const cache = new Map(); // key -> { corrections }
const inFlight = new Map(); // key -> Promise
const CACHE_MAX = 200;

function cacheKey(kind, settings, text) {
  return `${kind}:${settings.model}:${JSON.stringify(settings.rules)}:${text}`;
}

function cachePut(key, value) {
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
}

// ---------------------------------------------------------------------------
// Rate limiting: never run more than one Gemini call at a time, and back off
// on 429 so a free-tier key degrades gracefully instead of erroring.

let backoffUntil = 0;
let queue = Promise.resolve();
const dailyBlocked = new Map(); // model -> timestamp the daily quota resets

function enqueue(fn) {
  const run = queue.then(fn, fn);
  // Keep the chain alive even when a call rejects.
  queue = run.catch(() => {});
  return run;
}

// Gemini's daily free quota resets at midnight Pacific time.
function nextPacificMidnight(now = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(now))
      .map((p) => [p.type, Number(p.value)])
  );
  const elapsed = (parts.hour * 3600 + parts.minute * 60 + parts.second) * 1000;
  return now + 86400000 - elapsed;
}

// A 429 says which quota ran out: per-minute (wait seconds) or per-day.
function parseLimit(detail) {
  const details = detail?.error?.details || [];
  const failure = details.find((d) => /QuotaFailure/.test(d['@type'] || ''));
  const quotaId = failure?.violations?.[0]?.quotaId || '';
  const retry = details.find((d) => /RetryInfo/.test(d['@type'] || ''));
  const retrySec = parseFloat(retry?.retryDelay) || 0;
  return { daily: /PerDay/i.test(quotaId), retrySec };
}

async function callGemini(settings, body) {
  const blocked = dailyBlocked.get(settings.model);
  if (blocked && Date.now() < blocked) throw new Error('DAILY_LIMIT');

  const wait = backoffUntil - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const started = Date.now();
  const url = `${API_BASE}/${encodeURIComponent(settings.model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const { daily, retrySec } = parseLimit(await res.json().catch(() => null));
    const limit = { kind: daily ? 'day' : 'minute', model: settings.model, at: Date.now() };
    if (daily) {
      limit.resetAt = nextPacificMidnight();
      dailyBlocked.set(settings.model, limit.resetAt);
    } else {
      backoffUntil = Date.now() + Math.max(retrySec * 1000, 20000);
      limit.resetAt = backoffUntil;
    }
    updateStats((s) => { s.limit = limit; });
    throw new Error(daily ? 'DAILY_LIMIT' : 'RATE_LIMITED');
  }
  if (res.status === 400 || res.status === 403) {
    const detail = await res.json().catch(() => null);
    const msg = detail?.error?.message || `HTTP ${res.status}`;
    throw new Error(`API_KEY_ERROR: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }

  backoffUntil = 0;
  const data = await res.json();
  bump({
    requests: 1,
    tokens: data?.usageMetadata?.totalTokenCount || 0,
    ms: Date.now() - started,
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('EMPTY_RESPONSE');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Custom rules: the user's rules override the built-in instructions.

function rulesPrompt(rules) {
  const lines = [];
  if (rules.ignoreCase) lines.push('- Never change capitalization. Lowercase sentence starts, names and "i" are intentional.');
  if (rules.ignorePunctuation) lines.push('- Never add, remove or change punctuation.');
  if (rules.informal) lines.push('- Informal writing is intentional: keep slang, contractions, abbreviations and chat style.');
  if (rules.spelling === 'us') lines.push('- Use American English spelling (color, organize).');
  if (rules.spelling === 'uk') lines.push('- Use British English spelling (colour, organise).');
  const custom = (rules.custom || '').trim().slice(0, 2000);
  if (custom) lines.push(...custom.split('\n').filter((l) => l.trim()).map((l) => `- ${l.trim()}`));
  if (!lines.length) return '';
  return [
    '',
    'USER RULES — the user set these. They override every instruction above; never suggest a change that breaks one:',
    ...lines,
  ].join('\n');
}

const stripPunct = (s) => s.replace(/[\p{P}\s]+/gu, '');

// Enforce the toggle rules even when the model ignores them.
function obeysRules(c, rules) {
  if (rules.ignoreCase && c.original.toLowerCase() === c.replacement.toLowerCase()) {
    return false;
  }
  if (rules.ignorePunctuation) {
    if (c.type === 'punctuation') return false;
    if (stripPunct(c.original) === stripPunct(c.replacement)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Grammar checking

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
          type: {
            type: 'STRING',
            enum: ['grammar', 'spelling', 'punctuation', 'style'],
          },
        },
        required: ['original', 'replacement', 'explanation', 'type'],
      },
    },
  },
  required: ['corrections'],
};

function checkSystemPrompt(settings) {
  const lang =
    settings.language === 'auto'
      ? 'Detect the language of the text and check it in that language.'
      : `The text is in ${settings.language}.`;
  return [
    'You are a thorough proofreader embedded in a browser extension. Find EVERY error in the text.',
    'Error categories to report:',
    '- grammar: subject-verb agreement, wrong verb tense or form, pronoun case, wrong or missing articles/prepositions, word order, and RUN-ON SENTENCES or comma splices — two sentences joined without punctuation is always an error (fix by adding the missing period or comma, e.g. "inviting me I think" -> "inviting me. I think").',
    '- spelling: misspelled words and wrong homophones (their/there, you\'re/your, its/it\'s).',
    '- punctuation: missing, extra, or misplaced punctuation; wrong spacing around punctuation (e.g. a space before a period like "this ." -> "this."); missing capitalization at sentence starts.',
    '- style: phrasing that is clearly awkward, confusing, or unidiomatic — something a fluent writer would not write (e.g. "a good idea how to implement this" -> "a good idea; how should we implement this?"). Suggest a natural rewording.',
    'Do NOT flag: personal names, slang or informal tone that is written correctly, or pure taste preferences.',
    'Judge every SENTENCE as a whole, not just individual words: sentence boundaries, fragments, missing subjects or verbs, and word order all count.',
    'Always prefer the MINIMAL edit that makes the sentence grammatically correct — keep the author\'s original words, order, and tone; never rephrase beyond what correctness requires.',
    'For each error, "original" must be the EXACT substring copied verbatim from the text (the shortest span containing the error, extended with surrounding words only if needed to make it unique), and "replacement" the corrected version of that same span.',
    'Errors must not overlap: if problems are adjacent, merge them into one correction spanning both.',
    'Keep "explanation" under 12 words.',
    'If the text truly has no errors, return an empty corrections array.',
    lang,
  ].join('\n') + rulesPrompt(settings.rules);
}

async function checkText(text) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error('NO_API_KEY');

  const key = cacheKey('check', settings, text);
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = enqueue(async () => {
    const raw = await callGemini(settings, {
      contents: [{ parts: [{ text: `TEXT TO CHECK:\n${text}` }] }],
      systemInstruction: { parts: [{ text: checkSystemPrompt(settings) }] },
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: CHECK_SCHEMA,
      },
    });
    bump({ words: countWords(text) });
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('BAD_JSON');
    }
    const corrections = (parsed.corrections || []).filter(
      (c) =>
        c &&
        typeof c.original === 'string' &&
        typeof c.replacement === 'string' &&
        c.original !== c.replacement &&
        text.includes(c.original) &&
        obeysRules(c, settings.rules)
    );
    const result = { corrections };
    cachePut(key, result);
    return result;
  }).finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Refine (rewrite selection)

const KEEP_LANGUAGE =
  ' Preserve the language of the original text. Return only the rewritten text — no preamble, no quotes, no markdown.';

// Each returns the system instruction for one rewrite action.
const REFINE_PROMPTS = {
  fix: () =>
    "Fix all grammar, spelling, and punctuation errors. Keep the author's own words, tone, and style exactly; change nothing else." +
    KEEP_LANGUAGE,
  improve: () =>
    'Rewrite the text to be clearer and better written. Keep the meaning, tone, and approximate length.' +
    KEEP_LANGUAGE,
  shorten: () =>
    'Rewrite the text to be significantly more concise while keeping all key information.' +
    KEEP_LANGUAGE,
  formal: () =>
    'Rewrite the text in a professional, formal tone suitable for business communication.' +
    KEEP_LANGUAGE,
  casual: () => 'Rewrite the text in a friendly, casual, conversational tone.' + KEEP_LANGUAGE,
  my: (rules) => {
    const style = (rules.myStyle || '').trim().slice(0, 2000);
    if (!style) throw new Error('NO_STYLE');
    return (
      `Rewrite the text in the user's own writing style, which the user describes like this:\n---\n${style}\n---\nKeep the meaning and every fact.` +
      KEEP_LANGUAGE
    );
  },
  english: (rules) => {
    const variant = rules.englishVariant === 'uk' ? 'British' : 'American';
    return `Translate the text into natural, fluent ${variant} English, whatever language or script it is written in (including romanized text such as Banglish or Hinglish). If it is already English, correct it into natural ${variant} English. Keep the meaning, tone, names, and line breaks. Return only the English text — no preamble, no quotes, no markdown.`;
  },
};

const REFINE_SCHEMA = {
  type: 'OBJECT',
  properties: { rewritten: { type: 'STRING' } },
  required: ['rewritten'],
};

async function refineText(text, action, fresh = false) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error('NO_API_KEY');
  const kind = REFINE_PROMPTS[action] ? action : 'improve';
  const instruction = REFINE_PROMPTS[kind](settings.rules);

  const key = cacheKey(`refine:${kind}`, settings, text);
  if (!fresh && cache.has(key)) return cache.get(key); // "Try again" skips the cache

  return enqueue(async () => {
    const raw = await callGemini(settings, {
      contents: [{ parts: [{ text: `TEXT:\n${text}` }] }],
      systemInstruction: {
        parts: [
          {
            text: instruction + rulesPrompt(settings.rules),
          },
        ],
      },
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: REFINE_SCHEMA,
      },
    });
    bump({ rewrites: 1, rw: kind });
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('BAD_JSON');
    }
    if (typeof parsed.rewritten !== 'string' || !parsed.rewritten.trim()) {
      throw new Error('EMPTY_RESPONSE');
    }
    const result = { rewritten: parsed.rewritten };
    cachePut(key, result);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Message routing

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    CHECK_TEXT: () => checkText(msg.text),
    REFINE_TEXT: () => refineText(msg.text, msg.action, !!msg.fresh),
    GET_SETTINGS: () => getSettings(),
    OPEN_OPTIONS: () =>
      msg.hash
        ? chrome.tabs.create({ url: chrome.runtime.getURL(`src/options.html#${msg.hash}`) }).then(() => true)
        : chrome.runtime.openOptionsPage().then(() => true),
    STAT_FIX: () => bump({ fixes: 1 }).then(() => true),
  };
  const handler = handlers[msg.type];
  if (!handler) return false;

  handler()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
  return true; // async response
});

// ---------------------------------------------------------------------------
// Keyboard shortcut: check the focused text box now.

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'check-now') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'CHECK_NOW' }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Context menu: refine the current selection from a right-click.

const MENU_ACTIONS = [
  ['fix', 'Fix grammar & spelling'],
  ['improve', 'Improve writing'],
  ['shorten', 'Shorten'],
  ['formal', 'Make formal'],
  ['casual', 'Make casual'],
  ['my', 'In my style'],
  ['english', 'Translate to English'],
];

// Upgrades: move off retired models, and keep live checking for people who
// already had it (new installs start On demand) with a one-time tip.
async function migrateSettings(reason) {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) return;
  const next = { ...settings };
  if (RETIRED_MODELS.includes(next.model)) next.model = DEFAULT_MODEL;
  if (reason === 'update' && !next.checkMode) {
    next.checkMode = 'auto';
    next.showModeTip = true;
  }
  await chrome.storage.local.set({ settings: next });
}

chrome.runtime.onInstalled.addListener((details) => {
  migrateSettings(details.reason).catch(() => {});
  // When GemType arrived (for the share/rate prompt), and a welcome page for
  // brand-new installs.
  chrome.storage.local.get('meta').then(({ meta }) => {
    if (!meta?.installedAt) {
      chrome.storage.local.set({ meta: { ...(meta || {}), installedAt: Date.now() } });
    }
  });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome.html') }).catch(() => {});
  }
  // Safari on iPhone and iPad has no context menus.
  chrome.contextMenus?.removeAll(() => {
    chrome.contextMenus.create({
      id: 'gemtype-root',
      title: 'GemType',
      contexts: ['selection'],
    });
    for (const [id, title] of MENU_ACTIONS) {
      chrome.contextMenus.create({
        id: `gemtype-${id}`,
        parentId: 'gemtype-root',
        title,
        contexts: ['selection'],
      });
    }
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (!tab?.id || !info.menuItemId.startsWith('gemtype-')) return;
  const action = info.menuItemId.replace('gemtype-', '');
  if (action === 'root') return;
  chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_REFINE', action }).catch(() => {});
});
