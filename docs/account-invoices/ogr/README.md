# OGR active-account invoices (Vintage Goods)

Drop **one latest Vintage Goods invoice PDF per active account** here, then import into Supabase:

```bash
npm run import:account-invoices
```

Requires `PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` (same as other staff import scripts).

## Filename conventions

| Pattern                        | Example             | Match                                         |
| ------------------------------ | ------------------- | --------------------------------------------- |
| `{prospectId}.pdf` (preferred) | `613.pdf`           | CRM prospect id                               |
| `{Store Name}.pdf`             | `The Man Store.pdf` | Fuzzy match on **Bill To** vs active accounts |

Replace the file when a newer invoice arrives, then re-run import.

## Format

Vintage Goods Apparel PDFs only (OGR line). Parsed fields: invoice #, date, bill-to name, line items (`OG####` SKUs + quantities).

Parsed rows live in Supabase (`account_invoices`, `account_invoice_lines`). Source PDFs may stay local only (not committed).

## Active Account Briefing

After import:

- **Prep** auto-selects the catalog product matching the **highest total quantity** style on the account’s most recent invoice.
- **Add copy** uses purchase history + recent Instagram/Facebook research (not prospect location/vibe).

## Import log

| Date                                 | Notes |
| ------------------------------------ | ----- |
| _(add rows when you import batches)_ |       |
