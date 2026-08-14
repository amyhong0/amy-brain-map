import { normalizeEncryptionKey } from './unconscious-storage';

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
