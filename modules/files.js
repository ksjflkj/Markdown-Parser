export function createFileController({ refs, state, editorController, getRenderedContent, showToast }) {
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
    } catch (e) {
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

  async function trySaveFile() {
    localStorage.setItem('md-parser-content', refs.editor.value);

    // 优先尝试：使用已有文件句柄保存
    if (state.currentFileHandle && state.currentFileHandle.createWritable) {
      try {
        const permission = await state.currentFileHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          const writable = await state.currentFileHandle.createWritable();
          await writable.write(refs.editor.value);
          await writable.close();
          showToast('文档已保存到本地文件');
          return;
        }
        // 权限不足，尝试请求
        if (permission === 'prompt') {
          const newPermission = await state.currentFileHandle.requestPermission({ mode: 'readwrite' });
          if (newPermission === 'granted') {
            const writable = await state.currentFileHandle.createWritable();
            await writable.write(refs.editor.value);
            await writable.close();
            showToast('文档已保存到本地文件');
            return;
          }
        }
        // 权限被拒绝，不抛出异常，fallthrough 到保存对话框
      } catch (err) {
        // 文件句柄无效或出错，fallthrough 到保存对话框
        console.warn('File handle error, falling back to save dialog:', err.message);
      }
    }

    // 降级方案：弹出保存对话框
    if (window.showSaveFilePicker) {
      try {
        // 尝试使用之前的文件名作为建议名
        const lastFileName = localStorage.getItem('md-parser-last-file-name') || 'document.md';
        const handle = await window.showSaveFilePicker({
          types: [{
            description: 'Markdown File',
            accept: { 'text/markdown': ['.md', '.markdown'] }
          }],
          suggestedName: lastFileName
        });

        state.currentFileHandle = handle;
        const writable = await handle.createWritable();
        await writable.write(refs.editor.value);
        await writable.close();
        // 获取保存的文件名并保存到 localStorage
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

    // 兜底：内容已缓存
    showToast('内容已自动保存');
  }

  function bindDragAndDropEvents() {
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

      // 无法获取文件时的处理（如从云盘拖拽）
      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
        // 尝试作为文本内容处理（某些云盘支持）
        const text = e.dataTransfer.getData('text/plain');
        if (text) {
          editorController.setContent(text, { resetUndo: true });
          localStorage.removeItem('md-parser-last-file-name');
          showToast('已从拖拽内容加载');
          return;
        }
        showToast('无法读取拖拽的文件，请尝试直接打开');
        return;
      }

      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt') || file.name.endsWith('.mdown') || file.type.startsWith('text/')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          state.currentFileHandle = null;
          editorController.setContent(evt.target.result, { resetUndo: true });
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

  return {
    copyHtmlToClipboard,
    openFile,
    openExportModal,
    closeExportModal,
    exportHtmlFile,
    exportMarkdownFile,
    trySaveFile,
    bindDragAndDropEvents
  };
}
