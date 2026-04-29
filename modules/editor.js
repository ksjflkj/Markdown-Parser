const DEFAULT_CONTENT = `# 🎉 欢迎使用 Markdown 解析器

这是一个现代化的 **Markdown 在线解析器**，支持实时预览和多种功能。

## ✨ 功能特性

- 📝 实时预览 Markdown 渲染效果
- 🎨 支持暗色/亮色主题切换
- 📋 一键复制 HTML 代码
- 📦 导出为 HTML 或 Markdown 文件
- 📂 拖放文件导入
- ⌨️ 快捷键支持
- 💾 自动保存编辑内容

## 📖 Markdown 语法示例

### 文本格式化

这是一段**粗体文本**，这是*斜体文本*，这是~~删除线文本~~。

### 引用

> "代码是写给人看的，顺便能在机器上运行。"
> — Harold Abelson

### 代码高亮

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
\`\`\`

\`\`\`python
def hello_world():
    """一个简单的示例函数"""
    print("Hello, Markdown! 🌍")

hello_world()
\`\`\`

### 表格

| 功能 | 快捷键 | 说明 |
|------|--------|------|
| 保存 | \`Ctrl+S\` | 保存到本地存储 |
| 复制 HTML | \`Ctrl+Shift+C\` | 复制渲染后的 HTML |
| 分屏视图 | \`Ctrl+1\` | 切换到分屏模式 |
| 编辑模式 | \`Ctrl+2\` | 切换到纯编辑模式 |
| 预览模式 | \`Ctrl+3\` | 切换到纯预览模式 |

### 任务列表

- [x] 支持 GFM (GitHub Flavored Markdown)
- [x] 代码语法高亮
- [x] 主题切换
- [x] 文件导出
- [ ] 更多功能开发中...

### 数学公式 (内联代码)

勾股定理：\`a² + b² = c²\`

欧拉公式：\`e^(iπ) + 1 = 0\`

---

> 💡 **提示**: 你可以拖放 \`.md\` 文件到页面中来快速加载内容！
`;

