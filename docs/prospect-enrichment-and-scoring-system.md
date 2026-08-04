You are working on the Old Guys Rule British Columbia wholesale CRM.

Implement a shared prospect-enrichment and scoring system that can populate blank planning fields when an account is added manually, imported from another source, or created through “Add via AI.”

The system must remain compatible with the existing 423-account BC prospect list.

## **Core principle**

Separate the system into three layers:

1. Evidence collected by AI or entered by a user
2. Deterministic calculations performed by application code
3. Human-verified commercial facts

Do not allow the language model to freely invent fit scores, priorities, grades, purchasing potential or qualification status.

AI may research, classify and summarize evidence. Deterministic application code must calculate derived values from defined rules.

The default behaviour is “fill blanks only.” Existing nonblank CRM values must not be overwritten unless the user explicitly selects an update or approves a proposed change.

## **First step: inspect the existing application**

Before changing code:

1. Locate the prospect and active-account data models.
2. Locate `RetailerDirectory`, `ProspectsTab`, `ActiveAccountsTab` and the existing AI actions.
3. Identify the database field names corresponding to the fields below.
4. Identify any existing scoring, demotion, display-rank or qualification logic.
5. Reuse existing enums and components where sensible.
6. Do not create duplicate AI enrichment services or scoring functions.
7. Produce a short implementation plan identifying:
   - Existing fields
   - Missing fields
   - Fields requiring migration
   - Existing AI actions that overlap
   - Shared functions/components that should be consolidated

After the inspection, implement the system using the existing project architecture and conventions.

# **1\. Prospect fields**

Support the following prospect-planning fields.

## **Identity and location**

- `businessName`
- `city`
- `province`
- `postalCode`
- `website`
- `primaryDistrict`
- `subterritory`
- `retailCategory`

## **Commercial planning**

- `fitScore`
- `scoreStatus`
- `scoreConfidence`
- `annualPurchasingPotentialUsd`
- `idealOpeningUnits`
- `priority`
- `provisionalGrade`
- `reasonForInclusion`

## **Verification and qualification**

- `verificationStatus`
- `buyerName`
- `buyerTitle`
- `buyerEmail`
- `buyerPhone`
- `buyerVerified`
- `apparelCapability`
- `existingOgrStatus`
- `qualificationStatus`
- `nextAction`

## **Evidence and audit**

- `sourceNote`
- `sourceUrls`
- `lastResearchedAt`
- `lastScoredAt`
- `aiResearchSummary`
- `aiConfidence`
- `fieldProvenance`
- `humanReviewRequired`

Use the project’s existing naming conventions if equivalent fields already exist.

## **Field provenance**

Where practical, record provenance for AI-populated fields:

type FieldProvenance \= {  
field: string;  
sourceType: "user" | "import" | "website" | "directory" | "ai\_inference" | "calculated";  
sourceUrl?: string;  
observedAt?: string;  
confidence?: "low" | "medium" | "high";  
};

A source URL should support the field it is attached to. Do not attach a generic homepage as proof of a specific unsupported claim.

# **2\. BC territory mapping**

Derive district and subterritory from the city or postal code.

Use these five primary districts:

1. Okanagan
2. Thompson and Kootenays
3. Lower Mainland
4. Vancouver Island
5. Northern British Columbia

Supported subterritories include:

- Central Okanagan
- South Okanagan
- North Okanagan
- Thompson
- Kootenays
- Lower Mainland
- Fraser Valley
- Sea-to-Sky
- Sunshine Coast
- Vancouver Island South
- Vancouver Island Central
- Vancouver Island North
- Cariboo
- Prince George
- Bulkley Valley
- Northwest BC
- Peace Region

If the application cannot confidently map the location, use `Needs mapping`. Do not guess.

Keep territory mapping in a reusable configuration file rather than embedding it inside UI components or AI prompts.

# **3\. Retail-category classification**

Classify prospects into one of these canonical categories:

- Golf pro shop
- Fishing / outdoor retailer
- Marine dealer / supply
- Marina / resort store
- RV dealer / campground
- Hardware / farm store with apparel
- Motorcycle dealer
- Independent gift / tourist store
- Museum / attraction / resort shop
- Men’s specialty / lifestyle
- Other / needs review

AI may map descriptive business types into a canonical category, but it must provide the evidence or rationale for the classification.

