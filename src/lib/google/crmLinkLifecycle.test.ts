import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Google CRM link lifecycle schema', () => {
  it('cascades gmail and calendar links when google connection is deleted', () => {
    const gmail = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260809200000_gmail_thread_links.sql'),
      'utf8',
    );
    const calendar = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260810020000_calendar_event_links.sql'),
      'utf8',
    );
    expect(gmail).toMatch(
      /google_connection_id\s+uuid\s+not null\s+references\s+google_account_connections\s*\(\s*id\s*\)\s+on delete cascade/i,
    );
    expect(calendar).toMatch(
      /google_connection_id\s+uuid\s+not null\s+references\s+google_account_connections\s*\(\s*id\s*\)\s+on delete cascade/i,
    );
    expect(gmail).toMatch(/prospect_id.*on delete set null/i);
    expect(calendar).toMatch(/prospect_id.*on delete set null/i);
  });
});
