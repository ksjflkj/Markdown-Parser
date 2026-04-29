import { createDomRefs } from './modules/dom.js';
import { createState } from './modules/state.js';
import { initLibraries, renderPreview as renderPreviewView, getRenderedContent } from './modules/render.js';
import { initTheme, initColorTheme } from './modules/theme.js';
import { createEditorController } from './modules/editor.js';
import { createSearchController } from './modules/search.js';
import { createFileController } from './modules/files.js';
import { createTocController } from './modules/toc.js';

// ==========================================
// App Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const refs = createDomRefs();
  const state = createState();

  initLibraries();
  initTheme({ refs, state });

  const editorController = createEditorController({
    refs,
    state,
    renderPreview
  });
  const searchController = createSearchController({ refs, state });
  const fileController = createFileController({
    refs,
    state,
    editorController,
    getRenderedContent,
    showToast
  });
  const tocController = createTocController({ refs, state });

  initColorTheme({ refs, showToast });
  bindViewToggle();
  bindCoreEvents();
  bindElectronEvents();
  editorController.restoreInitialContent();
  renderPreview();
  editorController.updateStats();

  function renderPreview() {
    renderPreviewView({
      refs,
      onAfterRender: ({ isEmpty, error }) => {
        searchController.handlePreviewRendered({ isEmpty, error });
        tocController.update();
      }
    });
  }

  function bindCoreEvents() {
    refs.editor.addEventListener('input', editorController.handleInput);

    refs.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = refs.editor.selectionStart;
        const end = refs.editor.selectionEnd;
        const value = refs.editor.value;
        const previousValue = value;

        if (start === end) {
          refs.editor.value = value.substring(0, start) + '  ' + value.substring(end);
          refs.editor.selectionStart = refs.editor.selectionEnd = start + 2;
          editorController.scheduleRender(previousValue);
          return;
        }

        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const selectedText = value.substring(lineStart, end);
        const indentedText = selectedText
          .split('\n')
          .map(line => `  ${line}`)
          .join('\n');

        refs.editor.value = value.substring(0, lineStart) + indentedText + value.substring(end);
        refs.editor.selectionStart = start + 2;
        refs.editor.selectionEnd = end + (indentedText.length - selectedText.length);
        editorController.scheduleRender(previousValue);
      }
    });

    refs.btnCopyHtml.addEventListener('click', fileController.copyHtmlToClipboard);
    refs.btnExport.addEventListener('click', fileController.openExportModal);
    refs.modalClose.addEventListener('click', fileController.closeExportModal);
    refs.exportModal.addEventListener('click', (e) => {
      if (e.target === refs.exportModal) fileController.closeExportModal();
    });

    refs.exportHtml.addEventListener('click', fileController.exportHtmlFile);
    refs.exportMd.addEventListener('click', fileController.exportMarkdownFile);

    if (refs.btnSave) {
      refs.btnSave.addEventListener('click', fileController.trySaveFile);
    }

    if (refs.btnOpen) {
      refs.btnOpen.addEventListener('click', fileController.openFile);
    }

    // Format toolbar
    if (refs.formatToolbar) {
      refs.formatToolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('.format-btn');
        if (!btn) return;

        const format = btn.dataset.format;
        if (format === 'heading' || format === 'task') return; // Dropdown formats use menu items
        editorController.formatText(format);
      });

      refs.formatToolbar.addEventListener('click', (e) => {
        const item = e.target.closest('.format-dropdown-item');
        if (!item) return;

        if (item.dataset.heading) {
          const level = parseInt(item.dataset.heading, 10);
          editorController.formatHeading(level);
          return;
        }

        if (item.dataset.task) {
          editorController.formatTaskList(item.dataset.task);
        }
      });
    }

    refs.btnSearch.addEventListener('click', searchController.open);
    refs.searchClose.addEventListener('click', searchController.close);
    refs.searchNext.addEventListener('click', searchController.next);
    refs.searchPrev.addEventListener('click', searchController.prev);

    refs.searchInput.addEventListener('input', searchController.schedule);

    refs.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.shiftKey ? searchController.prev() : searchController.next();
      }

      if (e.key === 'Escape') {
        searchController.close();
      }
    });

    refs.btnCustomTheme.addEventListener('click', () => {
      refs.customThemeModal.classList.add('show');
    });

    refs.themeModalClose.addEventListener('click', () => {
      refs.customThemeModal.classList.remove('show');
    });

    refs.customThemeModal.addEventListener('click', (e) => {
      if (e.target === refs.customThemeModal) {
        refs.customThemeModal.classList.remove('show');
      }
    });

    bindPreviewDelegatedEvents();
    bindPaneResizeEvents();
    bindTocResizeEvents();
    fileController.bindDragAndDropEvents();
    bindKeyboardShortcuts();

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
  }

  // 处理 Electron 菜单事件
  function bindElectronEvents() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onMenuOpenFile(() => fileController.openFile());
      window.electronAPI.onMenuSaveFile(() => fileController.trySaveFile());
      window.electronAPI.onMenuSaveAs(() => fileController.openExportModal());
      window.electronAPI.onMenuView((view) => {
        const btn = document.querySelector(`[data-view="${view}"]`);
        if (btn) btn.click();
      });
    }
  }

  function bindViewToggle() {
    refs.viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        refs.viewButtons.forEach(button => button.classList.remove('active'));
        btn.classList.add('active');
        refs.mainContainer.setAttribute('data-view', btn.dataset.view);

        // 切换视图时清除拖拽留下的内联样式，避免偏移
        refs.editorPanel.style.flex = '';
        refs.previewPanel.style.flex = '';
        refs.tocPanel.style.width = '';
      });
    });
  }

  function bindPreviewDelegatedEvents() {
    refs.preview.addEventListener('click', async (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl || !refs.preview.contains(actionEl)) return;

      const pre = actionEl.closest('pre');
      if (!pre) return;

      const action = actionEl.dataset.action;
      const delta = Number(actionEl.dataset.delta || '0');

      if (action === 'copy-code') {
        await copyCodeText(pre, actionEl);
        return;
      }

      if (action === 'font-zoom') {
        adjustCodeFont(pre, delta);
        return;
      }

      if (action === 'block-resize-step') {
        adjustCodeBlockSize(pre, delta);
      }
    });

    refs.preview.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.code-resize-handle');
      if (!handle || !refs.preview.contains(handle)) return;

      const pre = handle.closest('pre');
      if (!pre) return;

      startCodeResize(pre, handle.dataset.resizeMode, e);
    });
  }

  function bindPaneResizeEvents() {
    refs.resizer.addEventListener('mousedown', (e) => {
      const axis = getPaneResizeAxis();
      state.paneResize.active = true;
      state.paneResize.axis = axis;
      state.paneResize.containerRect = refs.mainContainer.getBoundingClientRect();
      state.paneResize.pendingClientX = e.clientX;
      state.paneResize.pendingClientY = e.clientY;
      refs.mainContainer.classList.add('is-resizing');
      refs.resizer.classList.add('dragging');
      document.body.style.cursor = axis === 'y' ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
  }

  function bindTocResizeEvents() {
    refs.tocResizer.addEventListener('mousedown', (e) => {
      state.tocResize.active = true;
      state.tocResize.containerRect = refs.mainContainer.getBoundingClientRect();
      state.tocResize.pendingClientX = e.clientX;
      refs.mainContainer.classList.add('is-resizing');
      refs.tocResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
  }

  function showToast(message) {
    refs.toastMessage.textContent = message;
    refs.toast.classList.add('show');
    clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => {
      refs.toast.classList.remove('show');
    }, 2500);
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        fileController.trySaveFile();
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        fileController.copyHtmlToClipboard();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchController.open();
      }

      if (e.key === 'Escape') {
        refs.exportModal.classList.remove('show');
        refs.customThemeModal.classList.remove('show');
        if (refs.searchBar.classList.contains('show')) {
          searchController.close();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        document.getElementById('btnSplit').click();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        document.getElementById('btnEditor').click();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        document.getElementById('btnPreview').click();
      }

      // Formatting shortcuts (only when editor is focused)
      if (document.activeElement === refs.editor) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
          e.preventDefault();
          editorController.formatText('bold');
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
          e.preventDefault();
          editorController.formatText('italic');
        }

        if ((e.ctrlKey || e.metaKey) && e.key === '`') {
          e.preventDefault();
          editorController.formatText('code');
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          editorController.formatText('link');
        }
      }

      // Undo/Redo shortcuts (only when editor is focused)
      if (document.activeElement === refs.editor) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          editorController.undo();
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          editorController.redo();
        }
      }
    });

    window.addEventListener('resize', syncPaneResizeAxis);
  }

  function syncPaneResizeAxis() {
    if (state.paneResize.active) return;
    state.paneResize.axis = getPaneResizeAxis();
  }

  function handleGlobalMouseMove(e) {
    queuePaneResize(e);
    updateCodeResize(e);
    updateTocResize(e);
  }

  function handleGlobalMouseUp() {
    flushPaneResize();
    finishPaneResize();
    finishCodeResize();
    finishTocResize();
  }

  function queuePaneResize(e) {
    if (!state.paneResize.active) return;

    state.paneResize.pendingClientX = e.clientX;
    state.paneResize.pendingClientY = e.clientY;

    if (state.paneResize.frameId) return;

    state.paneResize.frameId = requestAnimationFrame(() => {
      state.paneResize.frameId = null;
      updatePaneResize({
        clientX: state.paneResize.pendingClientX,
        clientY: state.paneResize.pendingClientY
      });
    });
  }

  function flushPaneResize() {
    if (!state.paneResize.active) return;

    if (state.paneResize.frameId) {
      cancelAnimationFrame(state.paneResize.frameId);
      state.paneResize.frameId = null;
    }

    updatePaneResize({
      clientX: state.paneResize.pendingClientX,
      clientY: state.paneResize.pendingClientY
    });
  }

  function updatePaneResize(e) {
    if (!state.paneResize.active) return;

    const axis = state.paneResize.axis || getPaneResizeAxis();
    const containerRect = state.paneResize.containerRect || refs.mainContainer.getBoundingClientRect();

    if (axis === 'y') {
      const offsetY = e.clientY - containerRect.top;
      const percentage = (offsetY / containerRect.height) * 100;

      if (percentage > 20 && percentage < 80) {
        refs.editorPanel.style.flex = `0 0 ${percentage}%`;
        refs.previewPanel.style.flex = `0 0 ${100 - percentage}%`;
      }

      return;
    }

    const offsetX = e.clientX - containerRect.left;
    const percentage = (offsetX / containerRect.width) * 100;

    if (percentage > 20 && percentage < 80) {
      refs.editorPanel.style.flex = `0 0 ${percentage}%`;
      refs.previewPanel.style.flex = `0 0 ${100 - percentage}%`;
    }
  }

  function getPaneResizeAxis() {
    return window.innerWidth <= 768 ? 'y' : 'x';
  }

  function finishPaneResize() {
    if (!state.paneResize.active) return;

    if (state.paneResize.frameId) {
      cancelAnimationFrame(state.paneResize.frameId);
    }

    state.paneResize.active = false;
    state.paneResize.axis = getPaneResizeAxis();
    state.paneResize.containerRect = null;
    state.paneResize.pendingClientX = 0;
    state.paneResize.pendingClientY = 0;
    state.paneResize.frameId = null;
    refs.mainContainer.classList.remove('is-resizing');
    refs.resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function updateTocResize(e) {
    if (!state.tocResize.active) return;

    const containerRect = state.tocResize.containerRect || refs.mainContainer.getBoundingClientRect();
    const tocWidth = e.clientX - containerRect.left;

    if (tocWidth >= 150 && tocWidth <= 400) {
      refs.tocPanel.style.width = `${tocWidth}px`;
    }
  }

  function finishTocResize() {
    if (!state.tocResize.active) return;

    state.tocResize.active = false;
    state.tocResize.containerRect = null;
    state.tocResize.pendingClientX = 0;
    refs.mainContainer.classList.remove('is-resizing');
    refs.tocResizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  async function copyCodeText(pre, button) {
    const code = pre.querySelector('code');
    if (!code) return;

    const text = code.textContent;

    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    button.textContent = '已复制 ✓';
    setTimeout(() => {
      button.textContent = '复制';
    }, 2000);
  }

  function adjustCodeFont(pre, delta) {
    const code = pre.querySelector('code');
    const label = pre.querySelector('.code-font-level');
    if (!code || !label) return;

    let currentZoom = parseInt(code.dataset.fontZoom || '100', 10);

    if (delta === 0) {
      currentZoom = 100;
    } else {
      currentZoom = Math.max(50, Math.min(200, currentZoom + delta));
    }

    code.dataset.fontZoom = String(currentZoom);
    code.style.fontSize = `${(currentZoom / 100) * 13.5}px`;
    label.textContent = `${currentZoom}%`;
    flashControlLabel(label);
  }

  function adjustCodeBlockSize(pre, delta) {
    const code = pre.querySelector('code');
    const label = pre.querySelector('.code-zoom-level');
    if (!code || !label) return;

    if (delta === 0) {
      code.style.maxHeight = '';
      code.style.height = '';
      pre.style.width = '';
      pre.style.maxWidth = '';
      label.textContent = '默认';
    } else {
      const currentHeight = code.offsetHeight;
      const newHeight = Math.max(60, currentHeight + delta);
      code.style.maxHeight = `${newHeight}px`;
      code.style.height = `${newHeight}px`;
      label.textContent = `${newHeight}px`;
    }

    flashControlLabel(label);
  }

  function startCodeResize(pre, mode, event) {
    const code = pre.querySelector('code');
    const label = pre.querySelector('.code-zoom-level');
    if (!code || !label) return;

    state.codeResize = {
      pre,
      code,
      label,
      mode: mode || 'height',
      startX: event.clientX,
      startY: event.clientY,
      startH: code.offsetHeight,
      startW: pre.offsetWidth
    };

    const cursor = state.codeResize.mode === 'width'
      ? 'ew-resize'
      : state.codeResize.mode === 'both'
        ? 'nwse-resize'
        : 'ns-resize';

    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
    event.preventDefault();
  }

  function updateCodeResize(event) {
    if (!state.codeResize) return;

    const { pre, code, label, mode, startX, startY, startH, startW } = state.codeResize;

    if (mode === 'height' || mode === 'both') {
      const dy = event.clientY - startY;
      const newHeight = Math.max(60, startH + dy);
      code.style.maxHeight = `${newHeight}px`;
      code.style.height = `${newHeight}px`;
    }

    if (mode === 'width' || mode === 'both') {
      const dx = event.clientX - startX;
      const newWidth = Math.max(200, startW + dx);
      pre.style.width = `${newWidth}px`;
      pre.style.maxWidth = 'none';
    }

    if (mode === 'height') {
      label.textContent = `${code.offsetHeight}px`;
    } else if (mode === 'width') {
      label.textContent = `${pre.offsetWidth}px`;
    } else {
      label.textContent = `${pre.offsetWidth} × ${code.offsetHeight}`;
    }
  }

  function finishCodeResize() {
    if (!state.codeResize) return;

    state.codeResize = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function flashControlLabel(label) {
    label.classList.add('zoom-flash');
    setTimeout(() => label.classList.remove('zoom-flash'), 300);
  }
});
