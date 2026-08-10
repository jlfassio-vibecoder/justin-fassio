## **Product architecture**

The authenticated backend remains the source of truth.

The public page should query only products that meet all of these conditions:

* Brand is Old Guys Rule  
* Product is marked as publicly published  
* Product is not archived or discontinued  
* Product has the minimum required public merchandising data

Add public merchandising fields only when equivalent fields do not already exist.

Suggested product structure:

type WholesaleProduct \= {  
  id: string;  
  brandId: string;  
  sku: string;  
  slug: string;  
  productName: string;  
  category: string;  
  collection?: string;  
  themes?: string\[\];  
  color?: string;  
  tagline?: string;  
  description?: string;

  catalogPage?: number;  
  catalogYear?: number;

  wholesalePriceUsd: number;  
  estimatedLandedCad?: number;  
  suggestedRetailCad?: number;  
  estimatedRetailerMarginPct?: number;

  availableSizes?: string\[\];  
  sizeNotes?: string;  
  minimumStyleUnits?: number;  
  casePack?: number;

  primaryImageUrl?: string;  
  imageUrls?: string\[\];  
  imageAltText?: string\[\];

  productStatus:  
    | "active"  
    | "new"  
    | "coming\_soon"  
    | "discontinued"  
    | "out\_of\_stock";

  isPubliclyPublished: boolean;  
  publicSortOrder?: number;  
  featured: boolean;

  createdAt: string;  
  updatedAt: string;  
};

Reuse existing names and structures where possible. Do not introduce competing versions of existing fields.

## **Image data**

Use the verified Shopify CDN image URLs already collected for the Old Guys Rule catalog.

Requirements:

* Store the primary image separately from alternate images.  
* Preserve each original live CDN URL.  
* Use descriptive alt text containing product name and SKU.  
* Do not construct or guess CDN filenames.  
* Products without a verified image should remain unpublished by default.  
* Provide a controlled placeholder only if an administrator intentionally publishes a product without an image.  
* Do not let an image failure break the product grid.  
* Lazy-load images below the fold.  
* Preserve image aspect ratio without cropping shirt artwork incorrectly.

The current catalog research contains:

* 189 catalog line items  
* 155 products matched to published live OGR products  
* 618 verified live image URLs  
* 34 catalog items without a published live image match

There is one known catalog discrepancy:

* “Chasing Tail” is printed in the catalog as `OG2164-SPF`  
* The live store identifies it as `OG2010-SPF`

Do not silently overwrite either value. Preserve the catalog SKU, record the live SKU as an alternate/source SKU and flag the discrepancy for administrative review.

## **Public routes**

Create:

/old-guys-rule-wholesale  
/old-guys-rule-wholesale/\[product-slug\]

The collection route is the primary wholesale showroom.

Each product needs a stable, shareable detail URL. Clicking a product card can open a modal or drawer for speed, but the browser URL must update to the product’s canonical product route. Direct navigation, refresh and browser back/forward must work correctly.

Avoid placing database IDs in public URLs.

## **Homepage integration**

Update the Old Guys Rule card on the homepage:

* Change “View Line” to link to `/old-guys-rule-wholesale`  
* Keep the existing visual language of the homepage  
* Do not alter the Busted Knuckles “Coming Soon” behavior  
* Consider changing the CTA copy to “View Wholesale Collection” if it fits without harming the existing card layout

Add “Wholesale” to the public navigation only if it fits the existing navigation hierarchy cleanly.

## **Page positioning**

The page should immediately communicate:

* Old Guys Rule is a men’s lifestyle apparel collection  
* It is intended for independent Canadian retailers  
* Customers are generally men aged approximately 45–75 and gift buyers  
* Core themes include fishing, boating, golf, camping, RV travel, retirement, BBQ, beer, motorcycles, classic cars and grandpa humor  
* Products are sold wholesale through Justin Fassio  
* Prices and fulfillment terms are subject to order confirmation

Suggested hero content:

Old Guys Rule Wholesale

A proven men’s lifestyle collection built around the things guys never  
outgrow—fishing, boats, golf, camping, garages, cold beer and well-earned  
retirement.

Available to qualified Canadian retailers.

Primary CTA:

`Browse the Collection`

Secondary CTA:

`Ask About the Line`

Do not claim exclusivity, Canadian inventory, guaranteed delivery dates, duty-free treatment or fixed landed costs unless those facts exist in the database and have been approved.

