---
name: preference-ranking
description: Rank eligible game-account listings by user preferences without inventing evidence. Use only after deterministic hard filtering leaves eligible candidates.
---
# Preference Ranking

**Input:** `eligible[]` and soft preferences such as skins, equipment and levels.
**Output:** ordered items with score, supported positive signals and explicitly unknown attributes.

1. Hard conditions (game identity, budget and any explicit server requirement) are never overridden by preference scores.
2. Prefer measured attributes over SEO text. Missing metadata does not get positive credit.
3. Keep the original product link, price evidence level and caveats on every result.
4. If there are no eligible products, report no match rather than a successful ranking.

Current execution: score from `evaluateCandidate` and stable sort within `agentSearchListings` in `worker/index.js`. No autonomous AI ranking agent is claimed.