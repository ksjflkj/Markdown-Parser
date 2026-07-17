export function createSearchController({ refs, state }) {
  function clearHighlights() {
    state.searchMarks.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
      }
    });

    state.searchMarks = [];
    state.searchCurrentIdx = -1;
  }

  function open() {
    refs.searchBar.classList.add('show');
    refs.searchInput.focus();
    refs.searchInput.select();
  }

  function close() {
    refs.searchBar.classList.remove('show');
    clearHighlights();
    refs.searchInput.value = '';
    refs.searchCount.textContent = '';
  }

  function perform() {
    if (state.searchProcessing) return;
    state.searchProcessing = true;

    try {
      clearHighlights();
    } catch (e) {
      console.warn('清除搜索高亮失败:', e);
      state.searchProcessing = false;
      return;
    }

    const query = refs.searchInput.value.trim();

    if (!query) {
      state.searchProcessing = false;
      refs.searchCount.textContent = '';
      return;
    }

    const walker = document.createTreeWalker(refs.preview, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
      // 跳过代码工具栏、搜索高亮、已处理过的节点
      if (node.parentElement.closest('.code-toolbar, .search-highlight, .code-lang')) continue;
      textNodes.push(node);
    }

    const queryLower = query.toLowerCase();

    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      const textLower = text.toLowerCase();
      let startIdx = 0;
      const fragments = [];
      let lastEnd = 0;

      while ((startIdx = textLower.indexOf(queryLower, startIdx)) !== -1) {
        if (startIdx > lastEnd) {
          fragments.push(document.createTextNode(text.substring(lastEnd, startIdx)));
        }

        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = text.substring(startIdx, startIdx + query.length);
        fragments.push(mark);
        state.searchMarks.push(mark);

        lastEnd = startIdx + query.length;
        startIdx = lastEnd;
      }

      if (fragments.length === 0) return;

      if (lastEnd < text.length) {
        fragments.push(document.createTextNode(text.substring(lastEnd)));
      }

      const parent = textNode.parentNode;
      fragments.forEach(fragment => parent.insertBefore(fragment, textNode));
      parent.removeChild(textNode);
    });

    state.searchProcessing = false;

    if (state.searchMarks.length > 0) {
      state.searchCurrentIdx = 0;
      activate(0);
      return;
    }

    refs.searchCount.textContent = '0 结果';
  }

  function activate(idx) {
    state.searchMarks.forEach(mark => {
      mark.className = 'search-highlight';
    });

    if (idx >= 0 && idx < state.searchMarks.length) {
      state.searchMarks[idx].className = 'search-highlight-active';
      state.searchMarks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      refs.searchCount.textContent = `${idx + 1} / ${state.searchMarks.length}`;
    }
  }

  function next() {
    if (state.searchMarks.length === 0) return;
    state.searchCurrentIdx = (state.searchCurrentIdx + 1) % state.searchMarks.length;
    activate(state.searchCurrentIdx);
  }

  function prev() {
    if (state.searchMarks.length === 0) return;
    state.searchCurrentIdx = (state.searchCurrentIdx - 1 + state.searchMarks.length) % state.searchMarks.length;
    activate(state.searchCurrentIdx);
  }

  function schedule() {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(perform, 200);
  }

  function handlePreviewRendered({ isEmpty, error }) {
    if (isEmpty || error) {
      clearHighlights();
      refs.searchCount.textContent = refs.searchInput.value.trim() ? '0 结果' : '';
      return;
    }

    if (refs.searchBar.classList.contains('show') && refs.searchInput.value.trim()) {
      perform();
    }
  }

  return {
    clearHighlights,
    open,
    close,
    perform,
    next,
    prev,
    schedule,
    handlePreviewRendered
  };
}
