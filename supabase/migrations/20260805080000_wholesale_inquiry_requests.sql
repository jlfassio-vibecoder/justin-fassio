-- Wholesale inquiry mode: distinguish contact-only submissions from order requests,
-- and allow Message Center messages of kind wholesale_inquiry.

alter table wholesale_order_requests
  add column if not exists request_type text not null default 'order'
    check (request_type in ('order', 'inquiry'));

create index if not exists wholesale_order_requests_request_type_idx
  on wholesale_order_requests (request_type);

alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check
  check (kind in ('wholesale_order_request', 'wholesale_inquiry'));
