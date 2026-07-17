import { RECENT_STORE, withStore } from './db.js';

// 最近文件列表上限。超出后淘汰最旧的（按 lastOpened）。
export const RECENT_LIMIT = 12;

// ==========================================
// 纯函数（可单测，不触碰 IndexedDB / DOM）
// ==========================================

// 把一条记录合并进列表：同名覆盖并刷新时间戳，按 lastOpened 倒序，超限截断。
export function upsertEntry(list, entry, limit = RECENT_LIMIT) {
  const others = list.filter((item) => item.name !== entry.name);
  return [entry, ...others]
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .slice(0, limit);
}

// 按 lastOpened 倒序排列（最近打开的在前）。
export function sortByRecent(list) {
  return [...list].sort((a, b) => b.lastOpened - a.lastOpened);
}

// 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期。
export function formatRelativeTime(then, now = Date.now()) {
  const diff = now - then;
  if (diff < 0) return '刚刚';

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;

  const d = new Date(then);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ==========================================
// CRUD（IndexedDB recent-files store，key = 文件名）
// ==========================================

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 读取全部记录，按 lastOpened 倒序返回。
export async function getRecentFiles() {
  try {
    const list = await withStore(RECENT_STORE, 'readonly', (store) =>
      requestToPromise(store.getAll())
    );
    return sortByRecent(list || []);
  } catch (err) {
    console.warn('Failed to read recent files:', err);
    return [];
  }
}

// 记录一次文件打开：写入/更新该文件，并按上限淘汰最旧的。
export async function recordRecentFile({ name, handle = null, content = '' }) {
  if (!name) return;
  const entry = { name, handle, content, lastOpened: Date.now() };
  try {
    await withStore(RECENT_STORE, 'readwrite', async (store) => {
      store.put(entry, name);
      // 读取全部后在同一事务里淘汰超出上限的旧记录。
      const all = await requestToPromise(store.getAll());
      const sorted = sortByRecent(all || []);
      sorted.slice(RECENT_LIMIT).forEach((item) => store.delete(item.name));
    });
  } catch (err) {
    console.warn('Failed to record recent file:', err);
  }
}

// 刷新某条记录的打开时间（点击最近文件重新打开时调用）。
export async function touchRecentFile(name) {
  if (!name) return;
  try {
    await withStore(RECENT_STORE, 'readwrite', async (store) => {
      const entry = await requestToPromise(store.get(name));
      if (entry) {
        entry.lastOpened = Date.now();
        store.put(entry, name);
      }
    });
  } catch (err) {
    console.warn('Failed to touch recent file:', err);
  }
}

export async function deleteRecentFile(name) {
  try {
    await withStore(RECENT_STORE, 'readwrite', (store) => store.delete(name));
  } catch (err) {
    console.warn('Failed to delete recent file:', err);
  }
}

export async function clearRecentFiles() {
  try {
    await withStore(RECENT_STORE, 'readwrite', (store) => store.clear());
  } catch (err) {
    console.warn('Failed to clear recent files:', err);
  }
}

// ==========================================
// 控制器（渲染列表 + 交互）
// ==========================================

export function createRecentFilesController({ refs, fileController, showToast }) {
  function openModal() {
    renderList();
    refs.recentModal.classList.add('show');
  }

  function closeModal() {
    refs.recentModal.classList.remove('show');
  }

  async function renderList() {
    const list = await getRecentFiles();
    refs.recentList.innerHTML = '';

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = '还没有打开过任何文件';
      refs.recentList.appendChild(empty);
      refs.recentClear.disabled = true;
      return;
    }

    refs.recentClear.disabled = false;

    // 当前打开的文件名，用于高亮列表中对应的那一条。
    const currentName = localStorage.getItem('md-parser-last-file-name');

    list.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      if (entry.name === currentName) {
        item.classList.add('active');
      }
      item.dataset.name = entry.name;

      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'recent-item-open';
      info.innerHTML = `
        <svg class="recent-item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5z"/></svg>
        <span class="recent-item-name"></span>
        <span class="recent-item-time"></span>
      `;
      info.querySelector('.recent-item-name').textContent = entry.name;
      info.querySelector('.recent-item-time').textContent = formatRelativeTime(entry.lastOpened);
      info.addEventListener('click', () => handleOpen(entry));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'recent-item-delete';
      del.title = '从列表移除';
      del.setAttribute('aria-label', `从列表移除 ${entry.name}`);
      del.innerHTML = '&times;';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDelete(entry.name);
      });

      item.appendChild(info);
      item.appendChild(del);
      refs.recentList.appendChild(item);
    });
  }

  async function handleOpen(entry) {
    closeModal();
    await fileController.openRecentEntry(entry);
  }

  async function handleDelete(name) {
    await deleteRecentFile(name);
    renderList();
  }

  async function handleClear() {
    await clearRecentFiles();
    renderList();
    showToast('已清空最近文件');
  }

  return {
    openModal,
    closeModal,
    renderList,
    handleClear
  };
}