Examples:

- Fly shops, tackle shops and fishing outfitters with retail merchandise map to `Fishing / outdoor retailer`.
- Boat dealers and marine-supply stores map to `Marine dealer / supply`.
- Resort marinas with a customer-facing shop map to `Marina / resort store`.
- Golf clubs with a pro shop map to `Golf pro shop`.
- Hardware stores only map to `Hardware / farm store with apparel` when apparel availability is confirmed or credibly indicated.

Retail category alone does not make an account qualified.

If evidence is insufficient, use `Other / needs review` and do not manufacture a score.

# **4\. Original seed-scoring logic**

The existing 423-account list used the following provisional category baselines:

| Retail category                    | Base fit | Base annual potential US$ | Ideal opening units |
| ---------------------------------- | -------- | ------------------------- | ------------------- |
| Golf pro shop                      | 9        | 3,600                     | 60                  |
| Fishing / outdoor retailer         | 9        | 3,300                     | 60                  |
| Marine dealer / supply             | 8        | 3,000                     | 60                  |
| Marina / resort store              | 8        | 3,300                     | 60                  |
| RV dealer / campground             | 8        | 2,400                     | 48                  |
| Hardware / farm store with apparel | 7        | 2,100                     | 48                  |
| Motorcycle dealer                  | 7        | 2,200                     | 48                  |
| Independent gift / tourist store   | 9        | 3,200                     | 60                  |
| Museum / attraction / resort shop  | 8        | 2,800                     | 48                  |
| Men’s specialty / lifestyle        | 7        | 2,400                     | 48                  |

These figures are planning estimates, not historical account performance.

## **Geographic adjustment**

Add `+1` to the base fit score for account density and serviceability when the account is in:

- Central Okanagan
- South Okanagan
- North Okanagan
- Lower Mainland
- Fraser Valley
- Vancouver Island Central

Subtract `-1` when the account is in:

- Vancouver Island North
- Cariboo
- Bulkley Valley
- Northwest BC
- Peace Region

Use no geographic adjustment for other mapped subterritories.

Clamp the resulting score to a minimum of 4 and maximum of 10\.

## **Strategic-reference adjustment**

Add `+1`, up to a maximum score of 10, when credible evidence shows the prospect has exceptional reference value, such as:

- Recognized destination or visitor attraction
- Major resort
- High-profile golf destination
- Well-known fishing, outdoor or marine retailer
- Important regional museum
- High-traffic tourism account
- Strong reference value for opening similar retailers nearby

Do not apply this adjustment simply because the business has “resort,” “museum” or another keyword in its name. Require evidence.

Store the reason for the adjustment.

## **Seed fit formula**

seedFitScore \= clamp(  
categoryBaseFit \+  
geographicAdjustment \+  
strategicReferenceAdjustment,  
4,  
10  
);

Set:

scoreStatus \= "provisional";

A provisional score must never be displayed as a verified commercial assessment.

# **5\. Evidence-based scoring**

Add a second, evidence-based scoring function for accounts that have been researched or qualified.

Score the following components:

| Component                                       | Points   |
| ----------------------------------------------- | -------- |
| Target customer and gift-buyer alignment        | 0–2      |
| Old Guys Rule lifestyle-theme alignment         | 0–2      |
| Proven apparel merchandising capability         | 0–2      |
| Tourism, destination or seasonal gift traffic   | 0–1      |
| Retail-price and retailer-margin compatibility  | 0–1      |
| Reorder and replenishment potential             | 0–1      |
| Serviceability and route economics from Kelowna | 0–1      |
| **Total**                                       | **0–10** |

## **Customer and gift-buyer alignment: 0–2**

- `0`: No evidence of men 45+ or relevant gift purchasers
- `1`: Plausible but indirect customer alignment
- `2`: Clear evidence of older male traffic, lifestyle customers or gift purchasing for men

## **Lifestyle-theme alignment: 0–2**

Relevant Old Guys Rule themes include:

- Fishing
- Boating
- Golf
- Camping
- RV travel
- Retirement
- BBQ
- Beer
- Motorcycles
- Classic cars
- Grandpa and gift humour

Score:

- `0`: No meaningful theme alignment
- `1`: One plausible theme or weak supporting evidence
- `2`: Strong alignment with one or more major themes

