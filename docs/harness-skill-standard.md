# GamePilot Progressive Search Harness — Skill 与证据标准（V1）

## 当前已运行的真实流程

```
用户自然语言
  → requirements-parsing（确定性游戏、预算、平台、偏好解析）
  → marketplace-discovery（公开商品分类、Brave 索引、Browser Run）
  → detail-verification（HTTP 获取、按需浏览器渲染、逐商品详情提取）
  → evidence-filtering（游戏身份、预算、区服、已售和价格证据硬过滤）
  → preference-ranking（仅在符合硬约束的候选中评分排序）
  → 可推荐商品 / 价格待核验线索 / 已排除线索
```

### Harness vs Skill vs Tool

- **Harness**：代码确定性调度器，实际逻辑在 `worker/index.js` 的 `agentSearchListings` 与 `discover`。组织检索轮次、回退、限制请求、状态与 Trace。
- **Skill**：某一步能力的输入输出/触发条件/边界契约。现在新增的五个 `skills/*/SKILL.md` 遵循 [Agent Skills 公开规范](https://agentskills.io/specification)，但**当前 Worker 并未动态加载 SKILL.md，也没有让模型自由选择或运行这些 Skill**；真正执行的是对应的 JavaScript。
- **Tool/Adapter**：实际外部调用，如 Brave Search、平台公开 HTML、Cloudflare Browser Run 与 `/api/verify-lead`。工具的完成状态不等于购买可用。
- **Policy/Evidence Gate**：游戏身份、价格、预算、明确区服是硬条件；皮肤越多、装备越好等是软偏好。算法可检查，但不能捏造源站数据。
- **LLM**：OpenRouter 可选用于搜索后的解释与分析，不负责伪造商品来源或替代硬条件判断。

### 输入输出契约（简化）

```json
{
  "search": {"game": "王者荣耀", "max_price": 1000, "server": "苹果区", "preferences": ["皮肤越多越好"]},
  "lead": {"platform": "盼之账号", "url": "https://...", "product_id": "C8EDYT"},
  "evidence": {"price": 899, "price_source": "detail_visible_header", "server": "苹果QQ", "skins": 306, "heroes": 128, "checked_at": "ISO timestamp"},
  "result": {"match": true, "status": "unverified_stock", "reason": "价格有证据，但在售状态尚需源站确认"}
}
```

## 规范要点

使用标准 Agent Skills 目录格式：
```
skills/
  requirements-parsing/SKILL.md
  marketplace-discovery/SKILL.md
  detail-verification/SKILL.md
  evidence-filtering/SKILL.md
  preference-ranking/SKILL.md
```

每个文件从 YAML frontmatter 开始，`name` 匹配目录名，`description` 写明能力与触发条件。未来如接入 Skill Loader，再实现 metadata discovery → activation → loading of instructions and resources。目前仅为可审查的标准化契约，不应在 UI 中声称模型已加载或选择了这些文件。

### 产品搜索的强制不变量

1. **数据来源**：不将搜索引擎索引视为当前在售库存，也不把优惠券当商品价格。
2. **价格信心**：区别详情抓取价、搜索索引参考价、未知；`null` 不能变成 0。
3. **区服**：`苹果区` 仅表达 iOS，不能默认为苹果QQ；QQ 和微信是另一维度。
4. **账号属性**：皮肤、英雄、段位、实名来自可归因于本商品的详情，不能从相邻商品推荐推断。
5. **可追溯性**：保留原始商品链接、采集时间、抓取手段、HTTP 错误与 Browser Run 步骤。
6. **完整漏斗**：每一条线索只能归入可推荐/待核价/排除之一；数量必须对账。
7. **失败语义**：`no_matches`、`no_price_evidence`、`source_blocked` 与真正平台无库存是不同概念。

## 仍需改善的部分

- 自动详情核验有每轮 15 条的限制，更多链接显示为「尚未读取」；现在可由用户单独点击「读取商品详情」进行按需核验。
- G买卖 H5 和 5173 可受 JavaScript 动态渲染与访问限制影响，Browser Run 是**公开数据回退**，不是绕过访问控制的手段。
- 真实线上源站抓取、首页到详情的商品数量完整性和 Cloudflare 最新部署状态，需要线上独立验收；模拟单元测试不能证明实时库存或价格。
