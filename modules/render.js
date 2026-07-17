import { marked } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

let mermaidModule = null;

async function loadMermaid() {
  if (!mermaidModule) {
    const m = await import('mermaid');
    mermaidModule = m.default;
    mermaidModule.initialize({ startOnLoad: false, theme: 'default' });
  }
  return mermaidModule;
}

let rendererState = null;

function getRendererState() {
  if (!rendererState) {
    rendererState = createMarkedRenderer();
    marked.use({ renderer: rendererState.renderer });
  }
  return rendererState;
}

export function initLibraries() {
  marked.setOptions({
    breaks: true,
    gfm: true
  });

  getRendererState();
}

export function getRenderedContent(markdown) {
  const { resetHeadingIds } = getRendererState();
  resetHeadingIds();

  const rawHtml = marked.parse(markdown);
  const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['data-action', 'data-delta', 'data-resize-mode', 'data-heading-level']
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
  const scrollContainer = refs.preview.parentElement || refs.preview;
  const prevScrollTop = scrollContainer.scrollTop;

  if (!markdown.trim()) {
    refs.preview.innerHTML = buildEmptyPreviewHtml();
    if (onAfterRender) onAfterRender({ isEmpty: true });
    return;
  }

  try {
    const { sanitizedHtml } = getRenderedContent(markdown);
    refs.preview.innerHTML = sanitizedHtml;
    scrollContainer.scrollTop = prevScrollTop;
    runMermaid(refs.preview);
    if (onAfterRender) onAfterRender({ isEmpty: false });
  } catch (e) {
    refs.preview.innerHTML = buildErrorHtml(e.message);
    if (onAfterRender) onAfterRender({ isEmpty: false, error: e });
  }
}

function runMermaid(root = document) {
  loadMermaid().then(async (mermaid) => {
    const nodes = root.querySelectorAll('.mermaid:not([data-mermaid-processed])');
    for (const node of nodes) {
      try {
        node.setAttribute('data-mermaid-processed', 'true');
        await mermaid.run({ nodes: [node] });
      } catch (err) {
        node.innerHTML = `<div class="mermaid-error"><span>Mermaid 语法错误</span><pre>${escapeHtml(err.message || String(err))}</pre></div>`;
      }
    }
  }).catch(() => {});
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
      .replace(/[^\w一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `heading-${slug || 'item'}`;
  }

  function getUniqueHeadingId(text) {
    const slug = slugifyHeading(text);
    const count = (headingSlugCounts.get(slug) || 0) + 1;
    headingSlugCounts.set(slug, count);
    return count === 1 ? slug : `${slug}-${count}`;
  }

  function resetHeadingIds() {
    headingSlugCounts.clear();
  }

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
        console.warn(`highlight.js failed for language "${lang}":`, e);
        highlighted = escapeHtml(codeText);
      }
    } else {
      try {
        highlighted = hljs.highlightAuto(codeText).value;
      } catch (e) {
        console.warn('highlight.js auto-detect failed:', e);
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

  // marked renders each cell itself (via tablecell/parseInline) and passes the
  // already-rendered header/body strings in. We only wrap the table so it can
  // scroll horizontally on overflow.
  renderer.table = function(header, body) {
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

  return { renderer, resetHeadingIds };
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
