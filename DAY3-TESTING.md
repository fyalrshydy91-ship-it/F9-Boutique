# F9 Boutique — Day 3

The existing storefront, editorial images, shopping demo, and bilingual branding are preserved. Open **Companion** in the masthead (or **Shopping Companion** in the mobile menu) for the new features.

## Public API

- Provider: [ExchangeRate-API free open-access endpoint](https://www.exchangerate-api.com/docs/free).
- Server fetches `https://open.er-api.com/v6/latest/KWD`.
- Frontend calls the project's `GET /api/exchange-rates`, never the provider directly.
- Nine supported currencies: KWD, USD, EUR, GBP, SAR, AED, QAR, BHD, OMR.
- Daily reference rates include the provider's latest update time and next expected update. Server caching lasts 15 minutes; refreshing checks this server cache rather than promising a new provider publication.
- Conversion: `amount / rate[from] * rate[to]`. Rates are indicative, exclude fees, and do not change boutique prices.
- The provider is credited with a visible source link.

## OpenRouter

- Add your own `OPENROUTER_API_KEY` using Replit Secrets. Never enter it in chat, source code, or a frontend `VITE_*` variable.
- The frontend sends a bounded conversation and its language to `POST /api/stylist`.
- Only the server reads the key and calls `https://openrouter.ai/api/v1/chat/completions`, using `openai/gpt-4o-mini`.
- The server independently fetches trusted exchange rates and adds them to the system prompt. A client cannot supply trusted rate data.
- If the currency service fails, styling can continue without rates; the prompt explicitly prohibits inventing rates.
- The system prompt focuses on abayas and women's clothing. It does not claim real inventory, purchases, or order support.
- Messages remain in browser memory, not the app database or localStorage. Questions and recent conversation are sent to OpenRouter, as disclosed in the interface.
- Missing/invalid keys, insufficient credits, rate limits, bad provider responses and network timeouts have friendly errors. Failed questions can be retried without duplicating messages.
- The backend has input bounds, a 25-second provider timeout, a 32 KB request-body limit, and an eight-per-minute connection-address request limit. This in-memory quota is per server instance, not a distributed production abuse-control system. Configure a spending limit in your OpenRouter account before public use.

## Automated verification

From the workspace root:

```sh
node --test artifacts/api-server/tests/f9-services.test.mjs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/f9-boutique run typecheck
PORT=25340 BASE_PATH=/ pnpm --filter @workspace/f9-boutique run build
```

The backend tests simulate provider responses to test conversion math, validated/cached rates, invalid input, missing keys, network failures, malformed payloads, HTTP 401/402/429/500, rate context in the AI prompt, and the local quota. These tests do **not** prove a real OpenRouter key works.

## Manual class demonstration

1. Open **Companion**. Confirm that the latest available rates, source, and update timestamps are visible.
2. Enter `10`, choose KWD → USD, and confirm the result equals ten times the USD rate. Choose another pair and use Swap.
3. Clear the amount or enter a negative amount. An informative validation message should replace the estimate.
4. Refresh rates. A loading indicator should appear and repeated refresh actions should be unavailable during loading.
5. With the secret configured, ask: “Suggest an elegant abaya for a daytime gathering.” Verify a real AI reply appears.
6. Ask: “Explain today's exchange rates and convert 50 KWD to USD.” Compare its calculation to the visible table. AI answers may still need review.
7. While a reply is pending, the send controls should be disabled. Try a follow-up to verify conversation context.
8. Switch to Arabic. Confirm RTL layout, translated controls and Arabic AI replies.
9. Use a phone-sized viewport. Confirm the converter, chat, navigation and buttons remain usable without sideways scrolling.
10. In browser developer tools, go offline and refresh rates. Confirm an error and retry control instead of a fabricated result. Go online and retry.
11. Use the automated tests above for HTTP 429 and missing-key failures instead of deliberately exhausting paid provider limits.
12. Go back to the storefront and confirm product pages, favorites, and the demo bag remain available.

## Publishing

Publishing is a user action in Replit; editing and building do not update the public app automatically.

1. Save `OPENROUTER_API_KEY` securely and make sure it is included in the production deployment's secrets.
2. Use **Publish / Republish**. This project already has a static web frontend and a running API service configured for an Autoscale deployment.
3. Open the published URL from the Publishing panel.
4. Repeat a currency conversion and a genuine AI question on the public app, not just Preview.
5. Confirm `/api/healthz` returns success and `/api/exchange-rates` returns JSON on that same public domain.

Do not consider the AI requirement fully verified until a genuine response succeeds with the configured secret. Do not consider the update published until the new deployment completes.
