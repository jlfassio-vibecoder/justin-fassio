# Oregon prospect uploads

## Source docs

- Contact enrichment report: [`Oregon Business Contact Enrichment.md`](./Oregon%20Business%20Contact%20Enrichment.md)
- Big Wheel look-alike research narrative: [`oregon-big-wheel-look-a-likes.md`](./oregon-big-wheel-look-a-likes.md) (270-prospect research; CSVs not attached — see CRM checklist in that file)

## Import logs

| Batch                  | File                                    | Result                                                                                                     |
| ---------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Lookalike batch 1      | `oregon-big-wheel-lookalike-batch1.csv` | Top 25 + 10 verified chain locations (`or-bw-la-20260824-*`)                                               |
| Bandon corridor        | `bandon-corridor-20260825.csv`          | 10 new Bandon Old Town prospects                                                                           |
| Central Oregon         | `central-oregon-20260825.csv`           | 3 new (Sunriver Fly & Field, Bend Store, Outside In)                                                       |
| Marine & sporting      | `marine-sporting-20260825.csv`          | 3 new (Waldron’s, Bradbury’s, U Save Grants Pass)                                                          |
| Eastern / resort       | `eastern-resort-20260825.csv`           | 5 new (Joseph Hardware, Wallowa Lake Marina, A Piece of Pendleton, Bandon Dunes Pro Shop, OGA Golf Course) |
| Travel Oregon priority | `travel-oregon-priority-20260825.csv`   | 13 new look-alikes enriched from Works Cited links (`or-to-20260825-*`)                                    |
| Oregon Coast contact enrichment | `oregon-coast-contact-enrichment-20260826.xlsx` | Applied 2026-08-26: 35 matched Oregon Coast prospects — websites, phones, and published contact emails (`scripts/apply-oregon-coast-contact-enrichment.ts`) |

## Notes

- Seed account **Big Wheel General Store** (Bandon) is already an Active Account (`prospects.id = 613`) — do not re-import.
- Research claimed ~500–527 ranked storefronts; no full XLSX/CSV is attached. Imports so far are only the named stores published in the briefs/enrichment tables.
- Bulk Import `research_prospect` source is still disabled in-app; batches were loaded via staff SQL with `external_id` prefixes `or-bw-la-*`, `or-bandon-*`, `or-central-*`, `or-marine-*`, `or-eastern-*`, `or-to-*`.
