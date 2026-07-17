import { describe, it, expect } from 'vitest';
import {
  upsertEntry,
  sortByRecent,
  formatRelativeTime,
  RECENT_LIMIT
} from '../modules/recent-files.js';

function entry(name, lastOpened, extra = {}) {
  return { name, lastOpened, content: '', handle: null, ...extra };
}

describe('upsertEntry', () => {
  it('adds a new entry to an empty list', () => {
    const result = upsertEntry([], entry('a.md', 100));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('a.md');
  });

  it('places the newest entry first', () => {
    const list = [entry('a.md', 100), entry('b.md', 200)];
    const result = upsertEntry(list, entry('c.md', 300));
    expect(result.map((e) => e.name)).toEqual(['c.md', 'b.md', 'a.md']);
  });

  it('replaces a same-name entry instead of duplicating', () => {
    const list = [entry('a.md', 100, { content: 'old' })];
    const result = upsertEntry(list, entry('a.md', 300, { content: 'new' }));
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('new');
    expect(result[0].lastOpened).toBe(300);
  });

  it('deduplicates by name regardless of position', () => {
    const list = [entry('a.md', 100), entry('b.md', 200), entry('c.md', 150)];
    const result = upsertEntry(list, entry('b.md', 400));
    expect(result.filter((e) => e.name === 'b.md')).toHaveLength(1);
    expect(result[0].name).toBe('b.md');
  });

  it('truncates to the limit, dropping the oldest', () => {
    const list = Array.from({ length: RECENT_LIMIT }, (_, i) =>
      entry(`f${i}.md`, i + 1)
    );
    const result = upsertEntry(list, entry('new.md', 10_000));
    expect(result).toHaveLength(RECENT_LIMIT);
    expect(result[0].name).toBe('new.md');
    // 最旧的 f0.md（lastOpened=1）应被淘汰
    expect(result.some((e) => e.name === 'f0.md')).toBe(false);
  });

  it('respects a custom limit', () => {
    const list = [entry('a.md', 100), entry('b.md', 200)];
    const result = upsertEntry(list, entry('c.md', 300), 2);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.name)).toEqual(['c.md', 'b.md']);
  });

  it('does not mutate the input list', () => {
    const list = [entry('a.md', 100)];
    upsertEntry(list, entry('b.md', 200));
    expect(list).toHaveLength(1);
  });
});

describe('sortByRecent', () => {
  it('sorts by lastOpened descending', () => {
    const list = [entry('a.md', 100), entry('b.md', 300), entry('c.md', 200)];
    const result = sortByRecent(list);
    expect(result.map((e) => e.name)).toEqual(['b.md', 'c.md', 'a.md']);
  });

  it('does not mutate the input list', () => {
    const list = [entry('a.md', 100), entry('b.md', 300)];
    sortByRecent(list);
    expect(list.map((e) => e.name)).toEqual(['a.md', 'b.md']);
  });

  it('handles an empty list', () => {
    expect(sortByRecent([])).toEqual([]);
  });
});

describe('formatRelativeTime', () => {
  const now = 1_000_000_000_000;

  it('returns 刚刚 for sub-minute differences', () => {
    expect(formatRelativeTime(now - 30 * 1000, now)).toBe('刚刚');
  });

  it('returns 刚刚 for future timestamps', () => {
    expect(formatRelativeTime(now + 5000, now)).toBe('刚刚');
  });

  it('formats minutes', () => {
    expect(formatRelativeTime(now - 5 * 60 * 1000, now)).toBe('5 分钟前');
  });

  it('formats hours', () => {
    expect(formatRelativeTime(now - 3 * 60 * 60 * 1000, now)).toBe('3 小时前');
  });

  it('formats days', () => {
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000, now)).toBe('2 天前');
  });

  it('falls back to a date string beyond a week', () => {
    const then = now - 10 * 24 * 60 * 60 * 1000;
    const d = new Date(then);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(formatRelativeTime(then, now)).toBe(expected);
  });
});
