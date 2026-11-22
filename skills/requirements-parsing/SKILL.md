---
name: requirements-parsing
description: Parse a user's game-account search request into explicit game, budget, account region and preferences. Use before a marketplace search or when a user changes games or budgets.
---
# Requirements Parsing

**Input:** user utterance plus prior search context.
**Output:** `{game, max_price, server, realname, preferences, version, confidence}`, or one concise clarification question.

1. Explicit new game intent overrides all old-game context. Do not carry old profession, region, budget or products to a newly named game.
2. Extract game without budget or request words. Do not require a per-game source configuration.
3. Treat “苹果区” as an iOS platform constraint; never silently assume QQ rather than 微信. Ask about channel only if the user requires channel-specific accuracy.
4. Keep unknown values `null` or `all`; do not invent account attributes.
5. Record why a clarification is needed; never return old-game products while waiting.

Current execution: deterministic parser in `worker/index.js`; this is a documented Agent Skills contract, not an auto-loaded model tool.