# Resend engagement checklist (Product Outreach)

Ops checklist so open/click analytics land in CRM. See also [`docs/audits/email-opens-clicks-analytics-audit.md`](../audits/email-opens-clicks-analytics-audit.md).

## Required env

| Variable                    | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`            | Send product outreach                                                                       |
| `RESEND_WEBHOOK_SECRET`     | Svix signing secret for `POST /api/webhooks/resend` (not the placeholder `whsec_xxxxxxxxx`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook apply + unmatched-event buffer/replay                                               |

## Resend dashboard

1. **Open tracking** and **click tracking** enabled for the sending domain / account.
2. Webhook endpoint → production `/api/webhooks/resend` subscribed to:
   - `email.sent`
   - `email.delivered`
   - `email.opened`
   - `email.clicked`
   - `email.bounced`
   - `email.failed`
   - `email.complained`

## How engagement is stored

1. Send path inserts/stamps `system_messages.resend_email_id`.
2. Webhooks apply via `apply_resend_system_message_event` (idempotent on Svix id).
3. If a webhook arrives before the CRM stamp, the event is buffered in `resend_unmatched_events` and replayed after stamp.

## Known biases

Open counts include privacy-prefetch / Apple Mail Privacy Protection opens. Lead scoring caps open-only products (`openOnlyProductCap`); clicks remain the stronger signal.
