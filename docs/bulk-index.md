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
