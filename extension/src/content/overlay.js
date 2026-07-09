// GemType overlay: wavy underlines, per-field badge, and the suggestion card.
// Everything renders inside ONE shadow-DOM host appended to the document, so
// page CSS cannot touch it and we never mutate the host page's editors.

'use strict';

GT.ui = (() => {
  let host = null;
  let root = null;

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

    .gt-layer {
      position: fixed;
      overflow: hidden;
      pointer-events: none;
      z-index: 1;
    }
    .gt-underline {
      position: absolute;
      pointer-events: auto;
      cursor: pointer;
      background-repeat: repeat-x;
      background-position: left bottom;
      background-size: 6px 3px;
    }
    .gt-underline.gt-critical {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q1.5 0.5 3 2.5 T6 2.5' stroke='%23e5484d' stroke-width='1.4' fill='none'/%3E%3C/svg%3E");
    }
    .gt-underline.gt-style {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 Q1.5 0.5 3 2.5 T6 2.5' stroke='%233b82f6' stroke-width='1.4' fill='none'/%3E%3C/svg%3E");
    }

    .gt-badge {
      position: fixed;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      background: #10a37f;
      box-shadow: 0 1px 4px rgba(0,0,0,.25);
      cursor: pointer;
      user-select: none;
      z-index: 3;
      transition: transform .12s ease;
    }
    .gt-badge:hover { transform: scale(1.1); }
    .gt-badge.gt-count { background: #e5484d; }
    .gt-badge.gt-clean { background: #10a37f; }
    .gt-badge.gt-error { background: #b45309; }
    .gt-badge.gt-off { background: #9ca3af; }
    .gt-badge .gt-spin {
      width: 12px; height: 12px;
      border: 2px solid rgba(255,255,255,.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: gt-rot .8s linear infinite;
    }
    @keyframes gt-rot { to { transform: rotate(360deg); } }

    .gt-card {
      position: fixed;
      z-index: 4;
      width: 300px;
      max-height: 340px;
      overflow-y: auto;
      background: #fff;
      color: #1f2328;
      border: 1px solid #e2e4e8;
      border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.18);
      font-size: 13px;
      line-height: 1.45;
    }
    .gt-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid #eef0f2;
      font-weight: 600;
      font-size: 12px;
      color: #6b7280;
    }
    .gt-card-header .gt-close { cursor: pointer; padding: 2px 6px; border-radius: 4px; }
    .gt-card-header .gt-close:hover { background: #f3f4f6; }
    .gt-item { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    .gt-item:last-child { border-bottom: none; }
    .gt-item .gt-diff { margin-bottom: 4px; }
    .gt-item .gt-old { color: #b91c1c; text-decoration: line-through; }
    .gt-item .gt-arrow { color: #9ca3af; margin: 0 5px; }
    .gt-item .gt-new { color: #047857; font-weight: 600; }
    .gt-item .gt-why { color: #6b7280; font-size: 12px; margin-bottom: 7px; }
    .gt-item .gt-actions { display: flex; gap: 6px; }
    .gt-btn {
      border: none;
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .gt-btn-accept { background: #10a37f; color: #fff; }
    .gt-btn-accept:hover { background: #0d8a6a; }
    .gt-btn-dismiss { background: #f3f4f6; color: #4b5563; }
    .gt-btn-dismiss:hover { background: #e5e7eb; }
    .gt-msg { padding: 12px; color: #4b5563; }
    .gt-msg a { color: #2563eb; cursor: pointer; text-decoration: underline; }

    .gt-refine-row {
      padding: 10px 12px;
      border-top: 1px solid #eef0f2;
    }
    .gt-refine-label {
      font-size: 11px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 7px;
    }
    .gt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .gt-chip {
      border: 1px solid #d1d5db;
      background: #fff;
      color: #374151;
      border-radius: 999px;
      padding: 4px 11px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .gt-chip:hover { background: #10a37f; border-color: #10a37f; color: #fff; }

    .gt-toolbar {
      position: fixed;
      z-index: 4;
      display: flex;
      align-items: center;
      gap: 2px;
      background: #1f2328;
      border-radius: 8px;
      padding: 3px;
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
    }
    .gt-toolbar button {
      border: none;
      background: transparent;
      color: #e5e7eb;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 9px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
    }
    .gt-toolbar button:hover { background: #3a3f45; color: #fff; }
    .gt-toolbar .gt-tb-spin {
      width: 12px; height: 12px; margin: 0 10px;
      border: 2px solid rgba(255,255,255,.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: gt-rot .8s linear infinite;
    }

    .gt-toast {
      position: fixed;
      z-index: 5;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2328;
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
      animation: gt-fade .2s ease;
    }
    @keyframes gt-fade { from { opacity: 0 } to { opacity: 1 } }
  `;

  function ensureRoot() {
    if (root && host.isConnected) return root;
    host = document.createElement('gemtype-ext');
    // The host takes no space and no events. Every declaration is inline
    // !important because web-component sites (Reddit et al.) ship rules like
    // `:not(:defined) { visibility: hidden }` that match unknown custom
    // elements — ours included. Inline !important beats any page stylesheet.
    for (const [prop, val] of [
      ['position', 'fixed'],
      ['top', '0'],
      ['left', '0'],
      ['width', '0'],
      ['height', '0'],
      ['z-index', '2147483646'],
      ['display', 'block'],
      ['visibility', 'visible'],
      ['opacity', '1'],
      ['transform', 'none'],
      ['filter', 'none'],
      ['pointer-events', 'auto'],
    ]) {
      host.style.setProperty(prop, val, 'important');
    }
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
    (document.body || document.documentElement).appendChild(host);
    return root;
  }

  function el(tag, className, parent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  let toastTimer = null;
  function toast(text) {
    const r = ensureRoot();
    let t = r.querySelector('.gt-toast');
    if (!t) t = el('div', 'gt-toast', r);
    t.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2500);
  }

  return { ensureRoot, el, toast };
})();

// ---------------------------------------------------------------------------
// The single shared suggestion card.

GT.card = (() => {
  let cardEl = null;
  let currentOwner = null;

  function close() {
    if (cardEl) cardEl.remove();
    cardEl = null;
    currentOwner = null;
  }

  // items: corrections to show; owner: FieldOverlay; anchor: DOMRect (viewport)
  function open(owner, items, anchor, opts = {}) {
    const root = GT.ui.ensureRoot();
    close();
    currentOwner = owner;
    cardEl = GT.ui.el('div', 'gt-card', root);
    cardEl.addEventListener('mousedown', (e) => e.preventDefault()); // keep field focus

    const header = GT.ui.el('div', 'gt-card-header', cardEl);
    const title = GT.ui.el('span', '', header);
    title.textContent = opts.title || 'GemType suggestions';
    const closeBtn = GT.ui.el('span', 'gt-close', header);
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);

    if (opts.message) {
      const msg = GT.ui.el('div', 'gt-msg', cardEl);
      // Build the message from structured parts (string | {bold} | {link}) with
      // DOM nodes — no innerHTML, so nothing is ever parsed as markup.
      const parts = Array.isArray(opts.message) ? opts.message : [opts.message];
      for (const p of parts) {
        if (typeof p === 'string') {
          msg.appendChild(document.createTextNode(p));
        } else if (p.bold != null) {
          const b = document.createElement('b');
          b.textContent = p.bold;
          msg.appendChild(b);
        } else if (p.link != null) {
          const a = GT.ui.el('a', '', msg);
          a.textContent = p.link;
          a.addEventListener('click', () => {
            GT.sendMessage({ type: 'OPEN_OPTIONS' });
            close();
          });
        }
      }
    }

    for (const c of items) {
      const item = GT.ui.el('div', 'gt-item', cardEl);
      const diff = GT.ui.el('div', 'gt-diff', item);
      const oldSpan = GT.ui.el('span', 'gt-old', diff);
      oldSpan.textContent = c.original;
      GT.ui.el('span', 'gt-arrow', diff).textContent = '→';
      const newSpan = GT.ui.el('span', 'gt-new', diff);
      newSpan.textContent = c.replacement;
      const why = GT.ui.el('div', 'gt-why', item);
      why.textContent = c.explanation || c.type;
      const actions = GT.ui.el('div', 'gt-actions', item);
      const accept = GT.ui.el('button', 'gt-btn gt-btn-accept', actions);
      accept.textContent = 'Accept';
      accept.addEventListener('click', () => {
        owner.controller.accept(c);
        item.remove();
        if (!cardEl.querySelector('.gt-item')) close();
      });
      const dismiss = GT.ui.el('button', 'gt-btn gt-btn-dismiss', actions);
      dismiss.textContent = 'Dismiss';
      dismiss.addEventListener('click', () => {
        owner.controller.dismiss(c);
        item.remove();
        if (!cardEl.querySelector('.gt-item')) close();
      });
    }

    // Whole-text refine actions, always one click from the badge.
    if (opts.refineField) {
      const row = GT.ui.el('div', 'gt-refine-row', cardEl);
      GT.ui.el('div', 'gt-refine-label', row).textContent = 'Refine the whole text';
      const chips = GT.ui.el('div', 'gt-chips', row);
      for (const [action, label] of [
        ['improve', '✨ Improve'],
        ['fix', 'Fix grammar'],
        ['shorten', 'Shorten'],
        ['formal', 'Formal'],
        ['casual', 'Casual'],
      ]) {
        const chip = GT.ui.el('button', 'gt-chip', chips);
        chip.textContent = label;
        chip.addEventListener('click', () => {
          const field = opts.refineField;
          close();
          GT.refine.runOnField(field, action);
        });
      }
    }

    // Position near the anchor, clamped to the viewport.
    const W = 300;
    const margin = 8;
    let left = Math.min(Math.max(anchor.left, margin), innerWidth - W - margin);
    cardEl.style.left = `${left}px`;
    cardEl.style.top = '0px';
    // Measure after insertion for height-aware placement.
    const h = cardEl.getBoundingClientRect().height;
    let top = anchor.bottom + 6;
    if (top + h > innerHeight - margin) top = Math.max(margin, anchor.top - h - 6);
    cardEl.style.top = `${top}px`;
  }

  function ownedBy(owner) {
    return currentOwner === owner && !!cardEl;
  }

  return { open, close, ownedBy };
})();

// ---------------------------------------------------------------------------
// Per-field overlay: underline layer + badge.

GT.FieldOverlay = class {
  constructor(field, controller) {
    this.field = field;
    this.controller = controller;
    this.corrections = [];
    this.state = 'idle'; // idle | checking | count | clean | error
    this.errorKind = null;

    const root = GT.ui.ensureRoot();
    this.layer = GT.ui.el('div', 'gt-layer', root);
    this.badge = GT.ui.el('div', 'gt-badge', root);
    this.badge.style.display = 'none';
    this.badge.addEventListener('mousedown', (e) => e.preventDefault());
    this.badge.addEventListener('click', () => this.onBadgeClick());

    this._rafPending = false;
    this.reposition = this.reposition.bind(this);
    this.scheduleReposition = this.scheduleReposition.bind(this);

    window.addEventListener('scroll', this.scheduleReposition, true);
    window.addEventListener('resize', this.scheduleReposition, true);
    field.addEventListener('scroll', this.scheduleReposition, true);

    // Reconciliation poll: layout can change in ways we can't observe.
    this.poll = setInterval(() => {
      if (!this.field.isConnected) {
        this.controller.destroy();
        return;
      }
      this.reposition();
    }, 1000);
  }

  setState(state, errorKind = null) {
    this.state = state;
    this.errorKind = errorKind;
    this.renderBadge();
  }

  setCorrections(corrections) {
    this.corrections = corrections;
    this.setState(corrections.length ? 'count' : 'clean');
    this.reposition();
  }

  visible() {
    const f = this.field;
    if (!f.isConnected) return false;
    const r = f.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
      return false;
    }
    return true;
  }

  scheduleReposition() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.reposition();
    });
  }

  reposition() {
    if (!this.visible()) {
      this.layer.style.display = 'none';
      this.badge.style.display = 'none';
      return;
    }
    const rect = this.field.getBoundingClientRect();
    this.layer.style.display = 'block';
    this.layer.style.left = `${rect.left}px`;
    this.layer.style.top = `${rect.top}px`;
    this.layer.style.width = `${rect.width}px`;
    this.layer.style.height = `${rect.height}px`;
    this.renderUnderlines(rect);
    this.renderBadge(rect);
  }

  renderUnderlines(fieldRect) {
    this.layer.textContent = '';
    if (!this.corrections.length) return;

    // Gather viewport-coordinate rects per correction.
    let rectsByKey = new Map();
    if (GT.isNativeField(this.field)) {
      rectsByKey = GT.measureNativeRanges(
        this.field,
        this.corrections.map((c) => ({ start: c.start, end: c.end, key: c.id }))
      );
    } else {
      const { map } = GT.extract(this.field);
      for (const c of this.corrections) {
        const range = GT.textRangeToDomRange(map, c.start, c.end);
        if (range) rectsByKey.set(c.id, Array.from(range.getClientRects()));
      }
    }

    for (const c of this.corrections) {
      const rects = rectsByKey.get(c.id) || [];
      const critical = c.type !== 'style';
      for (const r of rects) {
        if (r.width < 1) continue;
        const u = GT.ui.el(
          'div',
          `gt-underline ${critical ? 'gt-critical' : 'gt-style'}`,
          this.layer
        );
        // Layer-relative coordinates; layer overflow:hidden clips to field.
        u.style.left = `${r.left - fieldRect.left}px`;
        u.style.top = `${r.top - fieldRect.top}px`;
        u.style.width = `${r.width}px`;
        u.style.height = `${r.height}px`;
        u.addEventListener('mousedown', (e) => e.preventDefault());
        u.addEventListener('click', (e) => {
          e.stopPropagation();
          GT.card.open(this, [c], u.getBoundingClientRect());
        });
      }
    }
  }

  renderBadge(fieldRect) {
    const rect = fieldRect || this.field.getBoundingClientRect();
    const focused = this.controller.isFocused();
    const show =
      this.visible() &&
      (focused || this.state === 'count' || this.state === 'error');
    if (!show) {
      this.badge.style.display = 'none';
      return;
    }
    this.badge.style.display = 'flex';
    this.badge.style.left = `${Math.max(0, rect.right - 34)}px`;
    this.badge.style.top = `${Math.min(innerHeight - 34, rect.bottom - 34)}px`;

    this.badge.className = 'gt-badge';
    this.badge.textContent = '';
    this.badge.title = 'GemType';
    if (this.state === 'checking') {
      GT.ui.el('div', 'gt-spin', this.badge);
      this.badge.title = 'Checking…';
    } else if (this.state === 'count') {
      this.badge.classList.add('gt-count');
      this.badge.textContent = String(this.corrections.length);
      this.badge.title = `${this.corrections.length} suggestion(s) — click to review`;
    } else if (this.state === 'clean') {
      this.badge.classList.add('gt-clean');
      this.badge.textContent = '✓';
      this.badge.title = 'Looks good';
    } else if (this.state === 'error') {
      this.badge.classList.add('gt-error');
      this.badge.textContent = '!';
      this.badge.title = 'GemType needs attention — click';
    } else {
      this.badge.classList.add('gt-off');
      this.badge.textContent = 'G';
    }
  }

  onBadgeClick() {
    if (GT.card.ownedBy(this)) {
      GT.card.close();
      return;
    }
    const anchor = this.badge.getBoundingClientRect();
    if (this.state === 'error') {
      const messages = {
        NO_API_KEY: [
          'Add your free Gemini API key to start checking. ',
          { link: 'Open settings' },
          '.',
        ],
        RATE_LIMITED: [
          'The Gemini API rate limit was hit. Checking will resume automatically in a moment.',
        ],
        EXTENSION_RELOADED: [
          { bold: 'GemType was updated.' },
          ' Refresh this page (F5 / Cmd+R) to reconnect — no need to restart the browser.',
        ],
      };
      const message = messages[this.errorKind] || [
        'Something went wrong (',
        { bold: this.errorKind || 'unknown' },
        '). Check your key and model in ',
        { link: 'settings' },
        '.',
      ];
      GT.card.open(this, [], anchor, { title: 'GemType', message });
      return;
    }
    if (this.corrections.length) {
      GT.card.open(this, this.corrections, anchor, { refineField: this.field });
    } else {
      GT.card.open(this, [], anchor, {
        title: 'GemType',
        refineField: this.field,
        message:
          this.state === 'checking'
            ? 'Checking your text…'
            : 'No issues found. Tip: select any text to get rewrite options right where you type.',
      });
    }
  }

  destroy() {
    clearInterval(this.poll);
    window.removeEventListener('scroll', this.scheduleReposition, true);
    window.removeEventListener('resize', this.scheduleReposition, true);
    this.field.removeEventListener('scroll', this.scheduleReposition, true);
    if (GT.card.ownedBy(this)) GT.card.close();
    this.layer.remove();
    this.badge.remove();
  }
};
