# PR5 Plan: Account Research UI Surfaces

**Status:** Implemented  
**Feature audit:** [docs/epics/agentic-outreach/account-research-before-product-selection.md](../epics/agentic-outreach/account-research-before-product-selection.md)  
**PR4 plan:** [account-research-pr4-product-match.md](./account-research-pr4-product-match.md)  
**Date:** 2026-08-23

Staff-facing Mode A UI: run/refresh research, review citations and suggestions, run line product match, and open the existing AI draft composer from a matched SKU. No new migrations or staff APIs.

---

## 1. Objective

1. **Account / prospect drawer** Research section: Run Search All, Refresh, source status, citations, suggestions (generate/apply/reject), product match (1–3 SKUs).
2. **Use for draft** on a match item → contact pick → `generate-draft` → `OgrProductEmailComposerModal`.
3. **Briefing** optional Research link on draft rows (does not block Log Call).

---

## 2. Scope

**In scope:** `accountResearchClient.ts`, `accountResearch/` components, drawer + briefing wiring, tests.

**Out of scope:** PR6 prep Mode B, identity-confirm RPC, removing `AiUpdateResearchModal`, nightly outreach changes.

---

## 3. Staff APIs consumed (PR2–PR4)

| Method | Route                                                      |
| ------ | ---------------------------------------------------------- |
| GET    | `/api/staff/account-research/latest?retailerId=&scope=`    |
| POST   | `/api/staff/account-research/run`                          |
| POST   | `/api/staff/account-research/[runId]/process`              |
| GET    | `/api/staff/account-research/[runId]`                      |
| GET    | `/api/staff/account-research/[runId]/suggestions`          |
| POST   | `/api/staff/account-research/[runId]/suggestions/generate` |
| POST   | `/api/staff/account-research/suggestions/[id]/apply`       |
| POST   | `/api/staff/account-research/suggestions/[id]/reject`      |
| POST   | `/api/staff/account-product-match/run`                     |
| POST   | `/api/staff/ogr-product-email/generate-draft`              |

Match replay on reopen: browser Supabase read (`account_product_match_*` + RLS).

---

## 4. Components

| Path                                                                 | Role                                        |
| -------------------------------------------------------------------- | ------------------------------------------- |
| `src/lib/accountResearchClient.ts`                                   | Staff fetch wrappers + process loop         |
| `src/lib/accountResearchDraftHandoff.ts`                             | Build generate-draft target + open composer |
| `src/components/accountResearch/AccountResearchPanel.tsx`            | Orchestrator                                |
| `src/components/accountResearch/AccountResearchContactPickModal.tsx` | Contact pick before draft                   |
| `AccountDetailDrawer` / `ProspectDetailDrawer`                       | Research section + composer state           |
| `AgentBriefingTab`                                                   | Optional Research button                    |

---

## 5. Tests

- `accountResearchClient.test.ts` — process loop, auth errors
- `accountResearchDraftHandoff.test.ts` — target shape
- `AccountResearchPanel.test.tsx` — run/match guards
- `AgentBriefingTab.test.tsx` — Research button

---

## 6. Acceptance

- Run/Refresh with process progress; fresh/stale badges
- Citations + `none_indexed` copy (not “inactive”)
- Suggestions generate/apply/reject without auto CRM write
- Product match + Use for draft → composer
- Briefing Research opens drawer on Research section
- `npm run check` green
