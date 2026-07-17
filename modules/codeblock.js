export function createCodeBlockController({ state }) {
  async function copyCodeText(pre, button) {
    const code = pre.querySelector('code');
    if (!code) return;

    const text = code.textContent;

    try {
      await navigator.clipboard.writeText(text);
    } catch { // Clipboard API 不可用（非安全上下文等）→ 降级到 execCommand
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

  return {
    copyCodeText,
    adjustCodeFont,
    adjustCodeBlockSize,
    startCodeResize,
    updateCodeResize,
    finishCodeResize
  };
}
