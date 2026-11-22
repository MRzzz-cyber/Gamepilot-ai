---
name: marketplace-discovery
description: Discover publicly accessible individual game-account listing URLs across supported marketplaces. Use after extracting a game name and before reading seller detail pages.
---
# Marketplace Discovery

**Input:** `{game, max_price?, region?}`.
**Output:** a deduplicated collection of `{platform, url, product_id, game_evidence, discovery_source}` leads and source-level traces.

1. Search the game's name as a parameter; avoid special code paths per game.
2. Prefer a marketplace's public product directory, then index discovery and permitted Cloudflare Browser Run page rendering.
3. Accept only HTTPS product URLs from an explicit marketplace allowlist.
4. Link count is not confirmed inventory; label all results *leads* until detail verification.
5. Deduplicate by stable platform product ID, not a generic `index.html` basename.
6. Log source failures and unsupported games separately from zero inventory.

Current execution: `discover`, platform adapters and Browser Run in `worker/index.js`.