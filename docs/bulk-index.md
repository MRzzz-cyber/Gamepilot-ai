# GamePilot bulk marketplace index (P0)

The previous one-Brave-call-per-search design cannot discover a marketplace-scale inventory. This branch introduces a **persistent D1 product index**. Search queries D1 before paid Brave, and the count is the number of imported, de-duplicated listings (not live inventory).

## Cloudflare setup (required; not automatically provisioned)

1. Run `npx wrangler d1 create gamepilot-products` and copy the database ID.
2. Add the D1 binding to `wrangler.jsonc`: `"d1_databases":[{"binding":"PRODUCTS_DB","database_name":"gamepilot-products","database_id":"<YOUR_DB_ID>"}]`.
3. Run `npx wrangler d1 migrations apply gamepilot-products --remote`.
4. Set `INGEST_SECRET` as a Worker secret (strong random value); **never** put it in GitHub or the frontend.
5. Deploy Worker, then check `GET /api/index/stats?game=三角洲行动&max_price=500`.
6. Import *permitted, verified source data* in batches of <=500 via `POST /api/index/import` with `Authorization: Bearer <INGEST_SECRET>` and body `{"items":[{"game":"三角洲行动","category":"游戏账号","title":"...","price":499,"url":"https://www.dd373.com/goods-123.html"}]}`.

**Important:** This commit does not magically import 20,000 listings. A compliant, paginated source collector must be connected, and its category mapping and item-price association must be verified before any volume claim. Never use search snippets or a category total as proof of 20,000 valid accounts. Respect site access controls and rate limits.

### Safety and accuracy
- Import requires a secret; accepts <=500 items, rejects unsupported hosts, invalid prices and known non-account categories.
- D1 results are labelled **historical listing price, not verified in-stock**.
- A count of 0 means **0 imported records**, not **0 listings on the market**.
- The original live discovery remains a fallback when D1 is not configured.

## Zero-Brave collector (new)
Set Worker variable `LISTING_SOURCES_JSON` to an array of **verified, permitted public listing URLs**, e.g. `[{"name":"approved-delta-account-pages","pages":["https://www.dd373.com/REPLACE_WITH_VERIFIED_ACCOUNT_LISTING_PAGE"]}]`. Do not use this placeholder literally.

With `INGEST_SECRET` set, call `POST /api/index/collect` with `Authorization: Bearer <secret>` and `{"max_pages":2,"dry_run":true}` first; review `source_results[].parsed` and errors. Then run with `dry_run:false`. Max 3 sources x 5 pages per run, 8s timeout per page, stops at access challenges. Brave and LLM calls: **zero**.

The initial collector **only accepts Product JSON-LD nodes** with the same-node URL, name and price, and a title identifying a Delta Force account. Many marketplace category pages do not expose this markup, so `parsed:0` is expected until a verified platform-specific HTML/JSON adapter is added. No attempt is made to bypass anti-bot or authentication.

This is a low-cost indexing foundation, **not** evidence that 1,000 or 20,000 live accounts have been indexed. Schedule only after source validation, and only if permitted by the site.

## Verified limitations as of 2026-11-23
- PZDS public category: \`https://www.pzds.com/goodsList/391/6\` responds with 10 priced SSR cards. Normal browser navigation can load a different set, but server-side HTML keeps a page marker of 1 even when requesting \`?page=2\`. **Do not call these URLs confirmed pagination**. Exported data is a de-duplicated collection of public snapshots, not a complete inventory crawl.
- DD373's public account category is visible in normal browsing, but GitHub Actions direct HTTP receives a WAF challenge. Do not bypass it.
- Production D1 binding and ingestion secret have not been provisioned; no claim of production indexed inventory.
- A successful GitHub export is separate from a successful Cloudflare deployment. Do not merge the experimental index PR over newer changes on main without reconciliation.
