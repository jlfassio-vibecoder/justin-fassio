import { generateText } from 'ai';
import { CONTACT_EMAIL } from '@/data/landing';
import { identityFingerprint } from '@/lib/messageFingerprint';
import { CHAT_SILENCE_MS, pickWittyLine } from '@/lib/chatWittyLines';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { Resend } from 'resend';

export type ChatState = 'awaiting_human' | 'ai_active' | 'human_active';

export type LiveChatThread = {
  id: string;
  chatState: ChatState;
  visitorName: string | null;
  visitorEmail: string | null;
  subject: string;
  lastMessageAt: string;
  awaitingReplySince: string | null;
  prospectId: number | null;
  mappingStatus: string;
};

type Admin = SupabaseClient<Database>;

function liveChatFingerprint(email: string, name: string, userId: string): string {
  return identityFingerprint({
    email: email || `visitor:${userId}`,
    businessName: 'live-chat',
    buyerName: name,
  });
}

export async function ensureLiveChatThread(
  admin: Admin,
  args: { userId: string; name: string; email: string },
): Promise<{ ok: true; thread: LiveChatThread } | { ok: false; error: string }> {
  const name = args.name.trim();
  const email = args.email.trim().toLowerCase();
  if (!name) return { ok: false, error: 'Name is required' };

  const { data: existing, error: findError } = await admin
    .from('message_threads')
    .select(
      'id, chat_state, visitor_name, visitor_email, subject, last_message_at, awaiting_reply_since, prospect_id, mapping_status',
    )
    .eq('channel', 'live_chat')
    .eq('visitor_user_id', args.userId)
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };

  if (existing) {
    const { error: updateError } = await admin
      .from('message_threads')
      .update({
        visitor_name: name,
        visitor_email: email || null,
        subject: `Live chat · ${name}`,
      })
      .eq('id', existing.id);
    if (updateError) return { ok: false, error: updateError.message };

    return {
      ok: true,
      thread: {
        id: existing.id,
        chatState: (existing.chat_state as ChatState) || 'awaiting_human',
        visitorName: name,
        visitorEmail: email || null,
        subject: `Live chat · ${name}`,
        lastMessageAt: existing.last_message_at,
        awaitingReplySince: existing.awaiting_reply_since,
        prospectId: existing.prospect_id,
        mappingStatus: existing.mapping_status,
      },
    };
  }

  const fingerprint = liveChatFingerprint(email, name, args.userId);
  const now = new Date().toISOString();
  const { data: created, error: createError } = await admin
    .from('message_threads')
    .insert({
      channel: 'live_chat',
      chat_state: 'awaiting_human',
      visitor_user_id: args.userId,
      visitor_name: name,
      visitor_email: email || null,
      identity_fingerprint: fingerprint,
      source: 'live-chat-fab',
      subject: `Live chat · ${name}`,
      mapping_status: 'unmapped',
      last_message_at: now,
    })
    .select(
      'id, chat_state, visitor_name, visitor_email, subject, last_message_at, awaiting_reply_since, prospect_id, mapping_status',
    )
    .single();

  if (createError || !created) {
    // Collision on fingerprint: reclaim only unbound/own threads; never join a foreign visitor.
    if (createError?.code === '23505') {
      const { data: byFp } = await admin
        .from('message_threads')
        .select(
          'id, chat_state, visitor_name, visitor_email, subject, last_message_at, awaiting_reply_since, prospect_id, mapping_status, visitor_user_id',
        )
        .eq('identity_fingerprint', fingerprint)
        .maybeSingle();
      if (byFp && (!byFp.visitor_user_id || byFp.visitor_user_id === args.userId)) {
        if (!byFp.visitor_user_id) {
          await admin
            .from('message_threads')
            .update({
              visitor_user_id: args.userId,
              visitor_name: name,
              visitor_email: email || null,
            })
            .eq('id', byFp.id);
        }
        return {
          ok: true,
          thread: {
            id: byFp.id,
            chatState: (byFp.chat_state as ChatState) || 'awaiting_human',
            visitorName: name,
            visitorEmail: email || null,
            subject: byFp.subject,
            lastMessageAt: byFp.last_message_at,
            awaitingReplySince: byFp.awaiting_reply_since,
            prospectId: byFp.prospect_id,
            mappingStatus: byFp.mapping_status,
          },
        };
      }

      if (byFp && byFp.visitor_user_id && byFp.visitor_user_id !== args.userId) {
        const altFingerprint = liveChatFingerprint(
          email ? `${email}#uid:${args.userId}` : '',
          name,
          args.userId,
        );
        const { data: createdAlt, error: altError } = await admin
          .from('message_threads')
          .insert({
            channel: 'live_chat',
            chat_state: 'awaiting_human',
            visitor_user_id: args.userId,
            visitor_name: name,
            visitor_email: email || null,
            identity_fingerprint: altFingerprint,
            source: 'live-chat-fab',
            subject: `Live chat · ${name}`,
            mapping_status: 'unmapped',
            last_message_at: now,
          })
          .select(
            'id, chat_state, visitor_name, visitor_email, subject, last_message_at, awaiting_reply_since, prospect_id, mapping_status',
          )
          .single();
        if (!altError && createdAlt) {
          await admin.from('messages').insert({
            thread_id: createdAlt.id,
            kind: 'live_chat_system',
            body: 'You’re chatting with Justin — a real person. He’ll jump in as soon as he can.',
            payload: {},
          });
          return {
            ok: true,
            thread: {
              id: createdAlt.id,
              chatState: 'awaiting_human',
              visitorName: name,
              visitorEmail: email || null,
              subject: createdAlt.subject,
              lastMessageAt: createdAlt.last_message_at,
              awaitingReplySince: createdAlt.awaiting_reply_since,
              prospectId: createdAlt.prospect_id,
              mappingStatus: createdAlt.mapping_status,
            },
          };
        }
      }
    }
    return { ok: false, error: createError?.message ?? 'Failed to create chat thread' };
  }

  const { error: systemError } = await admin.from('messages').insert({
    thread_id: created.id,
    kind: 'live_chat_system',
    body: 'You’re chatting with Justin — a real person. He’ll jump in as soon as he can.',
    payload: {},
  });
  if (systemError) {
    console.error('[liveChat] system message failed', systemError.message);
  }

  return {
    ok: true,
    thread: {
      id: created.id,
      chatState: 'awaiting_human',
      visitorName: name,
      visitorEmail: email || null,
      subject: created.subject,
      lastMessageAt: created.last_message_at,
      awaitingReplySince: created.awaiting_reply_since,
      prospectId: created.prospect_id,
      mappingStatus: created.mapping_status,
    },
  };
}

