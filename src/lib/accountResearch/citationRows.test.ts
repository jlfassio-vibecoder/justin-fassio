import { describe, expect, it } from 'vitest';
import { mapOutcomeCitations } from '@/lib/accountResearch/citationRows';

describe('mapOutcomeCitations', () => {
  it('marks the locked profile as staff and posts as confirmed_profile', () => {
    const rows = mapOutcomeCitations({
      citations: [
        {
          url: 'https://facebook.com/SpallGolf',
          title: 'Staff-locked source URL',
          platform: 'facebook',
          excerpt: null,
          publishedAt: null,
          confidence: 'high',
        },
        {
          url: 'https://facebook.com/SpallGolf/posts/99',
          title: 'Post',
          platform: 'facebook',
          excerpt: null,
          publishedAt: null,
          confidence: 'medium',
        },
      ],
      isSocial: true,
      lockedUrl: 'https://www.facebook.com/SpallGolf',
      identityConfidence: 'high',
      attributedHandle: 'spallgolf',
    });
    expect(rows[0]?.acceptance_basis).toBe('staff');
    expect(rows[1]?.acceptance_basis).toBe('confirmed_profile');
    expect(rows.every((r) => r.acceptance_status === 'accepted')).toBe(true);
  });
});
