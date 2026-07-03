// GemType shared content-script utilities.
// All content scripts run in the same isolated world, so top-level bindings
// declared here are visible to overlay.js / refine.js / content.js.

'use strict';

const GT = {};

// Sites (and rich editors like ProseMirror/Quill) opt out of Grammarly with
// these attributes; we honor them too, plus our own.
GT.OPT_OUT_ATTRS = [
  'data-gemtype',
  'data-gramm',
  'data-gramm_editor',
  'data-enable-grammarly',
];

GT.isTextarea = (el) => el instanceof HTMLTextAreaElement;

GT.isTextInput = (el) =>
  el instanceof HTMLInputElement &&
  /^(text|search|email|url)$/i.test(el.type || 'text');

GT.isNativeField = (el) => GT.isTextarea(el) || GT.isTextInput(el);

// Given the deepest focused node, return the editable "field" to manage:
// the textarea/input itself, or the ROOT contenteditable element.
GT.findEditable = function (start) {
  let el = start instanceof Element ? start : start?.parentElement;
  while (el) {
    if (GT.isNativeField(el)) return el;
    if (el.isContentEditable) {
      let root = el;
      while (root.parentElement && root.parentElement.isContentEditable) {
        root = root.parentElement;
      }
      return root;
    }
    el = el.parentElement;
  }
  return null;
};

GT.optedOut = function (field) {
  for (let el = field; el; el = el.parentElement) {
    for (const attr of GT.OPT_OUT_ATTRS) {
      if (el.getAttribute && el.getAttribute(attr) === 'false') return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------------------
// Text extraction with an offset map.
//
// For contenteditable we build ONE canonical walk that both extracts plain
// text and records which text node each character range came from. Every
// other operation (underline geometry, replacement) resolves offsets through
// this same map, so extraction and range-building can never disagree.
//
// map: [{ start, end, node }] — character range [start,end) lives in `node`.
// Synthetic '\n' characters (from <br> and block boundaries) occupy offsets
// covered by no segment.

const GT_BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TD', 'TH', 'TR', 'UL',
]);

GT.extract = function (field) {
  if (GT.isNativeField(field)) {
    return { text: field.value, map: null };
  }
  const map = [];
  let text = '';
  const newlineIfNeeded = () => {
    if (text.length > 0 && !text.endsWith('\n')) text += '\n';
  };
  (function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.data.length > 0) {
        map.push({ start: text.length, end: text.length + node.data.length, node });
        text += node.data;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
    if (tag === 'BR') {
      text += '\n';
      return;
    }
    const isBlock = GT_BLOCK_TAGS.has(tag);
    if (isBlock) newlineIfNeeded();
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
    if (isBlock) newlineIfNeeded();
  })(field);
  return { text, map };
};

// Resolve a plain-text range [start,end) to a DOM Range using the map.
// Returns null if the underlying nodes are gone.
GT.textRangeToDomRange = function (map, start, end) {
  let startSeg = null;
  let endSeg = null;
  for (const seg of map) {
    if (!startSeg && seg.end > start) startSeg = seg;
    if (seg.start < end) endSeg = seg;
  }
  if (!startSeg || !endSeg) return null;
  if (!startSeg.node.isConnected || !endSeg.node.isConnected) return null;
  try {
    const range = document.createRange();
    range.setStart(
      startSeg.node,
      Math.max(0, Math.min(start - startSeg.start, startSeg.node.data.length))
    );
    range.setEnd(
      endSeg.node,
      Math.max(0, Math.min(end - endSeg.start, endSeg.node.data.length))
    );
    return range;
  } catch {
    return null;
  }
};

// Resolve a DOM selection boundary (container, offset) to a plain-text offset.
GT.domPosToTextOffset = function (map, container, offset) {
  if (container.nodeType === Node.TEXT_NODE) {
    for (const seg of map) {
      if (seg.node === container) {
        return seg.start + Math.min(offset, seg.end - seg.start);
      }
    }
  }
  // Element boundary: first mapped text node at/after the boundary point.
  try {
    const probe = document.createRange();
    probe.setStart(container, offset);
    probe.collapse(true);
    for (const seg of map) {
      if (probe.comparePoint(seg.node, 0) >= 0) return seg.start;
    }
  } catch {
    /* different roots etc. */
  }
  return map.length ? map[map.length - 1].end : 0;
};

// ---------------------------------------------------------------------------
// Replacement. execCommand('insertText') is deprecated-but-universal and is
// the only path that (a) preserves the native undo stack and (b) fires
// beforeinput/input so React, Vue, and rich editors treat it as a user edit.

GT.setNativeValue = function (el, value) {
  const proto = GT.isTextarea(el)
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

// Replace [start,end) in the field with `replacement`.
// Returns true on success. Caller must have verified the range is current.
GT.replaceRange = function (field, start, end, replacement) {
  if (GT.isNativeField(field)) {
    field.focus();
    let ok = false;
    try {
      field.setSelectionRange(start, end);
      ok = document.execCommand('insertText', false, replacement);
    } catch {
      ok = false;
    }
    if (!ok) {
      const old = field.value;
      GT.setNativeValue(field, old.slice(0, start) + replacement + old.slice(end));
      try {
        field.setSelectionRange(start + replacement.length, start + replacement.length);
      } catch {
        /* input types that disallow selection */
      }
    }
    return true;
  }

  // contenteditable: re-extract for a fresh map, select the range, insert.
  const { map } = GT.extract(field);
  const range = GT.textRangeToDomRange(map, start, end);
  if (!range) return false;
  field.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, replacement);
  } catch {
    ok = false;
  }
  if (!ok) {
    // Last resort: direct range surgery (no undo entry, may upset editors).
    try {
      range.deleteContents();
      range.insertNode(document.createTextNode(replacement));
      field.dispatchEvent(new Event('input', { bubbles: true }));
      ok = true;
    } catch {
      ok = false;
    }
  }
  return ok;
};

