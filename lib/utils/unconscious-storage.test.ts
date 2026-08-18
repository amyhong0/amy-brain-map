import { normalizeEncryptionKey, normalizeUrl } from './unconscious-storage';

describe('normalizeEncryptionKey', () => {
  it('accepts a long alphanumeric secret and derives a 32-byte AES key', () => {
    const source = 'AmyBrainMapStorageSecret2026WithLettersAndDigits7890';
    const derived = normalizeEncryptionKey(source);

    expect(derived).toHaveLength(32);
    expect(derived.equals(normalizeEncryptionKey(source))).toBe(true);
  });

  it('keeps a 64-character hexadecimal secret compatible with the original format', () => {
    const hexadecimal = 'a'.repeat(64);

    expect(normalizeEncryptionKey(hexadecimal).toString('hex')).toBe(hexadecimal);
  });

  it('rejects secrets shorter than 32 characters', () => {
    expect(() => normalizeEncryptionKey('too-short-for-storage-key')).toThrow('at least 32 characters');
  });
});

describe('normalizeUrl', () => {
  it('treats reordered query strings and tracking parameters as the same page', () => {
    const first = normalizeUrl('https://www.example.com/article/?b=2&utm_source=newsletter&a=1#section');
    const second = normalizeUrl('https://example.com/article?a=1&b=2&gclid=campaign');

    expect(first).toEqual({ domain: 'example.com', normalizedUrl: 'https://example.com/article?a=1&b=2' });
    expect(second).toEqual(first);
  });
});
