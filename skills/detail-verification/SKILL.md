---
name: detail-verification
description: Verify an individual game-account listing against its public source page and extract its price, game identity, region and account attributes. Use when candidate evidence is missing or when a user requests a product detail refresh.
---
# Detail Verification

**Input:** `{url, expected_game, budget?, server?}`.
**Output:** `{detail_game, price, price_evidence, price_status, attributes, fetched_at, http_status?, reason?, source_url}`.

1. Only fetch an allowlisted HTTPS marketplace product URL; never follow user-supplied arbitrary hosts.
2. Fetch public HTML first. Invoke Browser Run on supported platforms if JavaScript rendering is required and available.
3. Never bypass login, CAPTCHAs, anti-automation challenges or access restrictions.
4. Extract price only when attributable to the **current product**, not coupons, recommended products or other listings.
5. Read account details from the product page: server, skins, heroes, rank, real-name transfer status, level and other available fields; unknown fields stay unknown.
6. Preserve the original source link and distinguish reference prices from verified live stock.
7. Use limited batch verification; allow explicit on-demand re-verification for a clicked lead.

Current execution: `verifyListing`, `extractListingAttributes`, `browserRenderListing`, and `POST /api/verify-lead` in `worker/index.js`.