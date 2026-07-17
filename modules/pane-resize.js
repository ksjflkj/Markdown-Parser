export function createPaneResizeController({ refs, state }) {
  function getAxis() {
    return window.innerWidth <= 768 ? 'y' : 'x';
  }

  // 拖动基准是「编辑器 + 预览」这块区域（编辑器左/上缘到预览右/下缘），
  // 不含目录面板和 resizer 的固定宽度，否则目录出现时分割条会跳动。
  function measureRegion(axis) {
    const editorRect = refs.editorPanel.getBoundingClientRect();
    const previewRect = refs.previewPanel.getBoundingClientRect();

    if (axis === 'y') {
      state.paneResize.regionStart = editorRect.top;
      state.paneResize.regionSize = previewRect.bottom - editorRect.top;
    } else {
      state.paneResize.regionStart = editorRect.left;
      state.paneResize.regionSize = previewRect.right - editorRect.left;
    }
  }

  function handleMousedown(e) {
    const axis = getAxis();
    state.paneResize.active = true;
    state.paneResize.axis = axis;
    measureRegion(axis);
    state.paneResize.pendingClientX = e.clientX;
    state.paneResize.pendingClientY = e.clientY;
    refs.mainContainer.classList.add('is-resizing');
    refs.resizer.classList.add('dragging');
    document.body.style.cursor = axis === 'y' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function update(e) {
    if (!state.paneResize.active) return;

    const axis = state.paneResize.axis || getAxis();
    const { regionStart, regionSize } = state.paneResize;
    if (!regionSize) return;

    const pointer = axis === 'y' ? e.clientY : e.clientX;
    // ratio = 编辑器占该区域的比例（0~1）。用 flex-grow 比例而非固定百分比，
    // 使目录/resizer 等固定宽度自动排除，窗口缩放时比例也自适应。
    const ratio = (pointer - regionStart) / regionSize;

    if (ratio > 0.2 && ratio < 0.8) {
      refs.editorPanel.style.flex = `${ratio} 1 0`;
      refs.previewPanel.style.flex = `${1 - ratio} 1 0`;
    }
  }

  function handleMouseMove(e) {
    if (!state.paneResize.active) return;

    state.paneResize.pendingClientX = e.clientX;
    state.paneResize.pendingClientY = e.clientY;

    if (state.paneResize.frameId) return;

    state.paneResize.frameId = requestAnimationFrame(() => {
      state.paneResize.frameId = null;
      update({
        clientX: state.paneResize.pendingClientX,
        clientY: state.paneResize.pendingClientY
      });
    });
  }

  function handleMouseUp() {
    if (!state.paneResize.active) return;

    if (state.paneResize.frameId) {
      cancelAnimationFrame(state.paneResize.frameId);
      state.paneResize.frameId = null;
    }

    update({
      clientX: state.paneResize.pendingClientX,
      clientY: state.paneResize.pendingClientY
    });

    state.paneResize.active = false;
    state.paneResize.axis = getAxis();
    state.paneResize.regionStart = 0;
    state.paneResize.regionSize = 0;
    state.paneResize.pendingClientX = 0;
    state.paneResize.pendingClientY = 0;
    state.paneResize.frameId = null;
    refs.mainContainer.classList.remove('is-resizing');
    refs.resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function syncAxis() {
    if (state.paneResize.active) return;
    state.paneResize.axis = getAxis();
  }

  return { handleMousedown, handleMouseMove, handleMouseUp, syncAxis };
}
