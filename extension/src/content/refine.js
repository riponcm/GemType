// GemType refine toolbar: select text inside an editable field and a small
// dark toolbar appears with rewrite actions (Improve / Fix / Shorten / tone).
// The rewritten text replaces the selection via execCommand, so Ctrl+Z undoes.

'use strict';

GT.refine = (() => {
  const ACTIONS = [
    ['improve', '✨ Improve'],
    ['fix', 'Fix'],
    ['shorten', 'Shorten'],
    ['formal', 'Formal'],
    ['casual', 'Casual'],
  ];

  let bar = null;
  let pending = null; // { field, start, end, text }
  let busy = false;

  function hide() {
    if (bar) bar.remove();
    bar = null;
    pending = null;
    busy = false;
  }

  // Capture the current selection if it is inside a managed editable field.
  function captureSelection() {
    const active = document.activeElement;
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
    const sel = window.getSelection();
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
    const active = document.activeElement;
    if (GT.isNativeField(active)) {
      // Approximate: bottom of the field near its horizontal center is fine
      // for native fields; precise caret rects need the mirror (overkill here).
      const r = active.getBoundingClientRect();
      return new DOMRect(r.left + r.width / 4, r.top, 0, Math.min(r.height, 24));
    }
    const sel = window.getSelection();
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

    const root = GT.ui.ensureRoot();
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

  async function run(action, captured = null) {
    const job = captured || pending;
    if (!job || busy) return;
    busy = true;
    if (bar) {
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
    });
    busy = false;

    if (!res.ok) {
      hide();
      if (res.error === 'NO_API_KEY') {
        GT.ui.toast('GemType: add your Gemini API key in the extension settings');
      } else if (res.error === 'RATE_LIMITED') {
        GT.ui.toast('GemType: rate limited — try again in a moment');
      } else if (/context invalidated|receiving end does not exist/i.test(res.error)) {
        GT.ui.toast('GemType was updated — refresh this page to reconnect');
      } else {
        GT.ui.toast('GemType: rewrite failed');
      }
      return;
    }

    // Verify the selected text is still where it was before replacing.
    const { text: nowText } = GT.extract(job.field);
    let { start, end } = job;
    if (nowText.slice(start, end) !== job.text) {
      const idx = nowText.indexOf(job.text);
      if (idx === -1) {
        hide();
        GT.ui.toast('GemType: text changed — rewrite not applied');
        return;
      }
      start = idx;
      end = idx + job.text.length;
    }

    hide();
    if (GT.replaceRange(job.field, start, end, res.result.rewritten)) {
      GT.ui.toast('Rewritten — press Ctrl/Cmd+Z to undo');
    } else {
      GT.ui.toast('GemType: could not apply the rewrite here');
    }
  }

  function init() {
    document.addEventListener(
      'selectionchange',
      GT.debounce(() => {
        if (busy) return;
        if (!GT.state.enabledHere()) return hide();
        show();
      }, 250)
    );
    document.addEventListener(
      'mousedown',
      (e) => {
        // Any click on the page (not our shadow UI) dismisses an idle toolbar.
        if (!busy && bar && e.target.tagName !== 'GEMTYPE-EXT') hide();
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
