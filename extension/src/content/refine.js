// GemType refine toolbar: select text inside an editable field and a small
// dark toolbar appears with rewrite actions (Improve / Fix / Shorten / tone).
// The rewritten text replaces the selection via execCommand, so Ctrl+Z undoes.

'use strict';

GT.refine = (() => {
  const ACTIONS = GT.REWRITE_ACTIONS;

  let bar = null;
  let preview = null; // the rewrite preview panel
  let pending = null; // { field, start, end, text }
  let busy = false;
  const LABELS = Object.fromEntries(ACTIONS.map(([a, l]) => [a, l.replace('✨ ', '')]));

  // Editors like LinkedIn's post composer live inside a shadow root. Two helpers
  // pierce it: document.activeElement returns the shadow host, and
  // document.getSelection() cannot see inside shadow DOM at all — so we walk to
  // the real focused element and read the selection from its own root.
  function deepActiveElement() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }

  function activeSelection() {
    const a = deepActiveElement();
    const root = a && a.getRootNode ? a.getRootNode() : null;
    if (root instanceof ShadowRoot && typeof root.getSelection === 'function') {
      const s = root.getSelection();
      if (s && s.rangeCount) return s;
    }
    return window.getSelection();
  }

  function hide() {
    if (bar) bar.remove();
    bar = null;
    pending = null;
    busy = false;
  }

  // Capture the current selection if it is inside a managed editable field.
  function captureSelection() {
    const active = deepActiveElement();
    if (GT.isNativeField(active)) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (start == null || end == null || start === end) return null;
      return {
        field: active,
        start,
        end,
        text: active.value.slice(start, end),
      };
    }
    const sel = activeSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const field = GT.findEditable(sel.anchorNode);
    if (!field || GT.isNativeField(field)) return null;
    if (!field.contains(sel.anchorNode) || !field.contains(sel.focusNode)) return null;
    const { map } = GT.extract(field);
    const range = sel.getRangeAt(0);
    const start = GT.domPosToTextOffset(map, range.startContainer, range.startOffset);
    const end = GT.domPosToTextOffset(map, range.endContainer, range.endOffset);
    if (end <= start) return null;
    const { text } = GT.extract(field);
    return { field, start, end, text: text.slice(start, end) };
  }

  function selectionAnchorRect() {
    const active = deepActiveElement();
    if (GT.isNativeField(active)) {
      // Approximate: bottom of the field near its horizontal center is fine
      // for native fields; precise caret rects need the mirror (overkill here).
      const r = active.getBoundingClientRect();
      return new DOMRect(r.left + r.width / 4, r.top, 0, Math.min(r.height, 24));
    }
    const sel = activeSelection();
    if (sel && sel.rangeCount) {
      const rects = sel.getRangeAt(0).getClientRects();
      if (rects.length) return rects[rects.length - 1];
    }
    return null;
  }

  function show() {
    const captured = captureSelection();
    if (!captured || captured.text.trim().length < 3) {
      if (!busy) hide();
      return;
    }
    if (captured.text.length > 6000) return;
    pending = captured;

    const anchor = selectionAnchorRect();
    if (!anchor) return;

    const root = GT.ui.mountFor(deepActiveElement());
    if (!bar) {
      bar = GT.ui.el('div', 'gt-toolbar', root);
      // preventDefault on mousedown keeps the page selection alive.
      bar.addEventListener('mousedown', (e) => e.preventDefault());
      for (const [action, label] of ACTIONS) {
        const btn = GT.ui.el('button', '', bar);
        btn.textContent = label;
        btn.addEventListener('click', () => run(action));
      }
    }
    const w = bar.getBoundingClientRect().width || 320;
    bar.style.left = `${Math.min(Math.max(anchor.left, 8), innerWidth - w - 8)}px`;
    const top = anchor.bottom + 8;
    bar.style.top =
      top > innerHeight - 50 ? `${anchor.top - 44}px` : `${top}px`;
  }

  function hidePreview() {
    if (preview) preview.remove();
    preview = null;
  }

  async function run(action, captured = null, fresh = false) {
    const job = captured || pending;
    if (!job || busy) return;
    busy = true;
    const anchor = (preview || bar)?.getBoundingClientRect() || null;
    if (preview) {
      const t = preview.querySelector('.gt-pv-text');
      t.classList.add('gt-busy');
      t.textContent = 'Rewriting…';
    } else if (bar) {
      bar.textContent = '';
      GT.ui.el('div', 'gt-tb-spin', bar);
      const label = GT.ui.el('button', '', bar);
      label.textContent = 'Rewriting…';
    } else {
      GT.ui.toast('GemType: rewriting…');
    }

    const res = await GT.sendMessage({
      type: 'REFINE_TEXT',
      text: job.text,
      action,
      fresh,
    });
    busy = false;

    if (!res.ok) {
      hide();
      hidePreview();
      if (res.error === 'NO_API_KEY') {
        GT.ui.toast('GemType: add your Gemini API key in the extension settings');
      } else if (res.error === 'NO_STYLE') {
        GT.ui.toast('GemType: describe your style first (Settings → Custom rules → My style)');
        GT.sendMessage({ type: 'OPEN_OPTIONS', hash: 'rules' });
      } else if (res.error === 'RATE_LIMITED') {
        GT.ui.toast('GemType: rate limited — try again in a moment');
      } else if (res.error === 'DAILY_LIMIT') {
        GT.ui.toast("GemType: today's free Gemini limit is used up — it resets at midnight Pacific");
      } else if (res.error === 'EXTENSION_RELOADED') {
        GT.ui.toast('GemType was updated — refresh this page to reconnect');
      } else {
        GT.ui.toast('GemType: rewrite failed');
      }
      return;
    }

    hide();
    showPreview(job, action, res.result.rewritten, anchor);
  }

  // Show the rewrite first; nothing changes in the page until Replace.
  function showPreview(job, action, rewritten, anchor) {
    const root = GT.ui.mountFor(job.field);
    hidePreview();
    preview = GT.ui.el('div', 'gt-preview', root);
    preview.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus

    const header = GT.ui.el('div', 'gt-card-header', preview);
    GT.ui.el('span', 'gt-grow', header).textContent = `${LABELS[action] || 'Rewrite'} — preview`;
    const close = GT.ui.el('span', 'gt-close', header);
    close.textContent = '✕';
    close.addEventListener('click', hidePreview);

    GT.ui.el('div', 'gt-pv-text', preview).textContent = rewritten;

    const actions = GT.ui.el('div', 'gt-pv-actions', preview);
    const replace = GT.ui.el('button', 'gt-btn gt-btn-accept', actions);
    replace.textContent = 'Replace';
    replace.addEventListener('click', () => {
      hidePreview();
      apply(job, rewritten);
    });
    const copy = GT.ui.el('button', 'gt-btn gt-btn-dismiss', actions);
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(rewritten).then(
        () => GT.ui.toast('Copied'),
        () => GT.ui.toast('GemType: could not copy here')
      );
    });
    const again = GT.ui.el('button', 'gt-btn gt-btn-dismiss', actions);
    again.textContent = '↻ Try again';
    again.addEventListener('click', () => run(action, job, true));

    const fr = job.field.getBoundingClientRect();
    const box = anchor || new DOMRect(fr.left, fr.bottom + 8, 0, 0);
    const W = 360;
    preview.style.left = `${Math.min(Math.max(box.left, 8), innerWidth - W - 8)}px`;
    const h = preview.getBoundingClientRect().height;
    let top = box.top;
    if (top + h > innerHeight - 8) top = Math.max(8, innerHeight - h - 8);
    preview.style.top = `${top}px`;
  }

  function apply(job, rewritten) {
    // Verify the selected text is still where it was before replacing.
    const { text: nowText } = GT.extract(job.field);
    let { start, end } = job;
    if (nowText.slice(start, end) !== job.text) {
      const idx = nowText.indexOf(job.text);
      if (idx === -1) {
        GT.ui.toast('GemType: text changed — rewrite not applied');
        return;
      }
      start = idx;
      end = idx + job.text.length;
    }
    if (GT.replaceRange(job.field, start, end, rewritten)) {
      GT.ui.toast('Rewritten — press Ctrl/Cmd+Z to undo');
    } else {
      GT.ui.toast('GemType: could not apply the rewrite here');
    }
  }

  function init() {
    const maybeShow = GT.debounce(() => {
      if (busy || preview) return;
      if (!GT.state.enabledHere()) return hide();
      show();
    }, 250);
    document.addEventListener('selectionchange', maybeShow);
    // selectionchange is unreliable for selections inside shadow DOM across
    // Chromium versions; mouseup is a reliable backup after a drag-select.
    document.addEventListener('mouseup', maybeShow, true);
    document.addEventListener(
      'mousedown',
      (e) => {
        // Any click on the page (not our shadow UI) dismisses an idle toolbar
        // or preview.
        if (busy || e.target.tagName === 'GEMTYPE-EXT') return;
        if (bar) hide();
        hidePreview();
      },
      true
    );
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && preview) hidePreview();
      },
      true
    );
  }

  // For the right-click context menu path from the background worker.
  function runOnCurrentSelection(action) {
    const captured = captureSelection();
    if (!captured) {
      GT.ui.toast('GemType: select text inside an editable field first');
      return;
    }
    run(action, captured);
  }

  // Rewrite the ENTIRE field content (badge-card refine chips).
  function runOnField(field, action) {
    const { text } = GT.extract(field);
    if (text.trim().length < 3) {
      GT.ui.toast('GemType: nothing to refine yet');
      return;
    }
    if (text.length > 6000) {
      GT.ui.toast('GemType: text too long to refine in one go — select a part instead');
      return;
    }
    run(action, { field, start: 0, end: text.length, text });
  }

  return { init, runOnCurrentSelection, runOnField, hide };
})();
