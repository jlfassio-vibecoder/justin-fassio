-- Alternate email on account contacts (Primary dual-send uses email + alternate_email).

alter table account_contacts
  add column if not exists alternate_email text;
