---
name: evidence-filtering
description: Apply deterministic identity, price and region gates to marketplace product evidence. Use after detail verification to distinguish recommended, price-unknown and excluded product leads.
---
# Evidence Filtering

**Input:** parsed requirements plus retrieved listing evidence.
**Output:** three disjoint groups: `eligible`, `price_unknown` and `excluded`, with machine-readable reasons.

1. A recommendation needs game identity evidence and a source-attributed price within budget.
2. An unknown price must **never** be treated as zero or within budget.
3. An explicit region mismatch is a rejection; unknown region is a verification gap, not a positive match.
4. Product leads marked sold, stale or wrong game must never be advertised as purchase-ready.
5. Any strict filter must provide a failure reason; the number of leads must reconcile with all three output groups.
6. A status of “finished” for tool execution does not mean “matched” for hard filters.

Current execution: `evaluateCandidate`, `agentSearchListings` and `harness.filter_gate` in `worker/index.js`.