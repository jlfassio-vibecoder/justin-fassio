import { describe, expect, it, vi } from 'vitest';
import { stampResendEmailIdWithRetry } from '@/lib/systemMessages';

describe('stampResendEmailIdWithRetry', () => {
  it('returns the first successful stamp', async () => {
    const stamp = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'temp' })
      .mockResolvedValueOnce({ ok: true, id: 'sm-1' });

    const result = await stampResendEmailIdWithRetry(stamp);
    expect(result).toEqual({ ok: true, id: 'sm-1' });
    expect(stamp).toHaveBeenCalledTimes(2);
  });

  it('returns the last failure after retries', async () => {
    const stamp = vi.fn().mockResolvedValue({ ok: false, error: 'persist failed' });
    const result = await stampResendEmailIdWithRetry(stamp);
    expect(result).toEqual({ ok: false, error: 'persist failed' });
    expect(stamp).toHaveBeenCalledTimes(3);
  });
});