export function createEditorController({ refs, state, renderPreview }) {
  function updateStats() {
    const text = refs.editor.value;
    refs.charCount.textContent = `${text.length} 字符`;
    refs.lineCount.textContent = `${text.split('\n').length} 行`;
  }

  function persistEditorContent() {
    localStorage.setItem('md-parser-content', refs.editor.value);
  }

  function sanitizeHistory() {
    state.history.stack = state.history.stack.filter(snapshot => typeof snapshot === 'string');
    state.history.forwardStack = state.history.forwardStack.filter(snapshot => typeof snapshot === 'string');
    if (typeof state.history.lastValue !== 'string') {
      state.history.lastValue = refs.editor.value;
    }
  }

  function resetHistory(value = refs.editor.value) {
    state.history.stack = [];
    state.history.forwardStack = [];
    state.history.isUndoAction = false;
    state.history.lastValue = value;
  }

  function pushHistory(snapshot = state.history.lastValue) {
    sanitizeHistory();

    // 防止撤销操作触发历史记录
    if (state.history.isUndoAction) return;
    if (typeof snapshot !== 'string') return;
    if (snapshot === refs.editor.value) return;

    const lastSnapshot = state.history.stack[state.history.stack.length - 1];
    if (lastSnapshot === snapshot) return;

    state.history.stack.push(snapshot);
    state.history.forwardStack = []; // 清空重做栈

    // 限制栈大小
    if (state.history.stack.length > state.history.maxSize) {
      state.history.stack.shift();
    }
  }

  function undo() {
    sanitizeHistory();
    if (state.history.stack.length === 0) return;

    state.history.isUndoAction = true;
    state.history.forwardStack.push(refs.editor.value);

    let prev;
    while (state.history.stack.length > 0) {
      const snapshot = state.history.stack.pop();
      if (typeof snapshot === 'string') {
        prev = snapshot;
        break;
      }
    }

    if (typeof prev !== 'string') {
      state.history.isUndoAction = false;
      return;
    }

    refs.editor.value = prev;
    state.history.lastValue = refs.editor.value;
    updateStats();
    persistEditorContent();
    renderPreview();

    setTimeout(() => {
      state.history.isUndoAction = false;
    }, 0);
  }

  function redo() {
    sanitizeHistory();
    if (state.history.forwardStack.length === 0) return;

    state.history.isUndoAction = true;
    state.history.stack.push(refs.editor.value);

    let next;
    while (state.history.forwardStack.length > 0) {
      const snapshot = state.history.forwardStack.pop();
      if (typeof snapshot === 'string') {
        next = snapshot;
        break;
      }
    }

    if (typeof next !== 'string') {
      state.history.isUndoAction = false;
      return;
    }

    refs.editor.value = next;
    state.history.lastValue = refs.editor.value;
    updateStats();
    persistEditorContent();
    renderPreview();

    setTimeout(() => {
      state.history.isUndoAction = false;
    }, 0);
  }

  function canUndo() {
    return state.history.stack.length > 0;
  }

  function canRedo() {
    return state.history.forwardStack.length > 0;
  }

  function queueRender() {
    persistEditorContent();
    updateStats();
    state.history.lastValue = refs.editor.value;
    clearTimeout(state.renderTimeout);
    state.renderTimeout = setTimeout(renderPreview, 80);
  }

  function handleInput() {
    pushHistory(state.history.lastValue);
    queueRender();
  }

  function scheduleRender(previousValue = state.history.lastValue) {
    pushHistory(previousValue);
    queueRender();
  }

  function setContent(content, { resetUndo = false } = {}) {
    refs.editor.value = content;
    if (resetUndo) {
      resetHistory(content);
    }
    queueRender();
  }

  function restoreInitialContent() {
    const savedContent = localStorage.getItem('md-parser-content');
    if (savedContent) {
      refs.editor.value = savedContent;
      resetHistory(savedContent);
      return;
    }

    refs.editor.value = DEFAULT_CONTENT;
    resetHistory(DEFAULT_CONTENT);
  }

  function wrapSelection(before, after, placeholder = '') {
    const start = refs.editor.selectionStart;
    const end = refs.editor.selectionEnd;
    const text = refs.editor.value;
    const selected = text.substring(start, end) || placeholder;

    refs.editor.value = text.substring(0, start) + before + selected + after + text.substring(end);
    const newStart = start + before.length;
    const newEnd = newStart + selected.length;
    refs.editor.setSelectionRange(newStart, newEnd);
    refs.editor.focus();
    scheduleRender();
  }

  function toggleWrappedSelection(before, after, placeholder = '') {
    const start = refs.editor.selectionStart;
    const end = refs.editor.selectionEnd;
    const text = refs.editor.value;
    const selected = text.substring(start, end);

    if (
      selected
      && selected.startsWith(before)
      && selected.endsWith(after)
      && selected.length >= before.length + after.length
    ) {
      const inner = selected.slice(before.length, selected.length - after.length);
      refs.editor.value = text.substring(0, start) + inner + text.substring(end);
      refs.editor.setSelectionRange(start, start + inner.length);
      refs.editor.focus();
      scheduleRender();
      return;
    }

    if (
      selected
      && text.substring(start - before.length, start) === before
      && text.substring(end, end + after.length) === after
    ) {
      refs.editor.value = text.substring(0, start - before.length) + selected + text.substring(end + after.length);
      refs.editor.setSelectionRange(start - before.length, start - before.length + selected.length);
      refs.editor.focus();
      scheduleRender();
      return;
    }

    wrapSelection(before, after, placeholder);
  }

  function toggleLink() {
    const start = refs.editor.selectionStart;
    const end = refs.editor.selectionEnd;
    const text = refs.editor.value;
    const selected = text.substring(start, end);
    const selectedLink = selected.match(/^\[([^\]]*)\]\(([^)]*)\)$/);

    if (selectedLink) {
      const label = selectedLink[1];
      refs.editor.value = text.substring(0, start) + label + text.substring(end);
      refs.editor.setSelectionRange(start, start + label.length);
      refs.editor.focus();
      scheduleRender();
      return;
    }

    const linkTail = text.substring(end).match(/^\]\(([^)]*)\)/);
    if (selected && text[start - 1] === '[' && linkTail) {
      refs.editor.value = text.substring(0, start - 1) + selected + text.substring(end + linkTail[0].length);
      refs.editor.setSelectionRange(start - 1, start - 1 + selected.length);
      refs.editor.focus();
      scheduleRender();
      return;
    }

    wrapSelection('[', '](url)', '链接文字');
  }

  function insertAtLineStart(prefix) {
    const start = refs.editor.selectionStart;
    const end = refs.editor.selectionEnd;
    const text = refs.editor.value;

    // 找到当前行开始位置
    let lineStart = start;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
      lineStart--;
    }

    // 找到当前行结束位置
    let lineEnd = end;
    while (lineEnd < text.length && text[lineEnd] !== '\n') {
      lineEnd++;
    }

    const currentLine = text.substring(lineStart, lineEnd);

    // 检查是否已经有该前缀
    if (currentLine.startsWith(prefix)) {
      // 移除前缀
      refs.editor.value = text.substring(0, lineStart) + currentLine.substring(prefix.length) + text.substring(lineEnd);
      refs.editor.setSelectionRange(lineStart, lineEnd - prefix.length);
    } else {
      // 添加前缀
      refs.editor.value = text.substring(0, lineStart) + prefix + currentLine + text.substring(lineEnd);
      refs.editor.setSelectionRange(lineStart + prefix.length, lineEnd + prefix.length);
    }

    refs.editor.focus();
    scheduleRender();
  }

  function insertOrderedList() {
    formatSelectedLines({
      isFormatted: line => /^\s*\d+\.\s+/.test(line),
      removeFormat: line => line.replace(/^(\s*)\d+\.\s+/, '$1'),
      addFormat: (line, index) => line.replace(/^(\s*)(?:\d+\.\s+)?/, `$1${index + 1}. `)
    });
  }

  function insertUnorderedList() {
    formatSelectedLines({
      isFormatted: line => /^\s*[-*+]\s+/.test(line),
      removeFormat: line => line.replace(/^(\s*)[-*+]\s+/, '$1'),
      addFormat: line => line.replace(/^(\s*)(?:[-*+]\s+)?/, '$1- ')
    });
  }

  function formatTaskList(mode = 'unchecked') {
    const taskPattern = /^\s*[-*+]\s+\[[ xX]\]\s+/;

    formatSelectedLines({
      transformLines(lines) {
        return lines.map(line => {
          if (!line.trim()) return line;

          if (mode === 'remove') {
            return line.replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, '$1');
          }

          if (taskPattern.test(line)) {
            const marker = mode === 'checked' ? '[x]' : '[ ]';
            return line.replace(/^(\s*[-*+]\s+)\[[ xX]\](\s+)/, `$1${marker}$2`);
          }

          const marker = mode === 'checked' ? '[x]' : '[ ]';
          return line.replace(/^(\s*)/, `$1- ${marker} `);
        });
      }
    });
  }

  function formatSelectedLines({ isFormatted, removeFormat, addFormat, transformLines }) {
    const start = refs.editor.selectionStart;
    const end = refs.editor.selectionEnd;
    const text = refs.editor.value;
    const effectiveEnd = end > start && text[end - 1] === '\n' ? end - 1 : end;

    let lineStart = start;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
      lineStart--;
    }

    let lineEnd = effectiveEnd;
    while (lineEnd < text.length && text[lineEnd] !== '\n') {
      lineEnd++;
    }

    const selectedText = text.substring(lineStart, lineEnd);
    const lines = selectedText.split('\n');

    if (transformLines) {
      const updatedLines = transformLines(lines);
      const updatedText = updatedLines.join('\n');
      refs.editor.value = text.substring(0, lineStart) + updatedText + text.substring(lineEnd);
      refs.editor.setSelectionRange(lineStart, lineStart + updatedText.length);
      refs.editor.focus();
      scheduleRender();
      return;
    }

    const contentLines = lines.filter(line => line.trim());
    const allFormatted = contentLines.length > 0 && contentLines.every(isFormatted);

    let contentIndex = 0;
    const updatedLines = lines.map(line => {
      if (!line.trim()) return line;

      if (allFormatted) {
        return removeFormat(line);
      }

      const updatedLine = addFormat(line, contentIndex);
      contentIndex += 1;
      return updatedLine;
    });

    const updatedText = updatedLines.join('\n');
    refs.editor.value = text.substring(0, lineStart) + updatedText + text.substring(lineEnd);
    refs.editor.setSelectionRange(lineStart, lineStart + updatedText.length);
    refs.editor.focus();
    scheduleRender();
  }

  function insertCodeBlock() {
    const start = refs.editor.selectionStart;
    const end = refs.editor.selectionEnd;
    const text = refs.editor.value;
    const selected = text.substring(start, end);

    const codeBlock = '\n```\n' + (selected || '代码') + '\n```\n';
    refs.editor.value = text.substring(0, start) + codeBlock + text.substring(end);
    refs.editor.setSelectionRange(start + 4, start + 4 + (selected || '代码').length);
    refs.editor.focus();
    scheduleRender();
  }

  function insertHorizontalRule() {
    const start = refs.editor.selectionStart;
    const end = refs.editor.selectionEnd;
    const text = refs.editor.value;

    refs.editor.value = text.substring(0, start) + '\n---\n' + text.substring(end);
    refs.editor.setSelectionRange(start + 5, start + 5);
    refs.editor.focus();
    scheduleRender();
  }

  function formatText(format) {
    switch (format) {
      case 'bold':
        toggleWrappedSelection('**', '**', '粗体文字');
        break;
      case 'italic':
        toggleWrappedSelection('*', '*', '斜体文字');
        break;
      case 'code':
        toggleWrappedSelection('`', '`', '代码');
        break;
      case 'link':
        toggleLink();
        break;
      case 'quote':
        insertAtLineStart('> ');
        break;
      case 'ul':
        insertUnorderedList();
        break;
      case 'ol':
        insertOrderedList();
        break;
      case 'task':
        formatTaskList('unchecked');
        break;
      case 'codeblock':
        insertCodeBlock();
        break;
      case 'hr':
        insertHorizontalRule();
        break;
    }
  }

  function formatHeading(level) {
    const prefix = '#'.repeat(level) + ' ';
    insertAtLineStart(prefix);
  }

  return {
    updateStats,
    persistEditorContent,
    handleInput,
    scheduleRender,
    setContent,
    restoreInitialContent,
    formatText,
    formatHeading,
    formatTaskList,
    undo,
    redo,
    canUndo,
    canRedo
  };
}
