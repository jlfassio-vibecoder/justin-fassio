import { supabase } from '@/lib/supabase';
import {
  fetchMessagesForThread,
  fetchMessageThreads,
  type MessageRow,
  type MessageThread,
} from '@/lib/messages';

export async function fetchBuyerMessageThreads(
  prospectId: number,
): Promise<{ data: MessageThread[]; error: string | null }> {
  return fetchMessageThreads({ prospectId, filter: 'all', limit: 100 });
}

export async function sendBuyerThreadReply(
  threadId: string,
  body: string,
): Promise<{ ok: true; message: MessageRow } | { ok: false; error: string }> {
  const text = body.trim();
  if (!text) return { ok: false, error: 'Message is required' };

  const { data, error } = await supabase
    .from('messages')
    .insert({
      thread_id: threadId,
      kind: 'buyer_reply',
      body: text,
      payload: {},
    })
    .select('id, thread_id, kind, wholesale_order_request_id, body, payload, created_at')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to send reply' };
  }

  return {
    ok: true,
    message: {
      id: data.id,
      threadId: data.thread_id,
      kind: data.kind,
      wholesaleOrderRequestId: data.wholesale_order_request_id,
      body: data.body,
      payload: (data.payload ?? {}) as MessageRow['payload'],
      createdAt: data.created_at,
    },
  };
}

export { fetchMessagesForThread };
