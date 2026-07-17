export function createTocController({ refs, state }) {
  let observer = null;
  const scrollRoot = refs.preview.parentElement || refs.preview;

  const handlePreviewScroll = () => {
    syncActiveHeading();
  };

  scrollRoot.addEventListener('scroll', handlePreviewScroll, { passive: true });

  function extractHeadings() {
    const headings = [];
    const headingElements = refs.preview.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headingElements.forEach(el => {
      headings.push({
        id: el.id,
        text: el.textContent,
        level: parseInt(el.dataset.headingLevel || el.tagName[1], 10),
        element: el
      });
    });

    return headings;
  }

  function renderToc() {
    state.toc.items = extractHeadings();

    if (state.toc.items.length === 0) {
      setActiveHeading('');
      const empty = document.createElement('div');
      empty.className = 'toc-empty';
      empty.textContent = '暂无标题';
      refs.tocNav.replaceChildren(empty);
      return;
    }

    const links = state.toc.items.map(item => {
      const link = document.createElement('a');
      link.className = `toc-item level-${item.level}`;
      link.dataset.id = item.id;
      link.title = item.text;
      link.textContent = item.text;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const id = link.dataset.id;
        setActiveHeading(id);
        scrollToHeading(id);
      });
      return link;
    });

    refs.tocNav.replaceChildren(...links);
    updateActiveTocItem(state.toc.activeId);
  }

  function getHeadingElementById(id) {
    return state.toc.items.find(item => item.id === id)?.element || document.getElementById(id);
  }

  function scrollToHeading(id) {
    const element = getHeadingElementById(id);
    if (!element) return;

    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setActiveHeading(activeId) {
    state.toc.activeId = activeId;
    updateActiveTocItem(activeId);
  }

  function getActiveHeadingId() {
    if (state.toc.items.length === 0) return '';

    const scrollRootRect = scrollRoot.getBoundingClientRect();
    const activationLine = scrollRootRect.top + scrollRoot.clientHeight * 0.15;
    const maxScrollTop = scrollRoot.scrollHeight - scrollRoot.clientHeight;

    if (maxScrollTop <= 0) {
      return state.toc.items[0].id;
    }

    if (scrollRoot.scrollTop >= maxScrollTop - 4) {
      return state.toc.items[state.toc.items.length - 1].id;
    }

    let activeId = '';

    state.toc.items.forEach(item => {
      if (item.element.getBoundingClientRect().top <= activationLine) {
        activeId = item.id;
      }
    });

    return activeId || state.toc.items[0].id;
  }

  function syncActiveHeading() {
    setActiveHeading(getActiveHeadingId());
  }

  function setupScrollObserver() {
    if (observer) {
      observer.disconnect();
    }

    const headingElements = refs.preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headingElements.length === 0) {
      setActiveHeading('');
      return;
    }

    observer = new IntersectionObserver(
      () => {
        syncActiveHeading();
      },
      {
        root: scrollRoot,
        rootMargin: '-10% 0px -70% 0px',
        threshold: 0
      }
    );

    headingElements.forEach(el => observer.observe(el));
    syncActiveHeading();
  }

  function updateActiveTocItem(activeId) {
    let activeLink = null;
    refs.tocNav.querySelectorAll('.toc-item').forEach(link => {
      const isActive = !!activeId && link.dataset.id === activeId;
      link.classList.toggle('active', isActive);
      if (isActive) activeLink = link;
    });

    // 将活跃目录项滚动到可视区域
    if (activeLink) {
      const nav = refs.tocNav;
      const navRect = nav.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();

      if (linkRect.top < navRect.top) {
        // 目录项在可视区上方，向上滚动
        nav.scrollTop += linkRect.top - navRect.top - 8;
      } else if (linkRect.bottom > navRect.bottom) {
        // 目录项在可视区下方，向下滚动
        nav.scrollTop += linkRect.bottom - navRect.bottom + 8;
      }
    }
  }

  function update() {
    renderToc();
    setupScrollObserver();
  }

  function destroy() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    scrollRoot.removeEventListener('scroll', handlePreviewScroll);
  }

  function handleResizeMousedown(e) {
    state.tocResize.active = true;
    state.tocResize.containerRect = refs.mainContainer.getBoundingClientRect();
    state.tocResize.pendingClientX = e.clientX;
    refs.mainContainer.classList.add('is-resizing');
    refs.tocResizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function handleResizeMouseMove(e) {
    if (!state.tocResize.active) return;

    const containerRect = state.tocResize.containerRect || refs.mainContainer.getBoundingClientRect();
    const tocWidth = e.clientX - containerRect.left;

    if (tocWidth >= 150 && tocWidth <= 400) {
      refs.tocPanel.style.width = `${tocWidth}px`;
    }
  }

  function handleResizeMouseUp() {
    if (!state.tocResize.active) return;

    state.tocResize.active = false;
    state.tocResize.containerRect = null;
    state.tocResize.pendingClientX = 0;
    refs.mainContainer.classList.remove('is-resizing');
    refs.tocResizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  return {
    update,
    destroy,
    scrollToHeading,
    handleResizeMousedown,
    handleResizeMouseMove,
    handleResizeMouseUp
  };
}
