export function createPaneResizeController({ refs, state }) {
  function getAxis() {
    return window.innerWidth <= 768 ? 'y' : 'x';
  }

  function handleMousedown(e) {
    const axis = getAxis();
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
  }

  function update(e) {
    if (!state.paneResize.active) return;

    const axis = state.paneResize.axis || getAxis();
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
    state.paneResize.containerRect = null;
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
