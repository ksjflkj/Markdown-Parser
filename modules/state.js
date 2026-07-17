export function createState() {
  return {
    renderTimeout: null,
    toastTimeout: null,
    searchTimeout: null,
    searchProcessing: false,
    dragCounter: 0,
    internalDrag: false,
    currentFileHandle: null,
    isDark: true,
    searchMarks: [],
    searchCurrentIdx: -1,
    paneResize: {
      active: false,
      axis: 'x',
      // 拖动基准是「编辑器 + 预览」这块区域，不含目录面板和 resizer，
      // 这样目录出现时分割条不会跳动。
      regionStart: 0,
      regionSize: 0,
      pendingClientX: 0,
      pendingClientY: 0,
      frameId: null
    },
    codeResize: null,
    toc: {
      items: [],
      activeId: '',
      width: 240
    },
    tocResize: {
      active: false,
      containerRect: null,
      pendingClientX: 0
    },
    history: {
      stack: [],
      forwardStack: [],
      maxSize: 100,
      isUndoAction: false,
      lastValue: ''
    }
  };
}
