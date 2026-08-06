import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260805200000_live_chat.sql'),
  'utf8',
);
const harden = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260806160000_live_chat_visitor_rls_harden.sql'),
  'utf8',
);
const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');

describe('live chat RLS migration', () => {
  it('scopes visitor thread reads to auth.uid()', () => {
    expect(migration).toContain('live chat visitor read threads');
    expect(migration).toMatch(
      /live chat visitor read threads[\s\S]*?visitor_user_id = auth\.uid\(\)/,
    );
  });

  it('drops visitor thread UPDATE and message INSERT after harden migration', () => {
    expect(harden).toContain('drop policy if exists "live chat visitor update own thread meta"');
    expect(harden).toContain('drop policy if exists "live chat visitor insert messages"');
    expect(schema).not.toMatch(/create policy "live chat visitor update own thread meta"/);
    expect(schema).not.toMatch(/create policy "live chat visitor insert messages"/);
  });

  it('keeps staff full access policies on message tables', () => {
    expect(schema).toMatch(
      /create policy "approved staff full access" on message_threads[\s\S]*?is_approved_staff\(\)/,
    );
    expect(schema).toMatch(
      /create policy "approved staff full access" on messages[\s\S]*?is_approved_staff\(\)/,
    );
  });
});
