import { describe, expect, it } from 'vitest';
import { extractThreadParticipants } from '@/lib/google/crmEmailMatch';
import type { GmailThreadDetail } from '@/lib/google/gmailTypes';

const thread: GmailThreadDetail = {
  id: 't1',
  subject: 'Hello',
  snippet: 'Hi',
  unread: false,
  messages: [
    {
      id: 'm1',
      from: 'Alice <alice@example.com>',
      to: 'Me <office@justinfassio.com>, Bob <bob@example.com>',
      cc: 'Carol <carol@example.com>',
      date: '2026-08-09T00:00:00.000Z',
      subject: 'Hello',
      bodyText: 'Hi',
      bodyHtml: null,
      attachments: [],
    },
  ],
};

describe('extractThreadParticipants', () => {
  it('extracts unique participants and drops self mailbox', () => {
    const participants = extractThreadParticipants(thread, 'office@justinfassio.com');
    expect(participants.map((p) => p.email).sort()).toEqual([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
    ]);
    expect(participants.find((p) => p.email === 'alice@example.com')?.role).toBe('from');
    expect(participants.find((p) => p.email === 'carol@example.com')?.role).toBe('cc');
  });
});
