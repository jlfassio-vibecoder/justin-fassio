-- Additive correction: one active/resumable batch per sales line + file SHA.
-- Extends the committed-only unique index to include previewed so concurrent
-- commits resume the existing batch instead of creating a second one.
-- Does not rewrite 20260817200000 (already hosted).

drop index if exists public.account_import_batches_line_sha_committed_uidx;

create unique index if not exists account_import_batches_line_sha_active_uidx
  on account_import_batches (sales_line_id, content_sha256)
  where content_sha256 is not null
    and status in ('previewed', 'committed', 'enriching', 'enrichment_partial', 'completed');
