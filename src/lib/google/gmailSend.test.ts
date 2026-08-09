import { beforeEach, describe, expect, it, vi } from 'vitest';
import { replyToGmailThread, sendGmailMessage } from '@/lib/google/gmailSend';

describe('gmailSend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts messages.send with raw and optional threadId', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'm1', threadId: 't1', labelIds: ['SENT'] }),
    });

    const result = await sendGmailMessage({
      accessToken: 'token',
      to: ['a@example.com'],
      subject: 'Hi',
      bodyText: 'Body',
      threadId: 't1',
      inReplyTo: '<mid@mail>',
      references: '<mid@mail>',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ id: 'm1', threadId: 't1', labelIds: ['SENT'] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/messages/send');
    const body = JSON.parse(String(init.body)) as { raw: string; threadId?: string };
    expect(body.threadId).toBe('t1');
    expect(body.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = Buffer.from(
      body.raw.replace(/-/g, '+').replace(/_/g, '/') + '==',
      'base64',
    ).toString('utf8');
    expect(decoded).toContain('In-Reply-To: <mid@mail>');
  });

  it('reply loads metadata and sends with threadId + In-Reply-To', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/threads/') && (!init?.method || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [
              {
                id: 'msg-1',
                threadId: 'thr-1',
                payload: {
                  headers: [
                    { name: 'From', value: 'Alice <alice@example.com>' },
                    { name: 'To', value: 'Me <me@example.com>' },
                    { name: 'Subject', value: 'Hello' },
                    { name: 'Message-ID', value: '<orig@mail>' },
                    { name: 'References', value: '<root@mail>' },
                  ],
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'sent-1', threadId: 'thr-1', labelIds: ['SENT'] }),
      };
    });

    const result = await replyToGmailThread({
      accessToken: 'token',
      threadId: 'thr-1',
      mode: 'reply',
      bodyText: 'Thanks',
      selfEmail: 'me@example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.threadId).toBe('thr-1');
    const sendCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes('/messages/send'));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse(String((sendCall?.[1] as RequestInit).body)) as {
      raw: string;
      threadId: string;
    };
    expect(body.threadId).toBe('thr-1');
    const decoded = Buffer.from(
      body.raw.replace(/-/g, '+').replace(/_/g, '/') + '====',
      'base64',
    ).toString('utf8');
    expect(decoded).toContain('In-Reply-To: <orig@mail>');
    expect(decoded).toContain('References: <root@mail> <orig@mail>');
    expect(decoded).toContain('Subject: Re: Hello');
    expect(decoded).toContain('To: alice@example.com');
  });
});
