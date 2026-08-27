import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, generateObjectMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  generateObjectMock: vi.fn(),
}));

vi.mock('ai', () => ({
  gateway: {
    tools: {
      perplexitySearch: vi.fn(() => ({})),
    },
  },
  generateText: (...args: unknown[]) => generateTextMock(...args),
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
  stepCountIs: (n: number) => n,
}));

import {
  formatRoleVerificationNotes,
  verifyPublicContactRole,
} from '@/lib/contactResearch/verifyPublicContactRole';

describe('verifyPublicContactRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes LinkedIn query patterns in search prompt', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Bob Leis — Owner at Newport Ace Hardware in Newport, OR. https://linkedin.com/in/bob-leis',
    });
    generateObjectMock.mockResolvedValue({
      object: {
        status: 'verified',
        signals: { personName: true, company: true, role: true, location: true },
        matchedRole: 'Owner',
        matchedCompany: 'Newport Ace Hardware',
        sourceUrls: ['https://linkedin.com/in/bob-leis'],
      },
    });

    const result = await verifyPublicContactRole({
      candidateName: 'Bob Leis',
      businessName: 'Newport Ace Hardware',
      city: 'Newport',
      state: 'OR',
      proposedTitle: 'Owner',
    });

    expect(result.status).toBe('verified');
    expect(result.matchedRole).toBe('Owner');
    expect(result.matchedCompany).toBe('Newport Ace Hardware');
    expect(result.sourceUrls).toEqual(['https://linkedin.com/in/bob-leis']);

    const prompt = String(generateTextMock.mock.calls[0]?.[0]?.prompt ?? '');
    expect(prompt).toContain('"Bob Leis" "Newport Ace Hardware" LinkedIn');
    expect(prompt).toContain('site:linkedin.com/in "Bob Leis" "Newport Ace Hardware"');
    expect(prompt).toContain('"Bob Leis" "Newport, OR" LinkedIn');
    expect(prompt).toContain('confirmation layer');
  });

  it('returns partial when name/location match but role is not exposed', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Aaron L. — Lincoln City, OR. LinkedIn snippet shows name and location only.',
    });
    generateObjectMock.mockResolvedValue({
      object: {
        status: 'partial',
        signals: { personName: true, company: false, role: false, location: true },
        matchedRole: null,
        matchedCompany: null,
        sourceUrls: [],
      },
    });

    const result = await verifyPublicContactRole({
      candidateName: 'Aaron L.',
      businessName: 'LC Sporting Goods',
      city: 'Lincoln City',
      state: 'OR',
    });

    expect(result.status).toBe('partial');
    expect(result.matchedRole).toBeNull();
  });

  it('drops model source URLs that are not present in the search excerpt', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Bob Leis — Owner at Newport Ace Hardware. https://linkedin.com/in/bob-leis',
    });
    generateObjectMock.mockResolvedValue({
      object: {
        status: 'verified',
        signals: { personName: true, company: true, role: true, location: true },
        matchedRole: 'Owner',
        matchedCompany: 'Newport Ace Hardware',
        sourceUrls: [
          'https://linkedin.com/in/bob-leis',
          'https://linkedin.com/in/hallucinated-profile',
        ],
      },
    });

    const result = await verifyPublicContactRole({
      candidateName: 'Bob Leis',
      businessName: 'Newport Ace Hardware',
      city: 'Newport',
      state: 'OR',
    });

    expect(result.sourceUrls).toEqual(['https://linkedin.com/in/bob-leis']);
  });

  it('returns not_found when search finds no corroboration', async () => {
    generateTextMock.mockResolvedValue({
      text: 'No usable public LinkedIn corroboration found for Tony Gile.',
    });

    const result = await verifyPublicContactRole({
      candidateName: 'Tony Gile',
      businessName: 'Example Store',
      city: 'Bandon',
      state: 'OR',
    });

    expect(result.status).toBe('not_found');
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('returns not_found when candidate or business name is empty', async () => {
    const result = await verifyPublicContactRole({
      candidateName: '  ',
      businessName: 'Example Store',
    });

    expect(result.status).toBe('not_found');
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});

describe('formatRoleVerificationNotes', () => {
  it('formats verified outcome with signals and sources', () => {
    const notes = formatRoleVerificationNotes({
      status: 'verified',
      signals: { personName: true, company: true, role: true, location: true },
      matchedRole: 'Owner',
      matchedCompany: 'The Sassy Seagull',
      excerpt: 'snippet',
      sourceUrls: ['https://linkedin.com/in/example'],
    });

    expect(notes).toContain('LinkedIn verification: Verified');
    expect(notes).toContain('Signals: person, company, role, location');
    expect(notes).toContain('Role evidence: Owner at The Sassy Seagull');
    expect(notes).toContain('Sources: https://linkedin.com/in/example');
  });

  it('formats partial outcome label', () => {
    const notes = formatRoleVerificationNotes({
      status: 'partial',
      signals: { personName: true, company: false, role: false, location: true },
      matchedRole: null,
      matchedCompany: null,
      excerpt: 'snippet',
      sourceUrls: [],
    });

    expect(notes).toBe('LinkedIn verification: Partial public match\nSignals: person, location');
  });
});