## **Collection page**

Build a responsive, visual product grid rather than exposing the backend spreadsheet.

Each card should show:

* Primary product image  
* Product name  
* SKU  
* Category  
* Color, when available  
* Tagline, when useful  
* Wholesale price in USD  
* Suggested retail price in CAD, when available  
* “New” or “Coming Soon” badge when applicable  
* View Details action  
* Add to Order action when order-building is enabled

Use the alternate product image on hover only when it works on pointer devices. Do not make important information hover-dependent.

### **Search and filters**

Provide:

* Search by product name, SKU or tagline  
* Category filter  
* Lifestyle-theme filter  
* Color filter if the data quality supports it  
* Availability/status filter  
* Featured/new filter  
* Sort by recommended, product name, category, wholesale price and newest

Filters must:

* Work together  
* Be reflected in URL query parameters  
* Survive refresh  
* Have a clear-all action  
* Remain usable on mobile  
* Display the number of matching products

Do not show empty filters generated from blank or inconsistent data.

## **Product detail experience**

The product detail route or modal should include:

* Image gallery  
* Primary and alternate images  
* Zoom or enlarged image view  
* Product name  
* SKU  
* Alternate/source SKU when applicable  
* Category  
* Collection or lifestyle themes  
* Color  
* Tagline  
* Product description  
* Wholesale price in USD  
* Estimated landed price in CAD, if available  
* Suggested retail price in CAD  
* Estimated retailer gross margin  
* Available sizes  
* Size notes  
* Minimum style quantity  
* Order quantity controls  
* Add to Order  
* Contact Justin About This Product  
* Copy Product Link

All editable product data must continue to be controlled from the authenticated backend. Do not add public inline editing.

## **Pricing rules**

Never hard-code a permanent wholesale price in the public components.

Use the current database value for each SKU.

Display currencies explicitly:

* `US$13.50 wholesale`  
* `Estimated C$__.00 landed`  
* `Suggested retail C$44.99`

Do not display an unlabeled dollar sign.

Estimated landed cost must be labeled as an estimate and should have access to the assumptions used to calculate it, including:

* CAD/USD exchange rate  
* Duty or tariff assumption  
* Freight allocation  
* Brokerage allocation  
* Exclusion or inclusion of GST

Retailer margin should be calculated using the pre-GST retail price and the applicable landed inventory cost.

Do not treat GST as a retailer inventory cost when the registered retailer can claim the input tax credit.

Example calculation:

const retailBeforeTax \= msrpCad;  
const grossMarginPct \=  
  ((retailBeforeTax \- estimatedLandedCad) / retailBeforeTax) \* 100;

If an authoritative landed estimate is unavailable, omit it instead of presenting unsupported precision.

## **Wholesale order builder**

Implement a lightweight order-request builder, not a consumer shopping cart.

A buyer should be able to:

1. Add products.  
2. Select quantities by size.  
3. Adjust or remove quantities.  
4. See total units.  
5. See merchandise subtotal in USD.  
6. See whether minimum requirements have been met.  
7. Save the draft locally while continuing to browse.  
8. Submit the proposed order for confirmation.

Use current business rules from the database when they exist.

Initial fallback rules, only if no configurable rules exist:

* Minimum opening order: 24 total units  
* Minimum per selected style: 6 units

Do not assume every SKU uses the same case pack if product-level data says otherwise.

The order summary must state:

This is an order request, not a completed purchase. Pricing, availability,  
freight, duties, delivery timing and payment terms will be confirmed before  
the order is accepted.

Do not add payment processing in this phase.

## **Buyer information form**

Require:

* Store or business name  
* Buyer name  
* Email  
* Phone  
* City  
* Province  
* Postal code  
* Retail channel  
* Existing customer: yes/no  
* Requested products and quantities  
* Notes

Optional fields:

* Website  
* Shipping address  
* Billing address  
* GST/HST number  
* Purchase-order number  
* Preferred delivery date  
* Best contact method

Validate fields on both client and server.

Do not require a GST number merely to submit an inquiry.

## **CRM integration**

On submission:

1. Create an immutable order-request record.  
2. Store line-item snapshots, including SKU, name, price and quantity at submission time.  
3. Link the request to an existing retailer using a reliable identifier when a confident match exists.  
4. If there is no confident retailer match, create an inbound wholesale lead or flagged prospect.  
5. Do not automatically convert a prospect into an active account.  
6. Create a CRM activity noting the submission.  
7. Notify the appropriate internal user.  
8. Send the buyer a confirmation containing their request number and submitted items.  
9. Prevent duplicate submissions caused by refreshes or repeated clicks.  
10. Record the source as `old-guys-rule-wholesale`.