export async function insertVisitorMessage(
  admin: Admin,
  args: { threadId: string; userId: string; body: string },
): Promise<{ ok: true; messageId: string; firstMessage: boolean } | { ok: false; error: string }> {
  const body = args.body.trim();
  if (!body) return { ok: false, error: 'Message is required' };
  if (body.length > 4000) return { ok: false, error: 'Message is too long' };

  const { data: thread, error: threadError } = await admin
    .from('message_threads')
    .select('id, visitor_user_id, chat_state, visitor_name, visitor_email')
    .eq('id', args.threadId)
    .eq('channel', 'live_chat')
    .maybeSingle();

  if (threadError) return { ok: false, error: threadError.message };
  if (!thread || thread.visitor_user_id !== args.userId) {
    return { ok: false, error: 'Thread not found' };
  }

  const { count } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', args.threadId)
    .eq('kind', 'live_chat_visitor');

  const firstMessage = (count ?? 0) === 0;
  const now = new Date().toISOString();

  const { data: message, error: insertError } = await admin
    .from('messages')
    .insert({
      thread_id: args.threadId,
      kind: 'live_chat_visitor',
      body,
      payload: {
        role: 'visitor',
        visitorName: thread.visitor_name,
        visitorEmail: thread.visitor_email,
      },
    })
    .select('id')
    .single();

  if (insertError || !message) {
    return { ok: false, error: insertError?.message ?? 'Failed to send message' };
  }

  const patch: Database['public']['Tables']['message_threads']['Update'] = {
    last_message_at: now,
  };
  if (thread.chat_state !== 'human_active' && thread.chat_state !== 'ai_active') {
    patch.chat_state = 'awaiting_human';
    patch.awaiting_reply_since = now;
  } else if (thread.chat_state === 'ai_active') {
    patch.awaiting_reply_since = null;
  }

  await admin.from('message_threads').update(patch).eq('id', args.threadId);

  return { ok: true, messageId: message.id, firstMessage };
}

