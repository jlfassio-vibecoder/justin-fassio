# West Coast operational territory memberships (Phase 0)

**Source:** Staff-approved Cascades / CA sales corridors (Census county FIPS 2024; LA ZIP partition v1)  
**Effective date:** 2026-08-22

## Artifacts

| File                  | Contents                                                          |
| --------------------- | ----------------------------------------------------------------- |
| `provenance.json`     | Seed source + effective_date                                      |
| `wa-or-counties.json` | Every WA (39) and OR (36) county → pnw-west or pnw-east           |
| `ca-counties.json`    | Every CA county except LA → territories 3–7                       |
| `la-zips.json`        | Exact LA County ZIPs → ca-central-la-north (5) or la-metro-oc (6) |

## Locked locks

- Monterey `06053` → norcal-coastal
- Fresno `06019` → norcal-inland
- Kern `06029` → ie-san-diego
- Los Angeles `06037` → **no county membership** (ZIP only)

## Coverage rules

- WA/OR/CA (ex-LA) counties appear exactly once
- Each approved LA ZIP appears exactly once
- Unknown ZIPs resolve to review, never inferred
