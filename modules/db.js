// 共享的 IndexedDB 连接。File System Access API 的句柄无法存入 localStorage，
// 但可结构化克隆到 IndexedDB，因此句柄持久化与"最近文件"列表都建在这里。
//
// 版本历史：
//   v1 — 仅 file-handles（当前打开文件的句柄，key 固定为 'current'）
//   v2 — 新增 recent-files（最近打开过的文件列表，key 为文件名）
export const DB_NAME = 'md-parser';
export const DB_VERSION = 2;
export const HANDLE_STORE = 'file-handles';
export const RECENT_STORE = 'recent-files';

let dbPromise = null;

export function openDb() {
  // 复用同一个连接 Promise，避免并发调用时反复触发 onupgradeneeded。
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
      if (!db.objectStoreNames.contains(RECENT_STORE)) {
        db.createObjectStore(RECENT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // 打开失败时清空缓存的 Promise，下次调用可重试。
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

// 在一个事务里执行 fn(store)，并在事务完成后 resolve。
// fn 的返回值会作为 resolve 值（用于 get 类操作把 request 结果传出来）。
export async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    Promise.resolve(fn(store))
      .then((value) => {
        result = value;
      })
      .catch(reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
