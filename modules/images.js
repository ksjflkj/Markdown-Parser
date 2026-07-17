// 处理粘贴/拖拽的图片文件：读取为 base64 data URL 并以 Markdown 图片语法插入编辑器。
// 纯前端项目无法访问本地磁盘路径，内嵌 base64 让本地图片在预览和导出的 HTML 中都能显示。

// 单张图片超过该大小时给出提示：base64 会让内容膨胀约 33%，过大的图会拖慢渲染并撑爆存储配额。
const LARGE_IMAGE_BYTES = 2 * 1024 * 1024;

function isImageFile(file) {
  return file && file.type.startsWith('image/');
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

// 用文件名（去扩展名）作为 alt 文本；粘贴的截图通常没有有意义的文件名，回退到 "image"。
function altTextFor(file) {
  const name = (file.name || '').replace(/\.[^.]+$/, '').trim();
  return name || 'image';
}

export function createImageController({ editorController, showToast }) {
  async function insertImageFiles(files) {
    const images = Array.from(files).filter(isImageFile);
    if (images.length === 0) return false;

    for (const file of images) {
      if (file.size > LARGE_IMAGE_BYTES) {
        showToast(`图片较大（${(file.size / 1024 / 1024).toFixed(1)}MB），内嵌后可能影响性能`);
      }

      try {
        const dataUrl = await readAsDataUrl(file);
        const snippet = `![${altTextFor(file)}](${dataUrl})\n`;
        editorController.insertText(snippet);
      } catch (err) {
        console.error('Image read failed:', err);
        showToast('图片插入失败');
      }
    }

    showToast(images.length > 1 ? `已插入 ${images.length} 张图片` : '已插入图片');
    return true;
  }

  // 粘贴事件：从剪贴板项中提取图片（截图、复制的图片文件）。
  async function handlePaste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    const files = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length === 0) return;

    // 阻止默认粘贴，避免浏览器把图片文件名等无关文本塞进编辑器。
    e.preventDefault();
    await insertImageFiles(files);
  }

  return { insertImageFiles, handlePaste };
}
