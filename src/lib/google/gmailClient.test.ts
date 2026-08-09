import { describe, expect, it, vi } from 'vitest';
import { getGmailThread, listGmailThreads } from '@/lib/google/gmailClient';

function b64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

describe('gmailClient', () => {
  it('lists threads with pagination token and maps summaries', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/threads?') || url.includes('/threads&')) {
        return new Response(
          JSON.stringify({
            threads: [{ id: 't1', snippet: 'Hello snippet' }],
            nextPageToken: 'page-2',
            resultSizeEstimate: 1,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/threads/t1')) {
        return new Response(
          JSON.stringify({
            id: 't1',
            snippet: 'Hello snippet',
            messages: [
              {
                id: 'm1',
                snippet: 'Hello snippet',
                labelIds: ['INBOX', 'UNREAD'],
                internalDate: '1700000000000',
                payload: {
                  headers: [
                    { name: 'From', value: 'a@example.com' },
                    { name: 'To', value: 'b@example.com' },
                    { name: 'Subject', value: 'Hello' },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: 'unexpected' } }), { status: 500 });
    });

    const result = await listGmailThreads({
      accessToken: 'token',
      label: 'INBOX',
      q: 'subject:hello',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.nextPageToken).toBe('page-2');
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]).toMatchObject({
      id: 't1',
      subject: 'Hello',
      from: 'a@example.com',
      unread: true,
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('q=subject%3Ahello');
  });

  it('gets thread detail with plain-text body', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 't1',
          snippet: 'Body preview',
          messages: [
            {
              id: 'm1',
              labelIds: ['INBOX'],
              internalDate: '1700000000000',
              payload: {
                mimeType: 'text/plain',
                headers: [
                  { name: 'From', value: 'a@example.com' },
                  { name: 'To', value: 'b@example.com' },
                  { name: 'Subject', value: 'Hello' },
                ],
                body: { data: b64url('Plain body') },
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const detail = await getGmailThread({
      accessToken: 'token',
      threadId: 't1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(detail.subject).toBe('Hello');
    expect(detail.messages[0]?.bodyText).toBe('Plain body');
  });
});