## **Apparel merchandising capability: 0–2**

- `0`: No apparel, no suitable retail area, or third-party apparel prohibited
- `1`: Apparel appears possible but is not confirmed
- `2`: Confirmed apparel assortment, fixtures, sizing capability or graphic-tee sales

## **Tourism and seasonal gift traffic: 0–1**

- `0`: No meaningful evidence
- `1`: Credible tourism, resort, destination, marina, golf, campground or seasonal gift traffic

## **Price and margin compatibility: 0–1**

- `0`: Comparable products appear materially below the required retail price, or the retailer cannot support the required margin
- `1`: Comparable apparel or premium gifts indicate price compatibility

If pricing evidence is unavailable, do not award the point.

## **Reorder potential: 0–1**

- `0`: One-time souvenir environment, extremely short season, no replenishment process, or no apparel depth
- `1`: Evidence of ongoing retail trade, repeat traffic, replenishable merchandise or year-round/recurring seasonal demand

## **Serviceability and route economics: 0–1**

- `0`: Remote, isolated or uneconomic without an appointment-dense route
- `1`: Efficiently serviceable from Kelowna, located in an existing route cluster, or practical to support remotely

## **Effective fit score**

Use the evidence-based score only when sufficient evidence exists for at least five of the seven scoring components.

Otherwise, retain the seed score and mark it provisional.

effectiveFitScore \=  
evidenceCoverage \>= 5  
? evidenceBasedFitScore  
: seedFitScore;

Set:

- `scoreStatus = "evidence_scored"` when based on researched public evidence
- `scoreStatus = "buyer_verified"` only after direct buyer validation
- `scoreConfidence = "low" | "medium" | "high"` based on evidence coverage and source quality

The UI must visibly distinguish provisional, evidence-scored and buyer-verified scores.

# **6\. Priority and provisional grade**

Keep priority separate from account status.

## **Remote subterritories**

Treat these as remote for priority purposes:

- Vancouver Island North
- Cariboo
- Prince George
- Bulkley Valley
- Northwest BC
- Peace Region

For remote accounts:

- Score 8–10 → `Tier 2`
- Score 4–7 → `Tier 3`

Do not assign `Tier 1` solely from a high fit score in a remote market. A remote account may be promoted manually after a qualified appointment, strategic opportunity or viable route cluster is confirmed.

## **Nonremote accounts**

Assign:

- `Tier 1` when score is 9–10 and the account is either:
  - In the Okanagan, or
  - A validated strategic-reference opportunity
- `Tier 2` when score is 7–10 but Tier 1 conditions are not met
- `Tier 3` when score is below 7

Map priority to provisional grade:

- Tier 1 → `A (provisional)`
- Tier 2 → `B (provisional)`
- Tier 3 → `C (provisional)`

Do not assign a final A, B, C or D account classification until buyer engagement, economics and qualification evidence exist.

# **7\. Annual purchasing-potential calculation**

For compatibility with the original list:

remoteFactor \= isRemote ? 0.8 : 1.0;  
highFitFactor \= effectiveFitScore \>= 9 ? 1.15 : 1.0;

annualPurchasingPotentialUsd \=  
roundToNearest100(  
categoryBaseAnnualPotentialUsd \*  
remoteFactor \*  
highFitFactor  
);

Label this field clearly as a planning estimate.

It is not:

- A booked-sales forecast
- An opening-order value
- Confirmed annual revenue
- Evidence that the prospect will reorder

Once actual order history exists, show actual account revenue separately and do not overwrite it with the planning estimate.

# **8\. Ideal opening units**

Use the category baseline:

- 60 units for golf, fishing/outdoor, marine supply, marina/resort and independent gift/tourist accounts
- 48 units for RV/campground, hardware/farm, motorcycle, museum/attraction/resort and men’s specialty accounts
- 24 units only as a cautious test recommendation when evidence is incomplete or the buyer requests the minimum

The wholesale minimum is 24 pieces, packed six per style.

Ideal opening units are a recommendation, not a confirmed order.

# **9\. Verification rules**

Use controlled statuses.

## **Verification status**

Suggested values:

- `Unverified`
- `Directory lead`
- `Website confirmed`
- `Evidence reviewed`
- `Buyer confirmed`
- `Conflicting information`
- `Closed / no longer operating`