// ---------------------------------------------------------------------------
// Misc

// The sentence containing `index` in `text` (Intl.Segmenter with regex fallback).
GT.sentenceRangeAt = function (text, index) {
  const idx = Math.max(0, Math.min(index, text.length - 1));
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    for (const s of segmenter.segment(text)) {
      const start = s.index;
      const end = s.index + s.segment.length;
      if (idx >= start && idx < end) return { start, end };
      if (start > idx) break;
    }
  } catch {
    /* Intl.Segmenter unavailable */
  }
  // Fallback: expand to the nearest sentence-ish boundaries.
  let start = idx;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  let end = idx;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  return { start, end: Math.min(end + 1, text.length) };
};

GT.debounce = function (fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
};

GT.sendMessage = function (msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError || !res) {
          resolve({ ok: false, error: chrome.runtime.lastError?.message || 'NO_RESPONSE' });
        } else {
          resolve(res);
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
};

// Find offsets for each correction snippet in `text`, first unused occurrence
// wins so duplicate snippets map to distinct ranges.
GT.locateCorrections = function (text, corrections) {
  const used = []; // [start, end)
  const overlaps = (s, e) => used.some(([us, ue]) => s < ue && e > us);
  const located = [];
  for (const c of corrections) {
    let from = 0;
    let start = -1;
    while (true) {
      const idx = text.indexOf(c.original, from);
      if (idx === -1) break;
      if (!overlaps(idx, idx + c.original.length)) {
        start = idx;
        break;
      }
      from = idx + 1;
    }
    if (start === -1) continue;
    const end = start + c.original.length;
    used.push([start, end]);
    located.push({ ...c, start, end });
  }
  located.sort((a, b) => a.start - b.start);
  return located;
};

// ---------------------------------------------------------------------------
// Mirror-div measurement for textarea/<input>: there are no text nodes inside
// a native field, so we replicate its text in a hidden div with identical
// typography and measure ranges there. (Classic technique, cf.
// component/textarea-caret-position.)

const GT_MIRROR_PROPS = [
  'boxSizing', 'width', 'height',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
  'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
  'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize',
  'overflowX', 'overflowY', 'wordBreak',
];

let gtMirror = null;

function gtEnsureMirror(doc) {
  if (!gtMirror || !gtMirror.isConnected) {
    gtMirror = doc.createElement('div');
    gtMirror.setAttribute('aria-hidden', 'true');
    gtMirror.style.position = 'absolute';
    gtMirror.style.top = '-9999px';
    gtMirror.style.left = '-9999px';
    gtMirror.style.visibility = 'hidden';
    gtMirror.style.pointerEvents = 'none';
    doc.body.appendChild(gtMirror);
  }
  return gtMirror;
}

// Measure client-coordinate rects for [start,end) ranges inside a native
// field. `ranges` is [{start, end, key}]; returns Map(key -> DOMRect[]),
// rects already adjusted for the field's own scroll and clipped by caller.
GT.measureNativeRanges = function (field, ranges) {
  const doc = field.ownerDocument;
  const mirror = gtEnsureMirror(doc);
  const cs = getComputedStyle(field);
  for (const p of GT_MIRROR_PROPS) mirror.style[p] = cs[p];
  mirror.style.whiteSpace = GT.isTextarea(field) ? 'pre-wrap' : 'pre';
  mirror.style.overflowWrap = GT.isTextarea(field) ? 'break-word' : 'normal';
  // Match content width exactly; height free so all lines lay out.
  mirror.style.width = `${field.clientWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.overflowX = 'hidden';
  mirror.style.overflowY = 'hidden';

  const value = field.value;
  mirror.textContent = '';
  // Single text node; measure with Ranges over it (handles line wraps).
  const textNode = doc.createTextNode(value.length ? value : '​');
  mirror.appendChild(textNode);

  // Mirror copies the field's border+padding, so text origin differs only by
  // the border-box position and the field's internal scroll.
  const mirrorRect = mirror.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  const dx = fieldRect.left - mirrorRect.left - field.scrollLeft;
  const dy = fieldRect.top - mirrorRect.top - field.scrollTop;

  const out = new Map();
  const r = doc.createRange();
  for (const { start, end, key } of ranges) {
    if (start >= value.length) continue;
    try {
      r.setStart(textNode, Math.min(start, value.length));
      r.setEnd(textNode, Math.min(end, value.length));
      const rects = [];
      for (const rect of r.getClientRects()) {
        rects.push(
          new DOMRect(rect.left + dx, rect.top + dy, rect.width, rect.height)
        );
      }
      out.set(key, rects);
    } catch {
      /* skip */
    }
  }
  return out;
};
