import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileController } from '../modules/files.js';

// A slice of preview HTML containing the interactive controls that the code-block
// renderer injects (toolbar, resize handles, language label). Exported / copied
// output must strip these so the user gets clean markup.
const HTML_WITH_CONTROLS = `
  <h1>Title</h1>
  <pre>
    <span class="code-lang">js</span>
    <div class="code-toolbar"><button class="code-copy-btn">复制</button></div>
    <code class="hljs">const x = 1;</code>
    <div class="code-resize-handle code-resize-right"></div>
  </pre>
  <p>body</p>`;

function createDeps({ editorValue = '', renderedHtml = HTML_WITH_CONTROLS } = {}) {
  const refs = {
    editor: { value: editorValue },
    exportModal: { classList: { add: vi.fn(), remove: vi.fn() } }
  };
  const state = { currentFileHandle: null };
  const showToast = vi.fn();
  const getRenderedContent = vi.fn(() => ({ sanitizedHtml: renderedHtml }));

  return { refs, state, showToast, getRenderedContent };
}

describe('createFileController', () => {
  let capturedBlobs;
  const RealBlob = globalThis.Blob;

  beforeEach(() => {
    capturedBlobs = [];
    // jsdom's Blob has no .text(), so wrap the constructor to capture the raw
    // content parts downloadFile() passes in — that's what would hit disk.
    vi.stubGlobal('Blob', class extends RealBlob {
      constructor(parts, options) {
        super(parts, options);
        capturedBlobs.push({ text: parts.join(''), type: options?.type });
      }
    });
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    // Stop the anchor.click() in downloadFile from triggering jsdom navigation.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('copyHtmlToClipboard', () => {
    it('strips interactive code-block controls before copying', async () => {
      const deps = createDeps();
      const writeText = vi.fn().mockResolvedValue();
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      });

      const controller = createFileController(deps);
      await controller.copyHtmlToClipboard();

      expect(writeText).toHaveBeenCalledTimes(1);
      const copied = writeText.mock.calls[0][0];
      expect(copied).not.toContain('code-toolbar');
      expect(copied).not.toContain('code-resize-handle');
      expect(copied).not.toContain('code-lang');
      // Real content survives.
      expect(copied).toContain('<code class="hljs">const x = 1;</code>');
      expect(copied).toContain('<h1>Title</h1>');
      expect(deps.showToast).toHaveBeenCalledWith('HTML 已复制到剪贴板');
    });

    it('falls back to execCommand when the clipboard API rejects', async () => {
      const deps = createDeps();
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        configurable: true
      });
      document.execCommand = vi.fn();

      const controller = createFileController(deps);
      await controller.copyHtmlToClipboard();

      expect(document.execCommand).toHaveBeenCalledWith('copy');
      expect(deps.showToast).toHaveBeenCalledWith('HTML 已复制到剪贴板');
    });
  });

  describe('exportMarkdownFile', () => {
    it('downloads the raw editor content untouched', async () => {
      const deps = createDeps({ editorValue: '# hi\n\n- a\n- b' });
      const controller = createFileController(deps);

      controller.exportMarkdownFile();

      expect(capturedBlobs).toHaveLength(1);
      expect(capturedBlobs[0].text).toBe('# hi\n\n- a\n- b');
      expect(deps.refs.exportModal.classList.remove).toHaveBeenCalledWith('show');
    });
  });

  describe('exportHtmlFile', () => {
    it('wraps clean HTML in a full document with a strict CSP and no controls', async () => {
      const deps = createDeps();
      const controller = createFileController(deps);

      controller.exportHtmlFile();

      expect(capturedBlobs).toHaveLength(1);
      const html = capturedBlobs[0].text;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain("default-src 'none'");
      // Interactive controls stripped from the exported document too.
      expect(html).not.toContain('code-toolbar');
      expect(html).toContain('const x = 1;');
    });
  });
});
