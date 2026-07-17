// CodeMirror 6 editor, wrapped in a textarea-shaped adapter.
//
// The rest of the app (editor.js formatting, files.js, images.js) was written
// against a <textarea>: it reads/writes `.value`, `.selectionStart/End`, calls
// `setSelectionRange` / `focus`, and binds `paste`. Rather than rewrite all of
// that against CM6 transactions, we expose the same surface here and translate
// each access into a CM6 dispatch. This keeps the intricate, well-tested
// formatting logic in editor.js untouched.
//
// On top of that we add a base64 image fold: the long `data:...;base64,<payload>`
// blob is replaced with a clickable "已折叠" chip so it stops cluttering the text
// you're actually writing.

import { EditorState, StateField, StateEffect, RangeSetBuilder, MapMode } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';

// Payloads shorter than this stay inline — tiny inline images (or pasted 1x1
// pixels) aren't worth a fold chip; only real, bulky images get collapsed.
const MIN_FOLD_PAYLOAD = 40;

// Matches ![alt](data:<mime>;base64,<payload>). Group 1 is the full data URL
// (used as an <img> src when expanded), group 2 is just the payload.
// [^)\s] keeps us inside a single markdown image and stops at the closing paren.
const BASE64_IMAGE_RE = /!\[[^\]]*\]\((data:[^;\s]+;base64,([^)\s]*))\)/g;

// Locate every foldable base64 payload in the doc. Returned ranges are the
// payload span only (between "base64," and the closing paren); `src` is the full
// data URL for rendering an image preview. Exported for unit tests since
// decoration rendering itself needs a real layout.
export function scanBase64Ranges(text) {
  const ranges = [];
  BASE64_IMAGE_RE.lastIndex = 0;
  let m;
  while ((m = BASE64_IMAGE_RE.exec(text))) {
    const src = m[1];
    const payload = m[2];
    if (payload.length < MIN_FOLD_PAYLOAD) continue;
    const marker = 'base64,';
    const payloadStart = m.index + m[0].indexOf(marker) + marker.length;
    const payloadEnd = payloadStart + payload.length;
    ranges.push({ from: payloadStart, to: payloadEnd, src, bytes: Math.floor((payload.length * 3) / 4) });
  }
  return ranges;
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// Toggle the "expanded" flag for the payload starting at a given position.
const toggleFold = StateEffect.define();

// Tracks which folded payloads the user explicitly expanded. Positions are
// mapped across edits; a full-doc reset (setState) starts empty, so freshly
// loaded documents fold everything by default.
const expandedField = StateField.define({
  create() {
    return new Set();
  },
  update(value, tr) {
    let set = value;
    if (tr.docChanged) {
      const mapped = new Set();
      for (const pos of set) {
        const next = tr.changes.mapPos(pos, 1, MapMode.TrackDel);
        if (next != null) mapped.add(next);
      }
      set = mapped;
    }
    for (const effect of tr.effects) {
      if (effect.is(toggleFold)) {
        set = new Set(set);
        if (set.has(effect.value)) set.delete(effect.value);
        else set.add(effect.value);
      }
    }
    return set;
  }
});

class FoldWidget extends WidgetType {
  constructor(pos, label) {
    super();
    this.pos = pos;
    this.label = label;
  }

  eq(other) {
    return other.pos === this.pos && other.label === this.label;
  }

  toDOM(view) {
    const chip = document.createElement('span');
    chip.className = 'cm-base64-fold';
    chip.textContent = `⯈ 已折叠 ${this.label}`;
    chip.title = '点击展开 base64 数据';
    // mousedown (not click) so CM6 doesn't move the caret into the hidden range
    // before we react; preventDefault keeps focus/selection put.
    chip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ effects: toggleFold.of(this.pos) });
    });
    return chip;
  }

  ignoreEvent() {
    return false;
  }
}

// Expanded state renders an image preview instead of the raw base64 text. The
// payload span stays replaced (never becomes editable text), so a multi-hundred-
// KB single-line blob never enters CM6's line-wrapping layout — that layout pass
// on a huge single line was what froze the editor on expand.
class ImagePreviewWidget extends WidgetType {
  constructor(pos, src, label) {
    super();
    this.pos = pos;
    this.src = src;
    this.label = label;
  }

  eq(other) {
    return other.pos === this.pos && other.src === this.src && other.label === this.label;
  }

  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-base64-preview';

    const collapse = document.createElement('span');
    collapse.className = 'cm-base64-collapse';
    collapse.textContent = `⯆ 收起 ${this.label}`;
    collapse.title = '折叠 base64 数据';
    collapse.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ effects: toggleFold.of(this.pos) });
    });

    const img = document.createElement('img');
    img.className = 'cm-base64-thumb';
    img.src = this.src;
    img.alt = 'base64 图片预览';

    wrap.appendChild(collapse);
    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

function buildFoldDecorations(view) {
  const expanded = view.state.field(expandedField);
  const text = view.state.doc.toString();
  const entries = [];

  for (const range of scanBase64Ranges(text)) {
    const label = `(${formatBytes(range.bytes)})`;
    // Both states replace the whole payload span, so the raw base64 blob never
    // becomes editable text. Expanded swaps the chip for an image preview widget
    // instead of exposing the payload — that exposure (a huge single line under
    // line-wrapping) was what froze the editor on expand.
    const widget = expanded.has(range.from)
      ? new ImagePreviewWidget(range.from, range.src, label)
      : new FoldWidget(range.from, label);

    entries.push({
      from: range.from,
      to: range.to,
      deco: Decoration.replace({ widget })
    });
  }

  entries.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder();
  for (const entry of entries) builder.add(entry.from, entry.to, entry.deco);
  return builder.finish();
}

const foldPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildFoldDecorations(view);
    }

    update(update) {
      // Decorations depend only on doc text + the expanded set, so we no longer
      // rebuild on selection or viewport changes — that used to re-scan the whole
      // doc on every caret move/scroll for no visible change.
      if (update.docChanged) {
        this.decorations = buildFoldDecorations(update.view);
        return;
      }
      // React to toggle effects even when nothing else changed.
      for (const tr of update.transactions) {
        if (tr.effects.some((e) => e.is(toggleFold))) {
          this.decorations = buildFoldDecorations(update.view);
          return;
        }
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Make folded chips atomic so the caret jumps over them instead of landing
    // inside the hidden base64.
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations || Decoration.none)
  }
);

// Colors reference CSS variables (defined in style.css for both themes) so the
// editor follows the app's dark/light + custom-color theme automatically.
const highlightStyle = HighlightStyle.define([
  { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4], color: 'var(--md-heading)', fontWeight: '600' },
  { tag: t.strong, color: 'var(--md-strong)', fontWeight: '600' },
  { tag: t.emphasis, color: 'var(--md-emphasis)', fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--md-link)' },
  { tag: [t.monospace], color: 'var(--md-code)' },
  { tag: [t.quote], color: 'var(--md-quote)', fontStyle: 'italic' },
  { tag: [t.list, t.processingInstruction], color: 'var(--md-marker)' },
  { tag: [t.contentSeparator], color: 'var(--md-marker)' }
]);

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text-primary)',
    backgroundColor: 'transparent',
    fontSize: '15px'
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    padding: '20px',
    caretColor: 'var(--primary)'
  },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    lineHeight: '1.7',
    overflow: 'auto'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--cm-selection, rgba(108, 99, 255, 0.25))'
  },
  '.cm-activeLine': { backgroundColor: 'var(--cm-active-line, rgba(128, 128, 128, 0.06))' },
  '.cm-base64-fold': {
    display: 'inline-block',
    padding: '0 8px',
    margin: '0 2px',
    borderRadius: '6px',
    fontSize: '0.85em',
    cursor: 'pointer',
    color: 'var(--primary)',
    backgroundColor: 'var(--cm-fold-bg, rgba(108, 99, 255, 0.12))',
    border: '1px solid var(--cm-fold-border, rgba(108, 99, 255, 0.3))',
    userSelect: 'none'
  },
  '.cm-base64-collapse': {
    display: 'inline-block',
    padding: '0 6px',
    marginRight: '4px',
    borderRadius: '6px',
    fontSize: '0.85em',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--cm-fold-bg, rgba(128, 128, 128, 0.12))',
    userSelect: 'none'
  },
  '.cm-base64-preview': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    verticalAlign: 'middle'
  },
  '.cm-base64-thumb': {
    maxWidth: '180px',
    maxHeight: '120px',
    borderRadius: '6px',
    border: '1px solid var(--cm-fold-border, rgba(108, 99, 255, 0.3))',
    objectFit: 'contain',
    // Chromium ignores the `draggable` attribute inside contentEditable but
    // honors this, blocking the native image drag that would re-embed the blob.
    WebkitUserDrag: 'none'
  }
});

// Minimal-diff replacement: turn a full-string assignment into the smallest
// change region (common prefix/suffix trimmed). Keeps CM6 undo granularity sane
// and lets the fold state map across the edit instead of being wiped on every
// formatting action.
function diffReplace(current, next) {
  const maxLen = Math.min(current.length, next.length);
  let prefix = 0;
  while (prefix < maxLen && current[prefix] === next[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < maxLen - prefix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    from: prefix,
    to: current.length - suffix,
    insert: next.slice(prefix, next.length - suffix)
  };
}

export function createEditorView({ parent, initialValue = '', onDocChanged }) {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && typeof onDocChanged === 'function') {
      onDocChanged();
    }
  });

  function buildState(doc) {
    return EditorState.create({
      doc,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorState.allowMultipleSelections.of(false),
        indentUnit.of('  '),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(highlightStyle),
        expandedField,
        foldPlugin,
        keymap.of([indentWithTab, ...historyKeymap, ...defaultKeymap]),
        editorTheme,
        updateListener
      ]
    });
  }

  const view = new EditorView({ state: buildState(initialValue), parent });

  // The textarea-shaped surface the rest of the app talks to.
  const adapter = {
    get value() {
      return view.state.doc.toString();
    },
    set value(next) {
      const current = view.state.doc.toString();
      if (current === next) return;
      view.dispatch({ changes: diffReplace(current, next) });
    },
    get selectionStart() {
      return view.state.selection.main.from;
    },
    get selectionEnd() {
      return view.state.selection.main.to;
    },
    setSelectionRange(start, end) {
      const len = view.state.doc.length;
      const anchor = Math.max(0, Math.min(start, len));
      const head = Math.max(0, Math.min(end, len));
      view.dispatch({ selection: { anchor, head } });
    },
    focus() {
      view.focus();
    },
    hasFocus() {
      return view.hasFocus;
    },
    addEventListener(type, handler) {
      view.contentDOM.addEventListener(type, handler);
    },
    removeEventListener(type, handler) {
      view.contentDOM.removeEventListener(type, handler);
    },
    undo() {
      undo(view);
      view.focus();
    },
    redo() {
      redo(view);
      view.focus();
    },
    // Replace the whole document and clear undo history — used when loading a
    // file so its content isn't undoable back into the previous document.
    resetDoc(content) {
      view.setState(buildState(content));
    },
    get view() {
      return view;
    }
  };

  return adapter;
}
