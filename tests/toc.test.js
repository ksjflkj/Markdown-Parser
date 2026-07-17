import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTocController } from '../modules/toc.js';
import { createState } from '../modules/state.js';

// toc.js 用 IntersectionObserver 观察标题进出视口。jsdom 无此实现，
// 用一个可手动触发回调的 mock 替代，同时记录 observe 的元素。
let observerInstances = [];
class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observed = [];
    observerInstances.push(this);
  }
  observe(el) {
    this.observed.push(el);
  }
  disconnect() {
    this.observed = [];
  }
}

beforeEach(() => {
  observerInstances = [];
  globalThis.IntersectionObserver = MockIntersectionObserver;
  globalThis.Element.prototype.scrollIntoView = vi.fn();
});

// 构造 preview（含标题）+ 其滚动父容器 + 目录导航 + resize 相关元素。
function setup(headingsHtml = '') {
  document.body.innerHTML = `
    <div id="mainContainer">
      <div id="scrollRoot">
        <article id="preview">${headingsHtml}</article>
      </div>
      <div id="tocResizer"></div>
      <aside id="tocPanel"><nav id="tocNav"></nav></aside>
    </div>
  `;

  const refs = {
    preview: document.getElementById('preview'),
    tocNav: document.getElementById('tocNav'),
    tocPanel: document.getElementById('tocPanel'),
    tocResizer: document.getElementById('tocResizer'),
    mainContainer: document.getElementById('mainContainer')
  };
  const state = createState();
  const controller = createTocController({ refs, state });

  return { refs, state, controller, scrollRoot: document.getElementById('scrollRoot') };
}

const HEADINGS = `
  <h1 id="h-one" data-heading-level="1">One</h1>
  <h2 id="h-two" data-heading-level="2">Two</h2>
  <h3 id="h-three" data-heading-level="3">Three</h3>
`;

