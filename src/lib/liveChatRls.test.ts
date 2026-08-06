import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260805200000_live_chat.sql'),
  'utf8',
);

describe('live chat RLS migration', () => {
  it('scopes visitor thread reads to auth.uid()', () => {
    expect(migration).toContain('live chat visitor read threads');
    expect(migration).toMatch(
      /live chat visitor read threads[\s\S]*?visitor_user_id = auth\.uid\(\)/,
    );
  });

  it('allows visitor message insert only as live_chat_visitor on own thread', () => {
    expect(migration).toContain('live chat visitor insert messages');
    expect(migration).toMatch(
      /live chat visitor insert messages[\s\S]*?kind = 'live_chat_visitor'[\s\S]*?visitor_user_id = auth\.uid\(\)/,
    );
  });

  it('keeps staff full access policies on message tables', () => {
    const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');
    expect(schema).toMatch(
      /create policy "approved staff full access" on message_threads[\s\S]*?is_approved_staff\(\)/,
    );
    expect(schema).toMatch(
      /create policy "approved staff full access" on messages[\s\S]*?is_approved_staff\(\)/,
    );
  });
});
