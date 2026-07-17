export function createShortcutsController({ refs, editorController, fileController, searchController }) {
  function handleKeydown(e) {
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

    // refs.editor is now a CM6-backed adapter (not a DOM node), so gate on its
    // hasFocus() rather than document.activeElement. Undo/redo (Ctrl+Z / Ctrl+Y /
    // Ctrl+Shift+Z) are handled by CM6's own historyKeymap, so they're gone here.
    if (refs.editor.hasFocus && refs.editor.hasFocus()) {
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
  }

  function bind() {
    document.addEventListener('keydown', handleKeydown);
  }

  function destroy() {
    document.removeEventListener('keydown', handleKeydown);
  }

  return { bind, destroy };
}
