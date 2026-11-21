# GamePilot AI

Interview demo for a game-asset AI assistant, built with React, Cloudflare Workers, and OpenRouter.

## Features

- Natural-language game asset search via tool calling
- Mock account valuation using deterministic coefficients
- Game asset risk flag lookup
- Tool invocation trace, latency and token usage display

All inventory and valuations are **mock data**. No real funds, checkout, or game accounts are involved.

## Local development

```bash
npm install
npx wrangler secret put OPENROUTER_API_KEY
npm run build
npx wrangler dev
```

Open http://localhost:8787. Run `npm run dev` in a separate terminal for Vite UI development; the Vite dev server proxies /api to wrangler dev.

## Deploy to Cloudflare

```bash
npm install
npx wrangler login
npx wrangler secret put OPENROUTER_API_KEY
npm run deploy
```

For model selection, configure a Worker text variable `OPENROUTER_MODEL` (default: `openai/gpt-4o-mini`). Keep the secret key in Cloudflare Secrets, **never in GitHub**.

## Architecture

- `src/main.jsx`: React frontend and live agent trace
- `src/style.css`: responsive interface
- `worker/index.js`: OpenRouter tool-call loop, mock inventory & deterministic tools
- `wrangler.jsonc`: Worker config with static assets

## Demo prompts

- 推荐1000元以内、限定皮肤较多的王者荣耀账号
- 估算一个120英雄、80皮肤、5个限定皮肤的账号
- 检查 GP-101 的交易风险

## Safety & limitations

This is an interview demonstration using fabricated game asset examples and fixed-coefficient estimates. It does not verify title, guarantee transaction safety, quote real market prices, or execute orders. To ship commercially, add authentication, rate limiting, data rights/compliance review, real trade records and provenance verification.
