import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCodeBlockController } from '../modules/codeblock.js';
import { createState } from '../modules/state.js';

// jsdom 的 offsetHeight/offsetWidth 恒为 0，无法反映真实布局。
// 用 defineProperty 给具体元素喂入可控尺寸，让基于尺寸的计算可测。
function defineSize(el, { height, width }) {
  if (height != null) {
    Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
  }
  if (width != null) {
    Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
  }
}

// 构造一个渲染器产出的 <pre> 结构：含 code、字体档位、框体档位标签。
function buildPre(codeText = 'const a = 1;') {
  document.body.innerHTML = `
    <pre>
      <span class="code-font-level">100%</span>
      <span class="code-zoom-level">默认</span>
      <code class="hljs">${codeText}</code>
    </pre>
  `;
  const pre = document.querySelector('pre');
  return {
    pre,
    code: pre.querySelector('code'),
    fontLabel: pre.querySelector('.code-font-level'),
    zoomLabel: pre.querySelector('.code-zoom-level')
  };
}

function setup() {
  const state = createState();
  const controller = createCodeBlockController({ state });
  return { state, controller };
}

describe('createCodeBlockController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  describe('copyCodeText', () => {
    it('writes the code text via the clipboard API and flips button label back', async () => {
      const writeText = vi.fn().mockResolvedValue();
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      });

      const { controller } = setup();
      const { pre } = buildPre('hello code');
      const button = document.createElement('button');
      button.textContent = '复制';

      await controller.copyCodeText(pre, button);

      expect(writeText).toHaveBeenCalledWith('hello code');
      expect(button.textContent).toBe('已复制 ✓');

      vi.advanceTimersByTime(2000);
      expect(button.textContent).toBe('复制');
    });

    it('falls back to execCommand when clipboard API is unavailable', async () => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: undefined,
        configurable: true
      });
      const execCommand = vi.fn();
      document.execCommand = execCommand;

      const { controller } = setup();
      const { pre } = buildPre('fallback text');
      const button = document.createElement('button');

      await controller.copyCodeText(pre, button);

      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(button.textContent).toBe('已复制 ✓');
    });

    it('is a no-op when the pre has no code element', async () => {
      const { controller } = setup();
      document.body.innerHTML = '<pre></pre>';
      const pre = document.querySelector('pre');
      const button = document.createElement('button');
      button.textContent = '复制';

      await controller.copyCodeText(pre, button);

      expect(button.textContent).toBe('复制');
    });
  });

  describe('adjustCodeFont', () => {
    it('increases the zoom from the default 100%', () => {
      const { controller } = setup();
      const { pre, code, fontLabel } = buildPre();

      controller.adjustCodeFont(pre, 10);

      expect(code.dataset.fontZoom).toBe('110');
      expect(fontLabel.textContent).toBe('110%');
      expect(code.style.fontSize).toBe(`${(110 / 100) * 13.5}px`);
    });

    it('clamps the zoom at a maximum of 200%', () => {
      const { controller } = setup();
      const { pre, code, fontLabel } = buildPre();

      for (let i = 0; i < 20; i++) controller.adjustCodeFont(pre, 10);

      expect(code.dataset.fontZoom).toBe('200');
      expect(fontLabel.textContent).toBe('200%');
    });

    it('clamps the zoom at a minimum of 50%', () => {
      const { controller } = setup();
      const { pre, code, fontLabel } = buildPre();

      for (let i = 0; i < 20; i++) controller.adjustCodeFont(pre, -10);

      expect(code.dataset.fontZoom).toBe('50');
      expect(fontLabel.textContent).toBe('50%');
    });

    it('resets to 100% when delta is 0', () => {
      const { controller } = setup();
      const { pre, code, fontLabel } = buildPre();

      controller.adjustCodeFont(pre, 50); // 150%
      controller.adjustCodeFont(pre, 0);

      expect(code.dataset.fontZoom).toBe('100');
      expect(fontLabel.textContent).toBe('100%');
    });
  });

  describe('adjustCodeBlockSize', () => {
    it('grows the block height based on current height plus delta', () => {
      const { controller } = setup();
      const { pre, code, zoomLabel } = buildPre();
      defineSize(code, { height: 100 });

      controller.adjustCodeBlockSize(pre, 80);

      expect(code.style.height).toBe('180px');
      expect(code.style.maxHeight).toBe('180px');
      expect(zoomLabel.textContent).toBe('180px');
    });

    it('never shrinks below the 60px floor', () => {
      const { controller } = setup();
      const { pre, code, zoomLabel } = buildPre();
      defineSize(code, { height: 100 });

      controller.adjustCodeBlockSize(pre, -80); // 100 - 80 = 20 -> floored to 60

      expect(code.style.height).toBe('60px');
      expect(zoomLabel.textContent).toBe('60px');
    });

    it('clears inline sizing and resets the label when delta is 0', () => {
      const { controller } = setup();
      const { pre, code, zoomLabel } = buildPre();
      defineSize(code, { height: 100 });
      controller.adjustCodeBlockSize(pre, 80);

      controller.adjustCodeBlockSize(pre, 0);

      expect(code.style.maxHeight).toBe('');
      expect(code.style.height).toBe('');
      expect(pre.style.width).toBe('');
      expect(zoomLabel.textContent).toBe('默认');
    });
  });

  describe('code resize drag', () => {
    it('startCodeResize seeds state and sets the body cursor by mode', () => {
      const { state, controller } = setup();
      const { pre, code } = buildPre();
      defineSize(code, { height: 120 });
      defineSize(pre, { width: 300 });

      controller.startCodeResize(pre, 'both', { clientX: 10, clientY: 20, preventDefault: vi.fn() });

      expect(state.codeResize).toMatchObject({
        mode: 'both',
        startX: 10,
        startY: 20,
        startH: 120,
        startW: 300
      });
      expect(document.body.style.cursor).toBe('nwse-resize');
      expect(document.body.style.userSelect).toBe('none');
    });

    it('updateCodeResize adjusts height in height mode', () => {
      const { controller } = setup();
      const { pre, code } = buildPre();
      defineSize(code, { height: 100 });

      controller.startCodeResize(pre, 'height', { clientX: 0, clientY: 0, preventDefault: vi.fn() });
      controller.updateCodeResize({ clientX: 0, clientY: 50 });

      expect(code.style.height).toBe('150px');
    });

    it('updateCodeResize adjusts width in width mode', () => {
      const { controller } = setup();
      const { pre } = buildPre();
      defineSize(pre, { width: 200 });

      controller.startCodeResize(pre, 'width', { clientX: 0, clientY: 0, preventDefault: vi.fn() });
      controller.updateCodeResize({ clientX: 100, clientY: 0 });

      expect(pre.style.width).toBe('300px');
      expect(pre.style.maxWidth).toBe('none');
    });

    it('updateCodeResize is a no-op without an active drag', () => {
      const { controller } = setup();
      const { code } = buildPre();
      // 无 startCodeResize，state.codeResize 为 null
      controller.updateCodeResize({ clientX: 100, clientY: 100 });
      expect(code.style.height).toBe('');
    });

    it('finishCodeResize clears state and restores body styles', () => {
      const { state, controller } = setup();
      const { pre, code } = buildPre();
      defineSize(code, { height: 100 });

      controller.startCodeResize(pre, 'height', { clientX: 0, clientY: 0, preventDefault: vi.fn() });
      controller.finishCodeResize();

      expect(state.codeResize).toBeNull();
      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    });
  });
});
