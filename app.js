import { createDomRefs } from './modules/dom.js';
import { createState } from './modules/state.js';
import { initLibraries, renderPreview as renderPreviewView, getRenderedContent } from './modules/render.js';
import { initTheme, initColorTheme } from './modules/theme.js';
import { createEditorController } from './modules/editor.js';
import { createSearchController } from './modules/search.js';
import { createFileController } from './modules/files.js';
import { createTocController } from './modules/toc.js';
import { createCodeBlockController } from './modules/codeblock.js';
import { createPaneResizeController } from './modules/pane-resize.js';
import { createShortcutsController } from './modules/shortcuts.js';
import { createImageController } from './modules/images.js';

// ==========================================
// App Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
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
  const imageController = createImageController({ editorController, showToast });
  const fileController = createFileController({
    refs,
    state,
    editorController,
    imageController,
    getRenderedContent,
    showToast
  });
  const tocController = createTocController({ refs, state });
  const codeBlockController = createCodeBlockController({ state });
  const paneResizeController = createPaneResizeController({ refs, state });
  const shortcutsController = createShortcutsController({
    refs, editorController, fileController, searchController
  });

  initColorTheme({ refs, showToast });
  bindViewToggle();
  bindCoreEvents();
  bindElectronEvents();
  // 刷新时优先从磁盘重新读取上次打开的文件（若磁盘有更新），否则回退到本地存储恢复。
  const synced = await fileController.syncFromDiskIfAvailable();
  if (!synced) {
    editorController.restoreInitialContent();
  }
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
    // CM6 drives rendering via its updateListener (onDocChanged → handleInput)
    // and handles indentation/undo/redo through its keymap, so we no longer bind
    // 'input'/'keydown' here. Paste still needs forwarding for image embedding;
    // the adapter attaches it to the CM6 content DOM.
    refs.editor.addEventListener('paste', imageController.handlePaste);

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
    refs.resizer.addEventListener('mousedown', paneResizeController.handleMousedown);
    refs.tocResizer.addEventListener('mousedown', tocController.handleResizeMousedown);
    fileController.bindDragAndDropEvents();
    shortcutsController.bind();
    window.addEventListener('resize', paneResizeController.syncAxis);

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
        await codeBlockController.copyCodeText(pre, actionEl);
        return;
      }

      if (action === 'font-zoom') {
        codeBlockController.adjustCodeFont(pre, delta);
        return;
      }

      if (action === 'block-resize-step') {
        codeBlockController.adjustCodeBlockSize(pre, delta);
      }
    });

    refs.preview.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.code-resize-handle');
      if (!handle || !refs.preview.contains(handle)) return;

      const pre = handle.closest('pre');
      if (!pre) return;

      codeBlockController.startCodeResize(pre, handle.dataset.resizeMode, e);
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


  function handleGlobalMouseMove(e) {
    paneResizeController.handleMouseMove(e);
    codeBlockController.updateCodeResize(e);
    tocController.handleResizeMouseMove(e);
  }

  function handleGlobalMouseUp() {
    paneResizeController.handleMouseUp();
    codeBlockController.finishCodeResize();
    tocController.handleResizeMouseUp();
  }


});
