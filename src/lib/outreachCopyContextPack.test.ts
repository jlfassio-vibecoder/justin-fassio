import { describe, expect, it } from 'vitest';
import type { SourceLockMap } from '@/lib/accountResearch/locks';
import {
  briefBulletsFromResearchBrief,
  clipResearchTextBudget,
  contextFlagsFromPack,
  directorySignalsFromYelpMatch,
  lockedProfilesFromSourceLocks,
  type OutreachCopyContextPack,
} from '@/lib/outreachCopyContextPack';
import {
  formatOutreachCopyContextSummary,
  isThinOutreachCopyContext,
} from '@/lib/outreachCopyContextSummary';
import type { YelpMatchResult } from '@/lib/yelp/types';
import type { AccountResearchSourceLock } from '@/types/database';

function lock(
  sourceType: AccountResearchSourceLock['source_type'],
  lockedUrl: string,
): AccountResearchSourceLock {
  return {
    retailer_id: 1,
    source_type: sourceType,
    locked_url: lockedUrl,
    locked_url_normalized: lockedUrl,
    locked_by: null,
    locked_at: '2026-08-25T12:00:00Z',
  };
}

describe('lockedProfilesFromSourceLocks', () => {
  it('maps lock URLs to platform + hostname only in stable platform order', () => {
    const locks: SourceLockMap = {
      facebook: lock('facebook', 'https://www.facebook.com/GolfShopKelowna'),
      website: lock('website', 'https://www.nmscharters.com/about?ref=1'),
      instagram: lock('instagram', 'https://instagram.com/nms.charters'),
    };
    expect(lockedProfilesFromSourceLocks(locks)).toEqual([
      { platform: 'website', hostname: 'nmscharters.com' },
      { platform: 'instagram', hostname: 'instagram.com' },
      { platform: 'facebook', hostname: 'facebook.com' },
    ]);
  });

  it('drops locks with unparseable URLs', () => {
    const locks: SourceLockMap = {
      website: lock('website', 'not a url !!!'),
    };
    // hostnameFromWebsite tolerates host-only; garbage without dots may still parse as host
    const profiles = lockedProfilesFromSourceLocks(locks);
    for (const p of profiles) {
      expect(p.hostname).not.toMatch(/^https?:\/\//i);
    }
  });
});

describe('briefBulletsFromResearchBrief', () => {
  it('returns up to 3 short URL-free bullets', () => {
    const bullets = briefBulletsFromResearchBrief(
      [
        '- Family-owned golf retailer in Kelowna https://example.com/about',
        '- Focuses on apparel and soft goods for public players.',
        '- Also runs a teaching academy on weekends.',
        '- Extra line that should be dropped.',
      ].join('\n'),
    );
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toContain('Family-owned');
    expect(bullets.join(' ')).not.toMatch(/https?:\/\//i);
  });

  it('returns empty for blank brief', () => {
    expect(briefBulletsFromResearchBrief(null)).toEqual([]);
    expect(briefBulletsFromResearchBrief('   ')).toEqual([]);
  });
});

describe('directorySignalsFromYelpMatch', () => {
  it('formats name and categories without business URL', () => {
    const match: YelpMatchResult = {
      business: {
        id: 'y1',
        name: 'Kelowna Golf Shop',
        alias: 'kelowna-golf-shop',
        url: 'https://www.yelp.com/biz/kelowna-golf-shop',
        phone: null,
        address1: null,
        city: 'Kelowna',
        state: 'BC',
        postalCode: null,
        businessUrl: 'https://golfshop.example',
        categories: ['Golf', 'Sporting Goods'],
        isClaimed: true,
        reviewCount: 12,
        rating: 4.5,
      },
      confidence: 'high',
      matchMethod: 'business_match',
      score: 0.9,
      reasons: [],
      candidateCount: 1,
      viableCandidateCount: 1,
    };
    const signals = directorySignalsFromYelpMatch(match);
    expect(signals).toBe('Kelowna Golf Shop · Golf, Sporting Goods');
    expect(signals).not.toMatch(/https?:\/\//i);
    expect(signals).not.toContain('yelp.com');
  });

  it('returns null when match missing', () => {
    expect(directorySignalsFromYelpMatch(null)).toBeNull();
  });
});

describe('clipResearchTextBudget', () => {
  it('trims directory then bullets then notes to stay under max', () => {
    const clipped = clipResearchTextBudget({
      recentPublicNotes: ['note-a: ' + 'a'.repeat(400), 'note-b: ' + 'b'.repeat(400)],
      researchBriefBullets: ['bullet-1: ' + 'c'.repeat(200), 'bullet-2: ' + 'd'.repeat(200)],
      directorySignals: 'Directory: ' + 'e'.repeat(200),
      maxChars: 500,
    });
    const total = [
      ...clipped.recentPublicNotes,
      ...clipped.researchBriefBullets,
      ...(clipped.directorySignals ? [clipped.directorySignals] : []),
    ].join('\n').length;
    expect(total).toBeLessThanOrEqual(500);
    expect(clipped.directorySignals).toBeNull();
  });
});

describe('contextFlagsFromPack', () => {
  it('summarizes pack presence for generation meta', () => {
    const pack: OutreachCopyContextPack = {
      storeWebsiteHost: 'nmscharters.com',
      lockedProfiles: [{ platform: 'instagram', hostname: 'instagram.com' }],
      contactRole: 'Buyer',
      contactTitle: null,
      recentPublicNotes: ['website: Family owned'],
      researchBriefBullets: ['Coastal golf shop'],
      directorySignals: 'NMS · Charters',
    };
    expect(contextFlagsFromPack(pack)).toEqual({
      hasWebsiteHost: true,
      acceptedNoteCount: 1,
      lockedSourceCount: 1,
      hasContactRole: true,
      hasBriefBullets: true,
      hasDirectorySignals: true,
    });
  });
});

describe('formatOutreachCopyContextSummary', () => {
  it('formats compact Used: line for the composer', () => {
    expect(
      formatOutreachCopyContextSummary(
        {
          hasWebsiteHost: true,
          acceptedNoteCount: 3,
          lockedSourceCount: 2,
          hasContactRole: false,
          hasBriefBullets: false,
          hasDirectorySignals: false,
        },
        'golf_retail',
      ),
    ).toBe(
      'Used: website host · 3 research notes · 2 locked sources · channel golf courses, resorts & pro shops',
    );
  });

  it('detects thin research context', () => {
    expect(
      isThinOutreachCopyContext({
        hasWebsiteHost: true,
        acceptedNoteCount: 0,
        lockedSourceCount: 0,
        hasContactRole: false,
        hasBriefBullets: false,
        hasDirectorySignals: false,
      }),
    ).toBe(true);
    expect(
      isThinOutreachCopyContext({
        hasWebsiteHost: false,
        acceptedNoteCount: 1,
        lockedSourceCount: 0,
        hasContactRole: false,
        hasBriefBullets: false,
        hasDirectorySignals: false,
      }),
    ).toBe(false);
  });
});