export async function runSilenceCheck(
  admin: Admin,
  args: { threadId: string; userId: string },
): Promise<
  | { ok: true; inserted: boolean; wittyLine?: string; chatState: ChatState }
  | { ok: false; error: string }
> {
  const { data: thread, error } = await admin
    .from('message_threads')
    .select('id, visitor_user_id, chat_state, awaiting_reply_since')
    .eq('id', args.threadId)
    .eq('channel', 'live_chat')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!thread || thread.visitor_user_id !== args.userId) {
    return { ok: false, error: 'Thread not found' };
  }

  if (thread.chat_state === 'human_active') {
    return { ok: true, inserted: false, chatState: 'human_active' };
  }
  if (thread.chat_state === 'ai_active') {
    return { ok: true, inserted: false, chatState: 'ai_active' };
  }

  const since = thread.awaiting_reply_since
    ? new Date(thread.awaiting_reply_since).getTime()
    : null;
  if (since == null || Date.now() - since < CHAT_SILENCE_MS) {
    return { ok: true, inserted: false, chatState: 'awaiting_human' };
  }

  const wittyLine = pickWittyLine(`${args.threadId}:${since}`);
  const now = new Date().toISOString();
  const { error: insertError } = await admin.from('messages').insert({
    thread_id: args.threadId,
    kind: 'live_chat_ai',
    body: wittyLine,
    payload: { role: 'ai', phase: 'holding' },
  });
  if (insertError) return { ok: false, error: insertError.message };

  const { error: updateError } = await admin
    .from('message_threads')
    .update({
      chat_state: 'ai_active',
      awaiting_reply_since: null,
      last_message_at: now,
    })
    .eq('id', args.threadId)
    .eq('chat_state', 'awaiting_human');

  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true, inserted: true, wittyLine, chatState: 'ai_active' };
}

export async function generateAiChatReply(
  admin: Admin,
  args: { threadId: string; userId: string },
): Promise<{ ok: true; body: string } | { ok: false; error: string; status?: number }> {
  const { data: thread, error } = await admin
    .from('message_threads')
    .select('id, visitor_user_id, chat_state, visitor_name')
    .eq('id', args.threadId)
    .eq('channel', 'live_chat')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!thread || thread.visitor_user_id !== args.userId) {
    return { ok: false, error: 'Thread not found', status: 404 };
  }
  if (thread.chat_state === 'human_active') {
    return { ok: false, error: 'Justin has joined this chat', status: 409 };
  }
  if (thread.chat_state !== 'ai_active') {
    return { ok: false, error: 'AI is not active on this thread yet', status: 409 };
  }

  const { data: history, error: histError } = await admin
    .from('messages')
    .select('kind, body, created_at')
    .eq('thread_id', args.threadId)
    .order('created_at', { ascending: true })
    .limit(40);

  if (histError) return { ok: false, error: histError.message };

  const transcript = (history ?? [])
    .map((m) => {
      const who =
        m.kind === 'live_chat_visitor'
          ? 'Visitor'
          : m.kind === 'live_chat_staff'
            ? 'Justin'
            : m.kind === 'live_chat_ai'
              ? 'Assistant'
              : 'System';
      return `${who}: ${m.body}`;
    })
    .join('\n');

  try {
    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      prompt: [
        'You are a brief, warm assistant covering for Justin Fassio, a BC wholesale apparel rep for Old Guys Rule.',
        'Justin is a real human who will take over when he can. Do not pretend to be Justin.',
        'Be witty in a lifestyle / outdoor / “guys who still get outside” tone — like an OGR shirt slogan, not corporate.',
        'Help with wholesale questions at a high level. Never invent confirmed inventory, pricing, or MOQ as facts.',
        'If you lack facts, say Justin will confirm. Keep replies under 80 words.',
        `Visitor name: ${thread.visitor_name ?? 'friend'}`,
        'Transcript:',
        transcript,
        'Write the next Assistant reply only (no prefix).',
      ].join('\n'),
    });

    const body = result.text.trim();
    if (!body) return { ok: false, error: 'Empty AI reply' };

    const now = new Date().toISOString();
    const { error: insertError } = await admin.from('messages').insert({
      thread_id: args.threadId,
      kind: 'live_chat_ai',
      body,
      payload: { role: 'ai', phase: 'reply' },
    });
    if (insertError) return { ok: false, error: insertError.message };

    await admin.from('message_threads').update({ last_message_at: now }).eq('id', args.threadId);

    return { ok: true, body };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI reply failed';
    return { ok: false, error: message };
  }
}

