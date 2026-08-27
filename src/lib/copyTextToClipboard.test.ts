import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '@/lib/copyTextToClipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes trimmed text and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('  https://example.com/  ')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.com/');
  });

  it('returns false for blank input', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('   ')).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns false when clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyTextToClipboard('https://example.com')).resolves.toBe(false);
  });

  it('returns false when writeText throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('https://example.com')).resolves.toBe(false);
  });
});
