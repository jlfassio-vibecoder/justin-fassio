-- Harden live-chat visitor RLS: threads/messages are mutated via service-role APIs.
-- Visitors keep SELECT for Realtime; drop client UPDATE/INSERT that could bypass state machine / rate limits.

drop policy if exists "live chat visitor update own thread meta" on message_threads;

drop policy if exists "live chat visitor insert messages" on messages;