Definitions:

- `Directory lead`: Found only in a directory or planning source
- `Website confirmed`: Current business operation is supported by an official website or credible current source
- `Evidence reviewed`: Multiple relevant facts have been reviewed
- `Buyer confirmed`: Buyer identity and authority have been directly validated
- `Conflicting information`: Sources disagree or appear stale

## **Buyer verified**

AI research alone must not normally set `buyerVerified = true`.

Set it to true only when:

- The buyer confirms their role directly;
- A user records a completed conversation confirming authority; or
- Another approved first-party business source explicitly identifies current buying authority.

A name found on a general web page or social profile is not sufficient proof of buying authority.

## **Apparel capability**

Suggested values:

- `Confirmed`
- `Likely`
- `No`
- `Unknown`

Use `Confirmed` only when there is direct evidence of apparel merchandise, apparel fixtures, online apparel products or buyer confirmation.

Use `Likely` when the retail format plausibly supports apparel but direct evidence is incomplete.

## **Existing OGR status**

Suggested values:

- `Confirmed stockist`
- `Possible stockist`
- `No evidence found`
- `Unknown`

Absence of online evidence does not prove the retailer does not carry Old Guys Rule.

# **10\. Qualification status**

Suggested values:

- `Unqualified`
- `Researching`
- `Ready for outreach`
- `Contacted`
- `Appointment requested`
- `Appointment booked`
- `Qualified`
- `Disqualified`
- `Opened account`

AI may set:

- `Researching`
- `Ready for outreach`

AI must not independently set:

- `Qualified`
- `Disqualified`
- `Opened account`
- `Buyer confirmed`

A prospect becomes `Qualified` only when all five gates are confirmed:

1. Appropriate customer or gift-buyer traffic
2. Apparel capability
3. Retail-price and margin compatibility
4. Timing and open-to-buy
5. Buyer authority

Remote travel must be based on qualified appointments or expected contribution, not on unqualified prospect count.

# **11\. Reason for inclusion**

Generate one concise, evidence-based sentence explaining:

1. Why the customer base may fit
2. Which Old Guys Rule themes align
3. The principal commercial uncertainty still requiring validation

Example:

“Older male and destination-gift traffic appear aligned with the golf collection; confirm authority to buy non-logo apparel, compatible retail pricing and replenishment cadence.”

Do not generate generic statements such as “This would be a great fit.”

# **12\. Next-action logic**

Generate one specific next action based on evidence gaps and priority.

Examples:

## **Tier 1**

“Identify the current apparel buyer and complete a phone qualification before adding the account to the next Okanagan route.”

## **Tier 2**

“Send a category-specific introduction, then call to confirm apparel capability, retail pricing and seasonal buying timing.”

## **Tier 3 or remote unqualified**

“Continue remote research and nurture; do not schedule field travel until buyer interest or route density improves.”

## **Missing website or operating evidence**

“Verify the business is currently operating and locate an official website or current directory record.”

## **Apparel capability unknown**

“Confirm whether the location sells third-party apparel and has space for a 24–60-piece opening assortment.”

Next actions should be operationally specific and should identify the unresolved qualification gate.

# **13\. Source-note requirements**

Create a concise source note containing:

- Source type
- What the source establishes
- What remains unverified
- Research date

Example:

“Official website confirms an operating golf course and pro shop as of 2026-08-04. Men’s third-party apparel, buyer authority, price compatibility and open-to-buy remain unverified.”

Store supporting URLs separately when the data model permits.

Do not claim that a retailer carries apparel, serves a demographic or stocks Old Guys Rule unless the cited evidence supports that conclusion.

# **14\. AI-tool contracts**

Consolidate overlapping AI behaviour into explicit tool contracts.

## **Verify & Update**

Purpose:

- Research the prospect
- Fill blank factual and planning fields
- Flag stale or conflicting information
- Propose changes to existing fields

Rules:

- Fill blanks automatically when supported
- Show proposed changes before overwriting nonblank fields
- Never overwrite user-confirmed information silently
- Include evidence and confidence for every material update
- Recalculate derived values after evidence fields change

## **Recommend Next Action**

Purpose:

- Examine qualification gaps, territory priority and recent activity
- Produce one prioritized sales action with rationale

Rules:

- Do not modify unrelated CRM fields
- Require confirmation before replacing the existing next action