Preserve the territory definitions and account classifications already used by the CRM.

Suggested order-request statuses:

type WholesaleOrderRequestStatus \=  
  | "submitted"  
  | "reviewing"  
  | "buyer\_contacted"  
  | "quoted"  
  | "approved"  
  | "sent\_to\_ogr"  
  | "accepted\_by\_ogr"  
  | "declined"  
  | "cancelled";

Do not classify a submitted request as booked revenue. Revenue becomes booked only under the CRM’s existing accepted-order rule.

## **Backend publishing controls**

In the authenticated catalog editor, provide controls for:

* Publicly published  
* Featured  
* Public sort order  
* Primary image  
* Alternate images  
* Product slug  
* Public description  
* Category  
* Themes  
* Pricing fields  
* Sizes  
* Minimum order quantity  
* Product status  
* Preview public page  
* Copy public link

The public preview should use the same component and data transformation as the production public page.

Maintain an audit trail for material pricing and publishing changes if the existing application supports audit history.

## **Data access and security**

Public visitors must receive only explicitly approved public product fields.

Do not expose:

* Product acquisition cost  
* Internal contribution margin  
* Commission data  
* Supplier costs  
* Internal landed-cost calculations beyond the approved buyer estimate  
* Internal notes  
* AI qualification notes  
* Prospect scores  
* Buyer contact data  
* CRM activity  
* Private account pricing  
* Draft or archived products  
* Database service credentials

Use server-side queries or a restricted public view/RPC with appropriate row-level security.

Do not solve public access by weakening security on the existing internal product table.

If a public database view is appropriate, create something equivalent to:

public\_old\_guys\_rule\_products

It should contain only approved fields and only publicly published records.

Order-request submission must use a restricted server endpoint with validation, rate limiting, honeypot protection and clear error handling.

## **Visual direction**

Reuse the existing Justin Fassio homepage design system:

* Existing typography  
* Existing cream and earth-tone palette  
* Existing orange accent  
* Existing border radii  
* Existing button styles  
* Existing spacing scale  
* Existing navigation and footer

The catalog should feel like the public buyer-facing side of the Rep Command Center without looking like an internal CRM table.

Use product photography as the dominant visual element.

Avoid:

* Spreadsheet-style presentation  
* Six-button action toolbars  
* Internal CRM badges  
* Dense planning columns  
* Tiny product images  
* Generic ecommerce templates  
* Unnecessary animation  
* A floating action button over the product grid

## **Responsive behavior**

Desktop:

* Three or four product cards per row, depending on available width  
* Sticky or easily accessible filters  
* Persistent order-summary access

Tablet:

* Two or three product cards per row  
* Collapsible filters

Mobile:

* One or two cards per row based on readability  
* Filter drawer  
* Bottom “View Order” bar only when the order contains items  
* Touch targets of at least 44×44 pixels  
* No horizontal page scrolling

## **Accessibility**

Meet WCAG 2.1 AA expectations:

* Keyboard-operable gallery, filters, dialogs and order controls  
* Visible focus states  
* Semantic headings  
* Proper form labels  
* Descriptive image alt text  
* Sufficient contrast  
* Screen-reader announcements when an item is added or removed  
* Escape closes dialogs  
* Focus returns to the originating card after a dialog closes  
* Respect reduced-motion preferences

## **SEO and sharing**

Add:

* Unique page title  
* Meta description  
* Canonical URL  
* Open Graph metadata  
* Social preview image  
* Product structured data where accurate  
* Collection structured data where appropriate  
* XML sitemap inclusion  
* Robots indexing for published pages only

Suggested collection title:

`Old Guys Rule Wholesale Canada | Justin Fassio`

Suggested description:

`Browse the Old Guys Rule men’s lifestyle apparel collection for Canadian gift, resort, outdoor, golf, marine and specialty retailers.`

Do not index unpublished preview URLs.

## **Analytics**

Use the project’s existing analytics system. If none exists, create an adapter rather than scattering provider-specific calls through components.

Track:

