// File System Access API 的句柄无法存入 localStorage，但可结构化克隆到 IndexedDB，
// 这样刷新页面后仍能定位到上次打开的文件并重新读取磁盘上的最新内容。
const HANDLE_DB_NAME = 'md-parser';
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE = 'file-handles';
const HANDLE_KEY = 'current';
const LAST_SYNC_KEY = 'md-parser-last-sync-time';

function openHandleDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistFileHandle(handle) {
  if (!handle) return;
  try {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Failed to persist file handle:', err);
  }
}

async function getPersistedFileHandle() {
  try {
    const db = await openHandleDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle || null;
  } catch (err) {
    console.warn('Failed to read persisted file handle:', err);
    return null;
  }
}

async function clearPersistedFileHandle() {
  try {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Failed to clear persisted file handle:', err);
  }
}

// 记录上次从磁盘加载/写入文件的时间戳，用于刷新时判断磁盘文件是否被外部修改过。
function setLastSyncTime(ms) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(ms));
  } catch { /* localStorage 不可用或配额满，时间戳非关键，忽略 */ }
}

function getLastSyncTime() {
  const v = localStorage.getItem(LAST_SYNC_KEY);
  return v ? Number(v) || 0 : 0;
}

export function createFileController({ refs, state, editorController, imageController, getRenderedContent, showToast }) {
  // 剥离交互控件，输出干净内容
  function stripInteractiveElements(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // 移除代码工具栏
    doc.querySelectorAll('.code-toolbar, .code-resize-handle, .code-lang').forEach(el => el.remove());
    return doc.body.innerHTML;
  }

  async function copyHtmlToClipboard() {
    const { sanitizedHtml } = getRenderedContent(refs.editor.value);
    const cleanHtml = stripInteractiveElements(sanitizedHtml);

    try {
      await navigator.clipboard.writeText(cleanHtml);
      showToast('HTML 已复制到剪贴板');
    } catch { // Clipboard API 不可用（非安全上下文等），降级到 execCommand
      const ta = document.createElement('textarea');
      ta.value = cleanHtml;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('HTML 已复制到剪贴板');
    }
  }

  function openExportModal() {
    refs.exportModal.classList.add('show');
  }

  function closeExportModal() {
    refs.exportModal.classList.remove('show');
  }

  async function openFile() {
    try {
      // 优先使用 File System Access API
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'Markdown Files',
            accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt', '.mdown'] }
          }]
        });
        state.currentFileHandle = handle;
        const file = await handle.getFile();
        editorController.setContent(await file.text(), { resetUndo: true });
        setLastSyncTime(file.lastModified);
        persistFileHandle(handle);
        showToast(`已打开: ${file.name}`);
        return;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('File open failed:', err);
      } else {
        return;
      }
    }

    // 降级方案：使用隐藏的 file input
    openFileFallback();
  }

  function openFileFallback() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,.mdown,text/markdown,text/plain';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      state.currentFileHandle = null;
      editorController.setContent(await file.text(), { resetUndo: true });
      setLastSyncTime(file.lastModified);
      clearPersistedFileHandle();
      localStorage.setItem('md-parser-last-file-name', file.name);
      showToast(`已打开: ${file.name}`);
    };
    input.click();
  }

  function exportHtmlFile() {
    const { sanitizedHtml } = getRenderedContent(refs.editor.value);
    const cleanHtml = stripInteractiveElements(sanitizedHtml);
    const htmlContent = generateFullHtmlDocument(cleanHtml);
    downloadFile('document.html', htmlContent, 'text/html');
    closeExportModal();
    showToast('HTML 文件已下载');
  }

  function exportMarkdownFile() {
    downloadFile('document.md', refs.editor.value, 'text/markdown');
    closeExportModal();
    showToast('Markdown 文件已下载');
  }

  async function writeToHandle(handle) {
    const writable = await handle.createWritable();
    await writable.write(refs.editor.value);
    await writable.close();
    setLastSyncTime(Date.now());
    persistFileHandle(handle);
  }

  async function ensureWritePermission(handle) {
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') return true;
    if (permission === 'prompt') {
      return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    }
    return false;
  }

  async function trySaveFile() {
    try {
      localStorage.setItem('md-parser-content', refs.editor.value);
    } catch { /* quota exceeded — file save below is the primary path */ }

    if (state.currentFileHandle && state.currentFileHandle.createWritable) {
      try {
        if (await ensureWritePermission(state.currentFileHandle)) {
          await writeToHandle(state.currentFileHandle);
          showToast('文档已保存到本地文件');
          return;
        }
      } catch (err) {
        console.warn('File handle error, falling back to save dialog:', err.message);
      }
    }

    if (window.showSaveFilePicker) {
      try {
        const lastFileName = localStorage.getItem('md-parser-last-file-name') || 'document.md';
        const handle = await window.showSaveFilePicker({
          types: [{
            description: 'Markdown File',
            accept: { 'text/markdown': ['.md', '.markdown'] }
          }],
          suggestedName: lastFileName
        });

        state.currentFileHandle = handle;
        await writeToHandle(handle);
        localStorage.setItem('md-parser-last-file-name', handle.name);
        showToast('文档已保存');
      } catch (err) {
        if (err.name === 'AbortError') {
          showToast('已取消');
        } else {
          console.error('Save failed:', err);
          showToast('保存失败');
        }
      }
      return;
    }

    showToast('内容已自动保存');
  }

  function bindDragAndDropEvents() {
    // Dragging an in-page image (the expanded base64 preview in the editor, or an
    // <img> in the preview pane) makes the browser synthesize an image file in
    // dataTransfer, which the drop handler below would re-embed as a brand-new
    // image. Files dragged in from the OS never fire dragstart inside the page, so
    // any dragstart we see means the drag started internally — mark it regardless
    // of which element it came from, and the drop handler ignores its files.
    document.addEventListener('dragstart', () => {
      state.internalDrag = true;
    });
    document.addEventListener('dragend', () => {
      state.internalDrag = false;
    });

    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      state.dragCounter += 1;
      if (state.dragCounter === 1) {
        refs.dropZone.classList.add('show');
      }
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      // 防止鼠标移入 dropZone 子元素时触发 leave
      if (e.relatedTarget && refs.dropZone.contains(e.relatedTarget)) return;
      state.dragCounter -= 1;
      if (state.dragCounter === 0) {
        refs.dropZone.classList.remove('show');
      }
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      // 保持遮罩显示，防止鼠标进入子元素时触发 dragleave 隐藏遮罩
      refs.dropZone.classList.add('show');
    });

    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      state.dragCounter = 0;
      refs.dropZone.classList.remove('show');

      // 拖拽源自编辑器内部（例如展开的 base64 图片预览）时，dataTransfer 里的
      // 文件是浏览器合成的，忽略它避免把已有图片再内嵌一份。
      if (state.internalDrag) {
        state.internalDrag = false;
        return;
      }

      // 用 files.length 判断是否为真实文件拖放（文字拖拽不产生 files 条目）
      const hasFiles = e.dataTransfer.files && e.dataTransfer.files.length > 0;

      if (!hasFiles) return;

      // 图片文件优先内嵌为 base64，避免下面的句柄分支把图片当文本读取。
      if (imageController && Array.from(e.dataTransfer.files).some(f => f.type.startsWith('image/'))) {
        await imageController.insertImageFiles(e.dataTransfer.files);
        return;
      }

      let hasHandledDrop = false;
      if (e.dataTransfer.items) {
        for (const item of e.dataTransfer.items) {
          if (item.kind !== 'file' || !item.getAsFileSystemHandle) continue;

          try {
            const handle = await item.getAsFileSystemHandle();
            if (handle && handle.kind === 'file') {
              state.currentFileHandle = handle;
              const file = await handle.getFile();
              editorController.setContent(await file.text(), { resetUndo: true });
              setLastSyncTime(file.lastModified);
              persistFileHandle(handle);
              localStorage.setItem('md-parser-last-file-name', file.name);
              showToast(`已加载文件: ${file.name}`);
              hasHandledDrop = true;
              break;
            }
          } catch (err) {
            console.warn('Failed to get FileSystemHandle:', err);
          }
        }
      }

      if (hasHandledDrop) return;

      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt') || file.name.endsWith('.mdown') || file.type.startsWith('text/')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          state.currentFileHandle = null;
          editorController.setContent(evt.target.result, { resetUndo: true });
          setLastSyncTime(file.lastModified);
          clearPersistedFileHandle();
          localStorage.setItem('md-parser-last-file-name', file.name);
          showToast(`已加载文件: ${file.name}`);
        };
        reader.readAsText(file);
      } else {
        showToast('请拖放 Markdown 或文本文件');
      }
    });
  }

  function generateFullHtmlDocument(bodyHtml) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src *">
  <title>Markdown 文档</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.8;
      color: #1a1a2e;
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
    code { font-family: 'Fira Code', monospace; font-size: 0.9em; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #6c63ff; padding: 10px 20px; margin: 1em 0; background: #f8f8ff; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 10px 14px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    img { max-width: 100%; border-radius: 8px; }
    a { color: #6c63ff; }
    hr { border: none; height: 2px; background: linear-gradient(135deg, #6c63ff, #ff6584); opacity: 0.3; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 刷新页面时尝试从磁盘重新读取上次打开的文件。
  // 仅当磁盘文件的 mtime 比上次同步时间更新时才覆盖编辑器内容，
  // 这样外部修改（VSCode 等保存）会自动同步，而应用内未保存的编辑不会被覆盖。
  async function syncFromDiskIfAvailable() {
    const handle = await getPersistedFileHandle();
    if (!handle) return false;

    try {
      let granted = handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) === 'granted';
      if (!granted && handle.requestPermission) {
        // 刷新时通常无用户手势，requestPermission 可能被拒绝；尝试一次，失败则回退。
        try {
          const result = await handle.requestPermission({ mode: 'read' });
          granted = result === 'granted';
        } catch {
          granted = false;
        }
      }
      if (!granted) {
        // 权限不可用，仍恢复句柄以便保存时使用，但不覆盖编辑器内容。
        state.currentFileHandle = handle;
        return false;
      }

      const file = await handle.getFile();
      const lastSync = getLastSyncTime();
      state.currentFileHandle = handle;

      // 磁盘文件自上次加载后未变化 → 保留编辑器当前内容（来自 sessionStorage 恢复）。
      if (file.lastModified <= lastSync) {
        return false;
      }

      editorController.setContent(await file.text(), { resetUndo: true });
      setLastSyncTime(file.lastModified);
      localStorage.setItem('md-parser-last-file-name', file.name);
      showToast(`已从磁盘同步: ${file.name}`);
      return true;
    } catch (err) {
      // 文件可能已被移动/重命名/删除，清除失效句柄。
      console.warn('Failed to sync file from disk:', err);
      state.currentFileHandle = null;
      await clearPersistedFileHandle();
      return false;
    }
  }

  return {
    copyHtmlToClipboard,
    openFile,
    openExportModal,
    closeExportModal,
    exportHtmlFile,
    exportMarkdownFile,
    trySaveFile,
    bindDragAndDropEvents,
    syncFromDiskIfAvailable
  };
}