export async function insertStaffChatReply(
  staff: SupabaseClient<Database>,
  args: { threadId: string; body: string },
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const body = args.body.trim();
  if (!body) return { ok: false, error: 'Message is required' };
  if (body.length > 4000) return { ok: false, error: 'Message is too long' };

  const { data: thread, error: threadError } = await staff
    .from('message_threads')
    .select('id, channel')
    .eq('id', args.threadId)
    .maybeSingle();

  if (threadError) return { ok: false, error: threadError.message };
  if (!thread || thread.channel !== 'live_chat') {
    return { ok: false, error: 'Live chat thread not found' };
  }

  const now = new Date().toISOString();
  const { data: message, error: insertError } = await staff
    .from('messages')
    .insert({
      thread_id: args.threadId,
      kind: 'live_chat_staff',
      body,
      payload: { role: 'staff' },
    })
    .select('id')
    .single();

  if (insertError || !message) {
    return { ok: false, error: insertError?.message ?? 'Failed to send reply' };
  }

  const { data: before } = await staff
    .from('message_threads')
    .select('chat_state')
    .eq('id', args.threadId)
    .maybeSingle();

  const { error: updateError } = await staff
    .from('message_threads')
    .update({
      chat_state: 'human_active',
      awaiting_reply_since: null,
      last_message_at: now,
    })
    .eq('id', args.threadId);

  if (updateError) return { ok: false, error: updateError.message };

  // One-time takeover notice when leaving AI / awaiting states.
  if (before?.chat_state !== 'human_active') {
    const admin = getServiceRoleClient();
    if (admin) {
      await admin.from('messages').insert({
        thread_id: args.threadId,
        kind: 'live_chat_system',
        body: 'Justin joined the chat.',
        payload: { role: 'system', event: 'human_takeover' },
      });
    }
  }

  return { ok: true, messageId: message.id };
}

export async function sendLiveChatStaffAlert(args: {
  threadId: string;
  visitorName: string;
  visitorEmail: string;
  preview: string;
}): Promise<void> {
  const apiKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_xxxxxxxxx') return;

  const from =
    import.meta.env.WHOLESALE_ORDER_EMAIL_FROM ??
    process.env.WHOLESALE_ORDER_EMAIL_FROM ??
    `Justin Fassio <${CONTACT_EMAIL}>`;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: CONTACT_EMAIL,
      subject: `Live chat from ${args.visitorName}`,
      html: `
<p><strong>${escapeHtml(args.visitorName)}</strong> (${escapeHtml(args.visitorEmail)}) started a live chat.</p>
<p>${escapeHtml(args.preview.slice(0, 500))}</p>
<p>Open Messages in Rep Command Center to reply.</p>
<p>Thread: ${escapeHtml(args.threadId)}</p>
`.trim(),
    });
  } catch (err) {
    console.error('[liveChat] alert email failed', err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
