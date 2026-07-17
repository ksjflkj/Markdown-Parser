import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchController } from '../modules/search.js';
import { createState } from '../modules/state.js';

// jsdom 未实现 scrollIntoView，activate() 会调用它，桩掉避免抛错。
beforeEach(() => {
  globalThis.Element.prototype.scrollIntoView = vi.fn();
});

// search.js 遍历 refs.preview 的文本节点做高亮，其余 refs 只读 classList/value/textContent。
function setup(previewHtml = '', searchBarShown = true) {
  document.body.innerHTML = `
    <div id="searchBar"${searchBarShown ? ' class="show"' : ''}></div>
    <input id="searchInput" />
    <span id="searchCount"></span>
    <div id="preview">${previewHtml}</div>
  `;

  const refs = {
    searchBar: document.getElementById('searchBar'),
    searchInput: document.getElementById('searchInput'),
    searchCount: document.getElementById('searchCount'),
    preview: document.getElementById('preview')
  };
  const state = createState();
  const controller = createSearchController({ refs, state });

  return { refs, state, controller };
}

describe('createSearchController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  describe('perform', () => {
    it('highlights every occurrence in a single text node', () => {
      const { refs, state, controller } = setup('<p>foo bar foo baz foo</p>');
      refs.searchInput.value = 'foo';

      controller.perform();

      expect(state.searchMarks.length).toBe(3);
      const marks = refs.preview.querySelectorAll('mark.search-highlight, mark.search-highlight-active');
      expect(marks.length).toBe(3);
      marks.forEach(m => expect(m.textContent).toBe('foo'));
    });

    it('matches case-insensitively but preserves the original casing in the mark', () => {
      const { refs, state, controller } = setup('<p>Hello HELLO hello</p>');
      refs.searchInput.value = 'hello';

      controller.perform();

      expect(state.searchMarks.length).toBe(3);
      expect(state.searchMarks.map(m => m.textContent)).toEqual(['Hello', 'HELLO', 'hello']);
    });

    it('activates the first match and shows the count', () => {
      const { refs, state, controller } = setup('<p>a a a</p>');
      refs.searchInput.value = 'a';

      controller.perform();

      expect(state.searchCurrentIdx).toBe(0);
      expect(state.searchMarks[0].className).toBe('search-highlight-active');
      expect(refs.searchCount.textContent).toBe('1 / 3');
    });

    it('reports zero results for a query with no matches', () => {
      const { refs, state, controller } = setup('<p>nothing here</p>');
      refs.searchInput.value = 'xyz';

      controller.perform();

      expect(state.searchMarks.length).toBe(0);
      expect(refs.searchCount.textContent).toBe('0 结果');
    });

    it('clears the count and does nothing for an empty/whitespace query', () => {
      const { refs, state, controller } = setup('<p>content</p>');
      refs.searchInput.value = '   ';

      controller.perform();

      expect(state.searchMarks.length).toBe(0);
      expect(refs.searchCount.textContent).toBe('');
    });

    it('skips text inside code toolbars and language labels', () => {
      const { refs, state, controller } = setup(
        '<pre><span class="code-lang">target</span>' +
          '<div class="code-toolbar"><button>target</button></div>' +
          '<code>target</code></pre>'
      );
      refs.searchInput.value = 'target';

      controller.perform();

      // 只有 <code> 内的 target 应被高亮，工具栏与语言标签内的被跳过
      expect(state.searchMarks.length).toBe(1);
    });

    it('finds matches across separate text nodes', () => {
      const { refs, state, controller } = setup('<p>hit</p><p>hit</p><span>hit</span>');
      refs.searchInput.value = 'hit';

      controller.perform();

      expect(state.searchMarks.length).toBe(3);
    });

    it('bails out re-entrantly when already processing', () => {
      const { refs, state, controller } = setup('<p>x x</p>');
      refs.searchInput.value = 'x';
      state.searchProcessing = true;

      controller.perform();

      expect(state.searchMarks.length).toBe(0);
    });
  });

  describe('clearHighlights', () => {
    it('removes marks and restores original text', () => {
      const { refs, state, controller } = setup('<p>one two one</p>');
      refs.searchInput.value = 'one';
      controller.perform();
      expect(refs.preview.querySelectorAll('mark').length).toBe(2);

      controller.clearHighlights();

      expect(refs.preview.querySelectorAll('mark').length).toBe(0);
      expect(state.searchMarks).toEqual([]);
      expect(state.searchCurrentIdx).toBe(-1);
      expect(refs.preview.textContent).toBe('one two one');
    });

    it('re-running a search does not accumulate stale marks', () => {
      const { refs, state, controller } = setup('<p>a a a</p>');
      refs.searchInput.value = 'a';
      controller.perform();
      controller.perform();
      expect(state.searchMarks.length).toBe(3);
    });
  });

  describe('next / prev', () => {
    it('cycles forward and wraps around', () => {
      const { refs, state, controller } = setup('<p>a a a</p>');
      refs.searchInput.value = 'a';
      controller.perform();
      expect(state.searchCurrentIdx).toBe(0);

      controller.next();
      expect(state.searchCurrentIdx).toBe(1);
      controller.next();
      expect(state.searchCurrentIdx).toBe(2);
      controller.next();
      expect(state.searchCurrentIdx).toBe(0); // 环回
      expect(refs.searchCount.textContent).toBe('1 / 3');
    });

    it('cycles backward and wraps around', () => {
      const { refs, state, controller } = setup('<p>a a a</p>');
      refs.searchInput.value = 'a';
      controller.perform();

      controller.prev();
      expect(state.searchCurrentIdx).toBe(2); // 从 0 向前环回到末尾
      controller.prev();
      expect(state.searchCurrentIdx).toBe(1);
    });

    it('marks only the active index with the active class', () => {
      const { refs, state, controller } = setup('<p>a a</p>');
      refs.searchInput.value = 'a';
      controller.perform();

      controller.next();

      expect(state.searchMarks[0].className).toBe('search-highlight');
      expect(state.searchMarks[1].className).toBe('search-highlight-active');
    });

    it('next / prev are no-ops when there are no matches', () => {
      const { state, controller } = setup('<p>content</p>');
      controller.next();
      expect(state.searchCurrentIdx).toBe(-1);
      controller.prev();
      expect(state.searchCurrentIdx).toBe(-1);
    });
  });

  describe('open / close', () => {
    it('open shows the bar and focuses the input', () => {
      const { refs, controller } = setup('<p>x</p>', false);
      const focusSpy = vi.spyOn(refs.searchInput, 'focus');

      controller.open();

      expect(refs.searchBar.classList.contains('show')).toBe(true);
      expect(focusSpy).toHaveBeenCalled();
    });

    it('close hides the bar, clears highlights, input and count', () => {
      const { refs, state, controller } = setup('<p>a a</p>');
      refs.searchInput.value = 'a';
      controller.perform();

      controller.close();

      expect(refs.searchBar.classList.contains('show')).toBe(false);
      expect(refs.searchInput.value).toBe('');
      expect(refs.searchCount.textContent).toBe('');
      expect(state.searchMarks).toEqual([]);
    });
  });

  describe('schedule', () => {
    it('debounces perform via a 200ms timer', () => {
      const { refs, state, controller } = setup('<p>a a</p>');
      refs.searchInput.value = 'a';

      controller.schedule();
      expect(state.searchMarks.length).toBe(0); // 尚未触发

      vi.advanceTimersByTime(200);
      expect(state.searchMarks.length).toBe(2);
    });

    it('resets the timer on rapid successive calls', () => {
      const { refs, state, controller } = setup('<p>a a</p>');
      refs.searchInput.value = 'a';

      controller.schedule();
      vi.advanceTimersByTime(100);
      controller.schedule();
      vi.advanceTimersByTime(100);
      expect(state.searchMarks.length).toBe(0); // 第一次被重置，累计未达 200ms

      vi.advanceTimersByTime(100);
      expect(state.searchMarks.length).toBe(2);
    });
  });

  describe('handlePreviewRendered', () => {
    it('clears highlights when the preview is empty', () => {
      const { refs, state, controller } = setup('<p>a a</p>');
      refs.searchInput.value = 'a';
      controller.perform();

      controller.handlePreviewRendered({ isEmpty: true });

      expect(state.searchMarks).toEqual([]);
      expect(refs.searchCount.textContent).toBe('0 结果'); // 有查询词
    });

    it('re-runs the search when the bar is open with a query', () => {
      const { refs, state, controller } = setup('<p>a a a</p>');
      refs.searchInput.value = 'a';

      // 模拟预览重渲染后回调
      controller.handlePreviewRendered({ isEmpty: false });

      expect(state.searchMarks.length).toBe(3);
    });

    it('does not search when the bar is closed', () => {
      const { refs, state, controller } = setup('<p>a a a</p>', false);
      refs.searchInput.value = 'a';

      controller.handlePreviewRendered({ isEmpty: false });

      expect(state.searchMarks.length).toBe(0);
    });

    it('clears the count fully when empty and no query', () => {
      const { refs, controller } = setup('<p>a</p>');
      refs.searchInput.value = '';

      controller.handlePreviewRendered({ isEmpty: true });

      expect(refs.searchCount.textContent).toBe('');
    });
  });
});
