# GamePilot 真实交易平台接入方案（5173 + G买卖）

状态：P0 URL/价格修复已进入主分支；平台级实时库存采集与端到端验收未完成。

## 已核实的源站结构（2026-11-23）
- 5173 首页明确为「帐号交易」指向 `shop.5173.com`，旧搜索入口在 `s.5173.com`，不能只搜索根域 `5173.com`。
- G买卖至少存在两类详情：`/dy/<category>/detail_<id>.shtml`；`/h5/goods/detail/index.html?book_id=<id>&game_id=<id>&goods_type=<id>`。
- G买卖 H5 价格可能出现在「¥280.00 库存 1 账号」中；优惠券金额可能位于售价之前。不要使用网页出现的第一个货币数字。
- G买卖游戏范围以其目录为准，不能假定任意游戏都在该平台售卖。
- 5173 账号页面目前需要进一步通过真实浏览器确认商品列表 API、详情 URL 和库存字段；不得依据猜测虚构 endpoints。

来源：
- https://5173.com/
- https://s.5173.com/
- https://www.gmmsj.com/dy/78_zh.shtml
- https://www.gmmsj.com/h5/goods/detail/index.html?book_id=00005000000015363821794470004765&from=pc&game_id=5&goods_type=10
- https://developers.cloudflare.com/browser-run/get-started/
- https://developers.cloudflare.com/browser-run/playwright/

## 目标架构

```
UserIntent(game, max_price, preferences)
  -> Platform capability registry / dynamic game directory
  -> 5173Adapter / GMmsjAdapter / PzdsAdapter (parallel, independent)
       - discoverCategory(game)
       - listProducts(category, page)
       - parseDetailUrl(listing)
       - verifyProduct(detailUrl)
       - classifyStatus()
  -> dedupeByPlatformAndProductId
  -> price/identity/budget/evidence gates
  -> pricedCards + unpricedLeads + excludedLeads
  -> per-source trace
```

每个平台 adapter 固定，游戏名称始终是输入参数。游戏目录动态解析并缓存，不再按游戏写死数据源。

## 平台适配器契约

```ts
interface MarketplaceAdapter {
  name: string;
  supportsGame(game: string): Promise<{supported: boolean; categoryUrl?: string; reason?: string}>;
  search(game: string, opts: {page: number; maxPrice?: number}): Promise<Lead[]>;
  detail(url: string): Promise<ProductEvidence>;
}
type Lead = {platform: string; game: string | null; title: string;
  url: string; id: string; discoveredAt: string; price?: number | null};
type ProductEvidence = {game: string | null; price: number | null; currency: 'CNY' | null;
  priceSource: 'detail' | 'listing' | 'search_index' | 'unknown';
  fetchedAt: string; status: 'listed'|'sold'|'stale'|'unverified';
  httpStatus?: number; error?: string; evidenceSnippet?: string};
```

不把未验证价格放入已验证商品卡片；搜索结果索引价标明非实时；详情 403 / 空壳 / 登录页归类为 `detail_blocked` 或 `render_required`，不要当作无库存。

## P0 开发顺序

1. **平台事实收集**。通过 Cloudflare Browser Run/Playwright（有许可时）打开 5173 / G买卖账号列表页，截取页面结构、合法可访问的列表 URL 与请求状态。优先使用公开官方 API 或静态 HTML；JavaScript 页面再使用浏览器渲染。不得绕过验证码、登录墙、站点访问策略。
2. **5173Adapter**。动态查游戏目录 → 账号列表 → 页面分页 → 详情链接 → 标价/库存。适配 shop 和 s 子域，其他页面作为诊断而非商品。
3. **GMmsjAdapter**。动态查游戏分类 / game_id → 列表 → 两种 detail URL → 价格/「游戏名称」/「库存」/售出证据。不要把优惠券金额当售价。
4. **缓存与可靠性**。游戏目录 24h TTL；商品查询短期缓存并标注采集时间；源站返回 403/429 退避，禁止高并发重复抓取。
5. **统一错误原因**。`unsupported_game` / `catalog_not_found` / `list_blocked` / `no_detail_links` / `detail_blocked` / `price_missing` / `identity_unknown` / `no_budget_matches`，可在右侧 Harness 显示。

## 线上验收（必须依赖真实源站，不能只跑模拟测试）

逐个平台使用至少两个其官方目录确实支持的游戏，保存每次实际请求的：分类 URL、列表页 HTTP 状态、发现的真实详情链接、详情页 HTTP 状态、金额的来源片段及库存证据。真实商品 URL 必须可点击，列表参考价与详情价分别记录；同一商品不能重复计数。

**验收门槛**：至少一个平台同时有真实目录搜索、真实详情 URL、可信标价以及明确的错误诊断；然后逐个平台扩展。没有价格的商品保持可点击但不能伪造价格。Cloudflare Pages/Worker 部署 Ready 不等于真实数据链路成功。

## 当前主要阻塞
无法从执行环境直接访问这两个源站的完整动态页面；5173 新版账号详情路由和可调用的官方列表数据入口仍需用 Browser Run 实测。不应在缺少验证时硬编码所谓 API URL。
