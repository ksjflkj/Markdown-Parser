let markedRenderer = null;
let resetHeadingIds = null;

export function initLibraries() {
  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
  }

  marked.setOptions({
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {}
      }

      try {
        return hljs.highlightAuto(code).value;
      } catch (e) {}

      return code;
    },
    breaks: true,
    gfm: true
  });

  if (!markedRenderer) {
    markedRenderer = createMarkedRenderer();
    marked.use({ renderer: markedRenderer });
  }
}

export function getRenderedContent(markdown) {
  if (resetHeadingIds) {
    resetHeadingIds();
  }

  const rawHtml = marked.parse(markdown);
  const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['button']
  });

  return {
    markdown,
    rawHtml,
    sanitizedHtml,
    isEmpty: !markdown.trim()
  };
}

export function renderPreview({ refs, onAfterRender } = {}) {
  const markdown = refs.editor.value;

  if (!markdown.trim()) {
    refs.preview.innerHTML = buildEmptyPreviewHtml();
    if (onAfterRender) onAfterRender({ isEmpty: true });
    return;
  }

  try {
    const { sanitizedHtml } = getRenderedContent(markdown);
    refs.preview.innerHTML = sanitizedHtml;
    runMermaid();
    if (onAfterRender) onAfterRender({ isEmpty: false });
  } catch (e) {
    refs.preview.innerHTML = buildErrorHtml(e.message);
    if (onAfterRender) onAfterRender({ isEmpty: false, error: e });
  }
}

function runMermaid() {
  if (!window.mermaid) return;

  Promise.resolve().then(() => {
    try {
      mermaid.run({ querySelector: '.mermaid' });
    } catch (err) {
      console.error('Mermaid rendering failed', err);
    }
  });
}

function buildEmptyPreviewHtml() {
  return `
      <div class="preview-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="2" y="2" width="20" height="20" rx="4"/>
          <path d="M7 15V9L9.5 12L12 9V15"/>
          <path d="M15 15V9L17 12"/>
        </svg>
        <p>在左侧编辑器中输入 Markdown 内容，实时预览将在这里显示</p>
      </div>`;
}

function buildErrorHtml(message) {
  return `<p style="color:var(--error)">解析错误: ${escapeHtml(message)}</p>`;
}

function createMarkedRenderer() {
  const renderer = new marked.Renderer();
  const headingSlugCounts = new Map();

  function slugifyHeading(text) {
    const slug = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'heading';
  }

  function getUniqueHeadingId(text) {
    const slug = slugifyHeading(text);
    const count = (headingSlugCounts.get(slug) || 0) + 1;
    headingSlugCounts.set(slug, count);
    return count === 1 ? slug : `${slug}-${count}`;
  }

  resetHeadingIds = function() {
    headingSlugCounts.clear();
  };

  renderer.code = function(code, language) {
    let codeText;
    let lang;

    if (typeof code === 'object') {
      lang = code.lang || '';
      codeText = code.text || '';
    } else {
      codeText = code;
      lang = language || '';
    }

    if (lang === 'mermaid') {
      return `<div class="mermaid">${escapeHtml(codeText)}</div>`;
    }

    let highlighted;
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(codeText, { language: lang }).value;
      } catch (e) {
        highlighted = escapeHtml(codeText);
      }
    } else {
      try {
        highlighted = hljs.highlightAuto(codeText).value;
      } catch (e) {
        highlighted = escapeHtml(codeText);
      }
    }

    const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';

    return `<pre>
        ${langLabel}
        <div class="code-toolbar">
          <button class="code-copy-btn" type="button" data-action="copy-code">复制</button>
          <div class="code-ctrl-group">
            <span class="code-ctrl-label">字体</span>
            <div class="code-zoom-controls">
              <button class="code-zoom-btn" type="button" data-action="font-zoom" data-delta="-10" title="字体缩小">A−</button>
              <span class="code-font-level">100%</span>
              <button class="code-zoom-btn" type="button" data-action="font-zoom" data-delta="10" title="字体放大">A+</button>
              <button class="code-zoom-btn code-zoom-reset" type="button" data-action="font-zoom" data-delta="0" title="字体重置">↺</button>
            </div>
          </div>
          <div class="code-ctrl-group">
            <span class="code-ctrl-label">框体</span>
            <div class="code-zoom-controls">
              <button class="code-zoom-btn" type="button" data-action="block-resize-step" data-delta="-80" title="框体缩小">−</button>
              <span class="code-zoom-level">默认</span>
              <button class="code-zoom-btn" type="button" data-action="block-resize-step" data-delta="80" title="框体放大">+</button>
              <button class="code-zoom-btn code-zoom-reset" type="button" data-action="block-resize-step" data-delta="0" title="框体重置">↺</button>
            </div>
          </div>
        </div>
        <code class="hljs">${highlighted}</code>
        <div class="code-resize-handle code-resize-bottom" data-resize-mode="height"></div>
        <div class="code-resize-handle code-resize-right" data-resize-mode="width"></div>
        <div class="code-resize-handle code-resize-corner" data-resize-mode="both"></div>
      </pre>`;
  };

  renderer.table = function(header, body) {
    if (typeof header === 'object') {
      const rows = header.rows || [];
      const headerRow = header.header || [];

      let headerHtml = '<tr>';
      headerRow.forEach(cell => {
        const align = cell.align ? ` style="text-align:${cell.align}"` : '';
        headerHtml += `<th${align}>${cell.text}</th>`;
      });
      headerHtml += '</tr>';

      let bodyHtml = '';
      rows.forEach(row => {
        bodyHtml += '<tr>';
        row.forEach(cell => {
          const align = cell.align ? ` style="text-align:${cell.align}"` : '';
          bodyHtml += `<td${align}>${cell.text}</td>`;
        });
        bodyHtml += '</tr>';
      });

      return `<div style="overflow-x:auto"><table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`;
    }

    return `<div style="overflow-x:auto"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
  };

  renderer.heading = function(tokenOrText, level, raw) {
    const isToken = tokenOrText && typeof tokenOrText === 'object';
    const text = isToken ? tokenOrText.text : tokenOrText;
    const depth = isToken ? tokenOrText.depth : level;
    const headingText = typeof text === 'object' ? text.text : text;
    const headingRaw = raw || (isToken ? tokenOrText.raw : '') || headingText || '';
    const id = getUniqueHeadingId(headingRaw);
    return `<h${depth} id="${id}" data-heading-level="${depth}">${headingText}</h${depth}>`;
  };

  return renderer;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