* `wholesale_collection_viewed`  
* `wholesale_product_viewed`  
* `wholesale_search_used`  
* `wholesale_filter_applied`  
* `wholesale_item_added`  
* `wholesale_item_removed`  
* `wholesale_order_started`  
* `wholesale_order_submitted`  
* `wholesale_contact_requested`  
* `wholesale_submission_failed`

Include product ID, SKU, category and referral source where appropriate. Never send personal buyer information to analytics.

## **Error and empty states**

Provide useful states for:

* No published products  
* No filter results  
* Image unavailable  
* Product removed after being added  
* Price changed since draft was saved  
* Minimum order not reached  
* Network failure  
* Order submission failure  
* Successful submission

Do not expose raw database or API error messages publicly.

## **Testing**

Add tests appropriate to the existing stack.

At minimum verify:

1. Only published Old Guys Rule products appear publicly.  
2. Internal fields never appear in public responses.  
3. Search and combined filters work.  
4. Filter state survives refresh.  
5. Product slugs resolve correctly.  
6. Unknown slugs return a proper 404\.  
7. Product image fallback works.  
8. Order totals and unit totals are correct.  
9. Minimum-order validation works.  
10. Quantity-by-size calculations work.  
11. Duplicate submissions are prevented.  
12. A submission creates the correct CRM records.  
13. Existing retailers are not duplicated.  
14. New inquiries are not incorrectly marked as active accounts.  
15. Keyboard navigation works.  
16. Mobile layouts do not overflow horizontally.  
17. Homepage “View Line” points to the new internal route.  
18. Existing authenticated Rep Command Center behavior remains unchanged.

## **Performance targets**

Aim for:

* Lighthouse performance score of at least 90 on the collection page  
* No layout shift caused by images  
* Responsive images using `srcset` or the framework’s image support  
* Lazy loading below the fold  
* Minimal client-side JavaScript  
* Server-rendered initial product content where supported  
* Pagination or incremental loading if publishing the full collection at once harms performance

Do not download and bundle hundreds of full-resolution images into the application build.

## **MVP scope**

Implement now:

* Public collection route  
* Shareable product routes  
* Search and core filters  
* Product cards  
* Product image gallery  
* Wholesale pricing presentation  
* Order-request builder  
* Buyer form  
* CRM submission  
* Homepage link  
* Publishing controls  
* Responsive and accessible states  
* Tests

Defer unless the repository already supports them cleanly:

* Online payment  
* Customer accounts  
* Live supplier inventory  
* Automatic freight quotations  
* Automatic duty calculations  
* Retailer-specific price lists  
* Saved cloud carts  
* Repeat-order portal  
* PDF line-sheet generation

Structure the implementation so these can be added later without rebuilding the public catalog.

## **Required delivery report**

After implementation, provide:

1. Summary of the buyer experience.  
2. Files and routes created or modified.  
3. Database migrations.  
4. Security and RLS changes.  
5. CRM workflow created.  
6. Tests added and their results.  
7. Screenshots at desktop and mobile sizes.  
8. Any catalog records withheld because of missing images or required data.  
9. Remaining assumptions or decisions requiring confirmation.  
10. Exact local and production verification steps.

Do not report the work as complete until:

* The homepage link works.  
* The public catalog is usable without authentication.  
* Private CRM data remains protected.  
* A buyer can build and submit a valid order request.  
* The submission appears correctly in the authenticated CRM.  
* Desktop and mobile layouts have been visually tested.

## Messaging & Calendar transports

Staff messaging and scheduling use **separate transports**. Do not collapse them into one inbox model.

| Surface | Transport | CRM storage |
| --- | --- | --- |
| Messages → **Email (Gmail)** | Google Gmail API (source of truth) | `google_account_connections` + `gmail_thread_links` metadata only |
| Messages → wholesale / live chat | Existing `message_threads` | Unchanged Message Center model |
| **Email Product (OGR)** / order mail | Resend | Unchanged Resend send paths |
| **Calendar** tab + drawer meetings | Google Calendar API (source of truth) | `calendar_event_links` association + cache only |

Google remains authoritative for mailbox and calendar content. CRM stores encrypted refresh tokens server-side and confirmed link metadata (subject/snippet/title/times)—never a full Gmail or Calendar mirror.

Full design, phases A–G, security, and smoke checklist: [`google-workspace-messages-calendar-roadmap.md`](../google-workspace-messages-calendar-roadmap.md).

**Support:** If Google revokes the refresh token, staff see a reconnect CTA on Email and Calendar. Prefer **Reconnect**; if that fails, **Disconnect** then connect again.