describe('createTocController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('renderToc (via update)', () => {
    it('builds a toc link per heading with level classes', () => {
      const { refs, state, controller } = setup(HEADINGS);

      controller.update();

      const links = refs.tocNav.querySelectorAll('.toc-item');
      expect(links.length).toBe(3);
      expect(links[0].textContent).toBe('One');
      expect(links[0].className).toContain('level-1');
      expect(links[1].className).toContain('level-2');
      expect(links[2].dataset.id).toBe('h-three');
      expect(state.toc.items.length).toBe(3);
    });

    it('shows an empty placeholder when there are no headings', () => {
      const { refs, state, controller } = setup('<p>no headings</p>');

      controller.update();

      expect(refs.tocNav.querySelector('.toc-empty')).not.toBeNull();
      expect(refs.tocNav.textContent).toBe('暂无标题');
      expect(state.toc.items.length).toBe(0);
      expect(state.toc.activeId).toBe('');
    });

    it('derives level from the tag name when data-heading-level is absent', () => {
      const { state, controller } = setup('<h4 id="h4">Deep</h4>');
      controller.update();
      expect(state.toc.items[0].level).toBe(4);
    });

    it('replaces previous links on re-render', () => {
      const { refs, controller } = setup(HEADINGS);
      controller.update();
      expect(refs.tocNav.querySelectorAll('.toc-item').length).toBe(3);

      // 重新渲染为更少的标题
      refs.preview.innerHTML = '<h1 id="solo">Solo</h1>';
      controller.update();
      expect(refs.tocNav.querySelectorAll('.toc-item').length).toBe(1);
    });
  });

  describe('toc link click', () => {
    it('sets the clicked heading active and scrolls to it', () => {
      const { refs, state, controller } = setup(HEADINGS);
      controller.update();

      const secondLink = refs.tocNav.querySelectorAll('.toc-item')[1];
      const heading = document.getElementById('h-two');
      secondLink.click();

      expect(state.toc.activeId).toBe('h-two');
      expect(secondLink.classList.contains('active')).toBe(true);
      expect(heading.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });
  });

  describe('scrollToHeading', () => {
    it('scrolls to an existing heading by id', () => {
      const { controller } = setup(HEADINGS);
      controller.update();
      const heading = document.getElementById('h-three');

      controller.scrollToHeading('h-three');

      expect(heading.scrollIntoView).toHaveBeenCalled();
    });

    it('is a no-op for an unknown id', () => {
      const { controller } = setup(HEADINGS);
      controller.update();
      expect(() => controller.scrollToHeading('does-not-exist')).not.toThrow();
    });
  });

  describe('setupScrollObserver (via update)', () => {
    it('observes every heading element', () => {
      const { controller } = setup(HEADINGS);
      controller.update();

      expect(observerInstances.length).toBe(1);
      expect(observerInstances[0].observed.length).toBe(3);
    });

    it('does not create an observer when there are no headings', () => {
      const { controller } = setup('<p>text</p>');
      controller.update();
      expect(observerInstances.length).toBe(0);
    });

    it('disconnects a stale observer before creating a new one', () => {
      const { controller } = setup(HEADINGS);
      controller.update();
      const first = observerInstances[0];
      const disconnectSpy = vi.spyOn(first, 'disconnect');

      controller.update();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(observerInstances.length).toBe(2);
    });
  });

  describe('active heading sync on scroll', () => {
    // getActiveHeadingId 完全依赖布局尺寸，桩 scrollRoot 与各标题的几何数据。
    function stubLayout(scrollRoot, { scrollTop, scrollHeight, clientHeight, headingTops }) {
      Object.defineProperty(scrollRoot, 'scrollTop', { value: scrollTop, configurable: true });
      Object.defineProperty(scrollRoot, 'scrollHeight', { value: scrollHeight, configurable: true });
      Object.defineProperty(scrollRoot, 'clientHeight', { value: clientHeight, configurable: true });
      scrollRoot.getBoundingClientRect = () => ({ top: 0, height: clientHeight });

      Object.entries(headingTops).forEach(([id, top]) => {
        document.getElementById(id).getBoundingClientRect = () => ({ top });
      });
    }

    it('activates the last heading scrolled past the activation line', () => {
      const { state, controller, scrollRoot } = setup(HEADINGS);
      controller.update();

      // activationLine = 0 + 1000 * 0.15 = 150。h-one/h-two 在其上方，h-three 在下方。
      stubLayout(scrollRoot, {
        scrollTop: 200,
        scrollHeight: 3000,
        clientHeight: 1000,
        headingTops: { 'h-one': -100, 'h-two': 50, 'h-three': 400 }
      });

      scrollRoot.dispatchEvent(new globalThis.Event('scroll'));

      expect(state.toc.activeId).toBe('h-two');
    });

    it('activates the last heading when scrolled to the bottom', () => {
      const { state, controller, scrollRoot } = setup(HEADINGS);
      controller.update();

      // scrollTop 接近 maxScrollTop(=scrollHeight-clientHeight=2000)
      stubLayout(scrollRoot, {
        scrollTop: 1999,
        scrollHeight: 3000,
        clientHeight: 1000,
        headingTops: { 'h-one': -500, 'h-two': -200, 'h-three': -50 }
      });

      scrollRoot.dispatchEvent(new globalThis.Event('scroll'));

      expect(state.toc.activeId).toBe('h-three');
    });

    it('falls back to the first heading when none is past the line', () => {
      const { state, controller, scrollRoot } = setup(HEADINGS);
      controller.update();

      stubLayout(scrollRoot, {
        scrollTop: 0,
        scrollHeight: 3000,
        clientHeight: 1000,
        headingTops: { 'h-one': 300, 'h-two': 500, 'h-three': 800 }
      });

      scrollRoot.dispatchEvent(new globalThis.Event('scroll'));

      expect(state.toc.activeId).toBe('h-one');
    });
  });

  describe('resize drag', () => {
    it('handleResizeMousedown seeds resize state and cursor', () => {
      const { refs, state, controller } = setup(HEADINGS);
      refs.mainContainer.getBoundingClientRect = () => ({ left: 0 });

      controller.handleResizeMousedown({ clientX: 200, preventDefault: vi.fn() });

      expect(state.tocResize.active).toBe(true);
      expect(document.body.style.cursor).toBe('col-resize');
      expect(refs.tocResizer.classList.contains('dragging')).toBe(true);
    });

    it('handleResizeMouseMove sets panel width within bounds', () => {
      const { refs, controller } = setup(HEADINGS);
      refs.mainContainer.getBoundingClientRect = () => ({ left: 0 });
      controller.handleResizeMousedown({ clientX: 200, preventDefault: vi.fn() });

      controller.handleResizeMouseMove({ clientX: 250 });
      expect(refs.tocPanel.style.width).toBe('250px');
    });

    it('handleResizeMouseMove ignores widths outside the 150-400 range', () => {
      const { refs, controller } = setup(HEADINGS);
      refs.mainContainer.getBoundingClientRect = () => ({ left: 0 });
      controller.handleResizeMousedown({ clientX: 200, preventDefault: vi.fn() });

      controller.handleResizeMouseMove({ clientX: 500 }); // 超上限
      expect(refs.tocPanel.style.width).toBe('');

      controller.handleResizeMouseMove({ clientX: 100 }); // 低于下限
      expect(refs.tocPanel.style.width).toBe('');
    });

    it('handleResizeMouseMove is a no-op when not actively resizing', () => {
      const { refs, controller } = setup(HEADINGS);
      controller.handleResizeMouseMove({ clientX: 250 });
      expect(refs.tocPanel.style.width).toBe('');
    });

    it('handleResizeMouseUp clears resize state and body styles', () => {
      const { refs, state, controller } = setup(HEADINGS);
      refs.mainContainer.getBoundingClientRect = () => ({ left: 0 });
      controller.handleResizeMousedown({ clientX: 200, preventDefault: vi.fn() });

      controller.handleResizeMouseUp();

      expect(state.tocResize.active).toBe(false);
      expect(document.body.style.cursor).toBe('');
      expect(refs.tocResizer.classList.contains('dragging')).toBe(false);
    });
  });

  describe('destroy', () => {
    it('disconnects the observer', () => {
      const { controller } = setup(HEADINGS);
      controller.update();
      const disconnectSpy = vi.spyOn(observerInstances[0], 'disconnect');

      controller.destroy();

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });
});
