import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageController } from '../modules/images.js';

// A tiny fake File standing in for what the browser hands us on paste/drop.
// jsdom's FileReader can read a real Blob, so we build one and tag it with a
// name/type/size the way a real File exposes them.
function makeImageFile({ name = 'pic.png', type = 'image/png', bytes = 8 } = {}) {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  // Blob is missing File's name/lastModified; patch the fields images.js reads.
  Object.defineProperty(blob, 'name', { value: name, configurable: true });
  return blob;
}

function createDeps() {
  const inserted = [];
  const editorController = { insertText: vi.fn((text) => inserted.push(text)) };
  const showToast = vi.fn();
  return { editorController, showToast, inserted };
}

describe('createImageController', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('insertImageFiles', () => {
    it('reads an image as a base64 data URL and inserts markdown image syntax', async () => {
      const deps = createDeps();
      const controller = createImageController(deps);

      const handled = await controller.insertImageFiles([makeImageFile({ name: 'diagram.png' })]);

      expect(handled).toBe(true);
      expect(deps.editorController.insertText).toHaveBeenCalledTimes(1);
      const snippet = deps.inserted[0];
      // alt text derived from filename (extension stripped)
      expect(snippet).toContain('![diagram](');
      expect(snippet).toContain('data:image/png;base64,');
      expect(snippet.endsWith('\n')).toBe(true);
      expect(deps.showToast).toHaveBeenCalledWith('已插入图片');
    });

    it('ignores non-image files and returns false', async () => {
      const deps = createDeps();
      const controller = createImageController(deps);
      const textFile = new Blob(['hello'], { type: 'text/plain' });
      Object.defineProperty(textFile, 'name', { value: 'notes.txt' });

      const handled = await controller.insertImageFiles([textFile]);

      expect(handled).toBe(false);
      expect(deps.editorController.insertText).not.toHaveBeenCalled();
    });

    it('falls back to "image" alt text when the file has no meaningful name', async () => {
      const deps = createDeps();
      const controller = createImageController(deps);

      await controller.insertImageFiles([makeImageFile({ name: '' })]);

      expect(deps.inserted[0]).toContain('![image](');
    });

    it('inserts multiple images and reports the count', async () => {
      const deps = createDeps();
      const controller = createImageController(deps);

      const handled = await controller.insertImageFiles([
        makeImageFile({ name: 'a.png' }),
        makeImageFile({ name: 'b.jpg', type: 'image/jpeg' })
      ]);

      expect(handled).toBe(true);
      expect(deps.editorController.insertText).toHaveBeenCalledTimes(2);
      expect(deps.showToast).toHaveBeenCalledWith('已插入 2 张图片');
    });

    it('warns when an image exceeds the large-image threshold', async () => {
      const deps = createDeps();
      const controller = createImageController(deps);
      // 3 MB > 2 MB threshold
      const big = makeImageFile({ name: 'huge.png', bytes: 3 * 1024 * 1024 });

      await controller.insertImageFiles([big]);

      const warned = deps.showToast.mock.calls.some(([msg]) => msg.includes('影响性能'));
      expect(warned).toBe(true);
    });
  });

  describe('handlePaste', () => {
    it('extracts image items from the clipboard and prevents default paste', async () => {
      const deps = createDeps();
      const controller = createImageController(deps);
      const file = makeImageFile({ name: 'screenshot.png' });
      const preventDefault = vi.fn();

      await controller.handlePaste({
        preventDefault,
        clipboardData: {
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }]
        }
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.editorController.insertText).toHaveBeenCalledTimes(1);
      expect(deps.inserted[0]).toContain('data:image/png;base64,');
    });

    it('leaves text paste alone (no image items)', async () => {
      const deps = createDeps();
      const controller = createImageController(deps);
      const preventDefault = vi.fn();

      await controller.handlePaste({
        preventDefault,
        clipboardData: {
          items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }]
        }
      });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(deps.editorController.insertText).not.toHaveBeenCalled();
    });
  });
});
