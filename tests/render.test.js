import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRenderedContent,
  initLibraries,
  renderPreview
} from '../modules/render.js';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn()
  }
}));

describe('render module', () => {
  beforeEach(() => {
    document.body.innerHTML = '<textarea id="editor"></textarea><article id="preview"></article>';
    initLibraries();
  });

  it('generates unique heading ids for duplicate headings', () => {
    const { sanitizedHtml } = getRenderedContent('# Title\n## Title');

    expect(sanitizedHtml).toContain('<h1 id="heading-title"');
    expect(sanitizedHtml).toContain('<h2 id="heading-title-2"');
  });

  it('renders mermaid code blocks as mermaid containers', () => {
    const { sanitizedHtml } = getRenderedContent('```mermaid\ngraph TD;\nA-->B;\n```');

    expect(sanitizedHtml).toContain('<div class="mermaid">');
    expect(sanitizedHtml).toContain('graph TD;');
  });

  it('renders empty preview state when markdown is blank', () => {
    const refs = {
      editor: document.getElementById('editor'),
      preview: document.getElementById('preview')
    };
    refs.editor.value = '   ';
    const onAfterRender = vi.fn();

    renderPreview({ refs, onAfterRender });

    expect(refs.preview.innerHTML).toContain('preview-empty');
    expect(onAfterRender).toHaveBeenCalledWith({ isEmpty: true });
  });

  it('sanitizes unsafe html from markdown output', () => {
    const { sanitizedHtml } = getRenderedContent('<img src=x onerror=alert(1) />');

    expect(sanitizedHtml).toContain('<img src="x">');
    expect(sanitizedHtml).not.toContain('onerror');
  });

  it('wraps tables for horizontal scroll and renders inline markdown in cells', () => {
    const { sanitizedHtml } = getRenderedContent(
      '| Name | Note |\n| --- | :---: |\n| a | *em* & `code` |'
    );

    // Wrapper for overflow scrolling.
    expect(sanitizedHtml).toContain('<div style="overflow-x:auto">');
    expect(sanitizedHtml).toContain('<table>');
    // Column alignment from the header separator is preserved (marked's
    // default renderer emits an align attribute, not an inline style).
    expect(sanitizedHtml).toContain('align="center"');
    // Inline markdown inside cells is rendered, not emitted as raw text.
    expect(sanitizedHtml).toContain('<em>em</em>');
    expect(sanitizedHtml).toContain('<code>code</code>');
  });

  it('renders markdown into preview', () => {
    const refs = {
      editor: document.getElementById('editor'),
      preview: document.getElementById('preview')
    };
    refs.editor.value = '# Hello';

    renderPreview({ refs });

    expect(refs.preview.innerHTML).toContain('<h1 id="heading-hello"');
  });
});
