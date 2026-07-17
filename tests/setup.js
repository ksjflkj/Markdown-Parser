import { beforeEach } from 'vitest';

// jsdom ships a real, persistent sessionStorage that survives across tests, and
// the previous localStorage mock was never reset between suites. That let one
// test's persisted editor content leak into the next (e.g. restoreInitialContent
// reads sessionStorage first). Mock both with the same in-memory store and clear
// them before every test so each case starts from a clean slate.
function createStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    }
  };
}

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

function defineStorage(target, name, value) {
  if (!target) return;
  Object.defineProperty(target, name, { value, configurable: true });
}

defineStorage(globalThis, 'localStorage', localStorageMock);
defineStorage(globalThis, 'sessionStorage', sessionStorageMock);
defineStorage(globalThis.window, 'localStorage', localStorageMock);
defineStorage(globalThis.window, 'sessionStorage', sessionStorageMock);

// CodeMirror 6's layout layers (drawSelection / highlightActiveLine) measure the
// DOM via Range.getClientRects during an async measure cycle. jsdom leaves those
// as non-functions, so CM6 throws after a test has already finished — an
// unhandled error that fails the run even though every assertion passed. Provide
// empty-rect stubs so measuring is a no-op instead of a crash. Real layout is
// browser-only and out of scope for these unit tests.
const emptyRect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects = function () {
    return Object.assign([], { item: () => null });
  };
  Range.prototype.getBoundingClientRect = function () {
    return { ...emptyRect };
  };
}
if (typeof Element !== 'undefined' && !Element.prototype.getClientRects) {
  Element.prototype.getClientRects = function () {
    return Object.assign([], { item: () => null });
  };
}

beforeEach(() => {
  localStorageMock.clear();
  sessionStorageMock.clear();
});
