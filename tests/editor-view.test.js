import { describe, expect, it } from 'vitest';
import { scanBase64Ranges, formatBytes } from '../modules/editor-view.js';

// scanBase64Ranges is the pure core of the fold plugin: given the document text
// it returns the payload spans to collapse. The decoration rendering itself
// needs real layout, so we test the range math here where it's deterministic.
describe('scanBase64Ranges', () => {
  const bigPayload = 'A'.repeat(200);

  it('locates the base64 payload span inside a markdown image', () => {
    const prefix = '![diagram](data:image/png;base64,';
    const text = `intro ${prefix}${bigPayload})`;
    const ranges = scanBase64Ranges(text);

    expect(ranges).toHaveLength(1);
    const { from, to } = ranges[0];
    // The span covers exactly the payload, not the surrounding syntax.
    expect(text.slice(from, to)).toBe(bigPayload);
  });

  it('ignores payloads below the fold threshold', () => {
    const text = '![x](data:image/png;base64,QUJD)'; // 3-char payload
    expect(scanBase64Ranges(text)).toHaveLength(0);
  });

  it('finds multiple images in one document', () => {
    const one = `![a](data:image/png;base64,${bigPayload})`;
    const two = `![b](data:image/jpeg;base64,${bigPayload})`;
    const ranges = scanBase64Ranges(`${one}\n\n${two}`);
    expect(ranges).toHaveLength(2);
  });

  it('does not match regular links or non-data images', () => {
    const text = '![alt](https://example.com/pic.png)\n[link](url)';
    expect(scanBase64Ranges(text)).toHaveLength(0);
  });

  it('returns the full data URL as src for the image preview', () => {
    const url = `data:image/png;base64,${bigPayload}`;
    const text = `![a](${url})`;
    const [range] = scanBase64Ranges(text);
    expect(range.src).toBe(url);
  });

  it('estimates decoded byte size from payload length', () => {
    const text = `![a](data:image/png;base64,${'A'.repeat(400)})`;
    const [range] = scanBase64Ranges(text);
    // 400 base64 chars ≈ 300 decoded bytes.
    expect(range.bytes).toBe(300);
  });
});

describe('formatBytes', () => {
  it('formats bytes, KB, and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
