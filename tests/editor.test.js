import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorController } from '../modules/editor.js';
import { createState } from '../modules/state.js';

// editor.js now builds a CodeMirror 6 view inside the mount element and swaps
// refs.editor for a textarea-shaped adapter. Tests construct the controller
// against a real mount node and then read/write through refs.editor exactly the
// way the app does. CM6 runs in jsdom; layout-dependent APIs are stubbed but the
// document model + selection (what the formatting logic relies on) work.
function setup(initialValue = '') {
  document.body.innerHTML = `
    <div id="editor"></div>
    <span id="charCount"></span>
    <span id="lineCount"></span>
  `;

  const refs = {
    editor: document.getElementById('editor'),
    charCount: document.getElementById('charCount'),
    lineCount: document.getElementById('lineCount')
  };
  const state = createState();
  const renderPreview = vi.fn();
  const controller = createEditorController({ refs, state, renderPreview });

  // refs.editor is now the adapter. Seed content the way file loads do.
  if (initialValue) {
    refs.editor.resetDoc(initialValue);
  }

  return { refs, state, controller, renderPreview };
}

// Select an absolute character range in the adapter-backed document.
function select(refs, start, end = start) {
  refs.editor.setSelectionRange(start, end);
}

describe('createEditorController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes the document text through the adapter value', () => {
    const { refs } = setup('hello');
    expect(refs.editor.value).toBe('hello');
  });

  it('formats heading on the current line', () => {
    const { refs, controller } = setup('Hello title');
    select(refs, 2, 2);
    controller.formatHeading(2);
    expect(refs.editor.value).toBe('## Hello title');
  });

  it('toggles unordered list formatting for multiple lines', () => {
    const { refs, controller } = setup('alpha\nbeta');

    select(refs, 0, refs.editor.value.length);
    controller.formatText('ul');
    expect(refs.editor.value).toBe('- alpha\n- beta');

    select(refs, 0, refs.editor.value.length);
    controller.formatText('ul');
    expect(refs.editor.value).toBe('alpha\nbeta');
  });

  it('applies checked task list markers to selected lines', () => {
    const { refs, controller } = setup('task one\ntask two');
    select(refs, 0, refs.editor.value.length);
    controller.formatTaskList('checked');
    expect(refs.editor.value).toBe('- [x] task one\n- [x] task two');
  });

  it('wraps a selection in bold markers and toggles it back off', () => {
    const { refs, controller } = setup('word');
    select(refs, 0, 4);
    controller.formatText('bold');
    expect(refs.editor.value).toBe('**word**');

    // Selection is left around the inner text; toggling removes the markers.
    select(refs, 2, 6);
    controller.formatText('bold');
    expect(refs.editor.value).toBe('word');
  });

  it('inserts text at the caret', () => {
    const { refs, controller } = setup('ab');
    select(refs, 1, 1);
    controller.insertText('X');
    expect(refs.editor.value).toBe('aXb');
  });

  it('supports CM6-native undo and redo of an edit', () => {
    const { refs, controller } = setup('hello');
    refs.editor.value = 'hello world';
    expect(refs.editor.value).toBe('hello world');

    controller.undo();
    expect(refs.editor.value).toBe('hello');

    controller.redo();
    expect(refs.editor.value).toBe('hello world');
  });

  it('restores saved content from localStorage before default content', () => {
    localStorage.setItem('md-parser-content', '# saved');
    const { refs, controller } = setup();
    controller.restoreInitialContent();
    expect(refs.editor.value).toBe('# saved');
  });

  it('prefers sessionStorage over localStorage when restoring', () => {
    localStorage.setItem('md-parser-content', '# from local');
    sessionStorage.setItem('md-parser-content', '# from session');
    const { refs, controller } = setup();
    controller.restoreInitialContent();
    expect(refs.editor.value).toBe('# from session');
  });

  it('updates char and line counts', () => {
    const { refs, controller } = setup('a\nbc');
    controller.updateStats();
    expect(refs.charCount.textContent).toBe('4 字符');
    expect(refs.lineCount.textContent).toBe('2 行');
  });
});