## **Generate Account Brief**

Purpose:

- Create a dated pre-call or account-planning brief

Include:

- Business overview
- Customer and theme fit
- Evidence summary
- Score explanation
- Commercial opportunity
- Known contacts
- Qualification gaps
- Suggested opening assortment
- Objections or risks
- Recommended call objective
- Sources

Save briefs as dated activity records. Do not write an entire brief into core prospect fields.

## **Ask AI About Account**

Purpose:

- Answer questions using the current CRM record, research evidence and activity history

Rules:

- Read-only by default
- Any proposed record update must be displayed separately and confirmed by the user

# **15\. Blank-field enrichment workflow**

When a new account is created:

1. Normalize the business name and address.
2. Check for duplicates before creating a new record.
3. Determine city, province and postal code.
4. Map the BC district and subterritory.
5. Locate the official website or credible directory record.
6. Classify the canonical retail category.
7. Extract evidence for:
   - Customer alignment
   - Lifestyle themes
   - Apparel capability
   - Tourism or seasonal traffic
   - Price compatibility
   - Reorder potential
   - Serviceability
8. Calculate the seed score.
9. Calculate an evidence-based score only if evidence coverage is sufficient.
10. Calculate annual planning potential.
11. Assign provisional priority and grade.
12. Generate the reason for inclusion.
13. Set verification and qualification statuses.
14. Generate one next action.
15. Save sources, timestamps, confidence and field provenance.
16. Present a result summary to the user.

# **16\. Result interface**

After enrichment, show:

- Fields populated
- Fields left unknown
- Score and component breakdown
- Score status and confidence
- Priority and provisional grade
- Estimated annual potential
- Evidence sources
- Warnings or conflicting information
- Recommended next action
- Any proposed overwrites requiring approval

Allow the user to:

- Accept all supported blank-field updates
- Review fields individually
- Reject an update
- Approve an overwrite
- Mark information as human verified

# **17\. Safeguards**

The system must:

- Never fabricate buyer names, emails, phone numbers or retail capabilities
- Never treat a business directory listing as qualification
- Never equate category membership with apparel capability
- Never convert a planning estimate into booked or forecast revenue
- Never mark an account qualified without the five qualification gates
- Never recommend remote travel from Kelowna based only on prospect count
- Never overwrite user-confirmed fields without approval
- Never hide conflicting evidence
- Preserve an audit trail of AI and user changes
- Be idempotent: rerunning enrichment should not create duplicate records, duplicate sources or repeated activity entries

# **18\. Technical structure**

Create reusable modules equivalent to:

classifyRetailCategory(evidence)  
mapBcTerritory(location)  
calculateSeedFitScore(category, subterritory, strategicReference)  
calculateEvidenceFitScore(evidenceComponents)  
calculatePlanningPotential(category, score, subterritory)  
assignProspectPriority(score, subterritory, strategicReference)  
assignProvisionalGrade(priority)  
evaluateQualificationGates(record)  
recommendNextAction(record)  
buildSourceNote(evidence)

Keep the scoring configuration in a typed configuration file so values can be changed without editing components.

Add unit tests for:

- Every category baseline
- Dense-market adjustments
- Remote-market adjustments
- Strategic-reference adjustment
- Score clamping
- Remote Tier 1 prevention
- Priority and grade mapping
- Annual-potential rounding
- Insufficient evidence handling
- Qualification-gate enforcement
- Fill-blanks-only behaviour
- Protected human-verified fields
- Duplicate prevention
- Idempotent enrichment

# **19\. Acceptance criteria**

The implementation is complete when:

1. A manually created BC prospect with only a business name and city can be researched and populated without creating a duplicate.
2. Territory mapping, scoring, priority, grade and planning potential are calculated by deterministic code.
3. AI-populated facts have sources and confidence.
4. Unknown facts remain explicitly unknown rather than being guessed.
5. Existing nonblank values are protected by default.
6. A user can review proposed overwrites.
7. Provisional scores are visibly different from buyer-verified assessments.
8. Remote prospects cannot become Tier 1 solely because of category fit.
9. Qualification requires all five commercial gates.
10. All AI actions use the same enrichment and scoring services.
11. Tests cover the scoring and safety rules.
12. Existing imported prospects continue to render and behave correctly.
