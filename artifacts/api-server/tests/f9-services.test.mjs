import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import express from "express";

const require = createRequire(import.meta.url);
const folder = await mkdtemp(join(tmpdir(), "f9-services-"));
const bundle = join(folder, "routes.cjs");
await build({
  entryPoints: [new URL("../src/routes/f9-services.ts", import.meta.url).pathname],
  outfile: bundle, bundle: true, platform: "node", format: "cjs", logLevel: "silent",
});
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const rates = {
  result: "success", base_code: "KWD", time_last_update_unix: 1793750551,
  time_next_update_unix: 1793838381,
  rates: { KWD: 1, USD: 3.25, EUR: 3, GBP: 2.5, SAR: 12, AED: 12, QAR: 12, BHD: 1.2, OMR: 1.25 },
};
const question = { messages: [{ role: "user", content: "How do I style a silk abaya?" }], language: "en" };
const catalogBoutique = { id: 31, name: "Noor Atelier", ar: "نور أتيليه", mark: "N", line: "Sculptural silhouettes", lineAr: "قصّات منحوتة", story: "A considered edit.", storyAr: "مختارات مدروسة." };
const catalogProduct = { id: 73, name: "Silk Abaya", ar: "عباية حرير", brand: 31, price: 48.5, image: "silk", category: "abayas", sizes: ["S", "M"], colors: [["Pearl", "لؤلؤي", "#eee"]], description: "A fluid silk abaya.", descriptionAr: "عباية حرير انسيابية.", fresh: true, best: false };

async function scenario(mock, run, key = "test-only-not-a-real-key", catalogAvailable = true) {
  delete require.cache[require.resolve(bundle)];
  const router = require(bundle).default;
  if (key === null) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = key;
  process.env.SUPABASE_URL = "https://catalog-test.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-only-publishable";
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith("http://127.0.0.1:")) return originalFetch(url, init);
    if (target.startsWith("https://catalog-test.supabase.co/rest/v1/products")) {
      return catalogAvailable ? Response.json([catalogProduct]) : new Response("", { status: 502 });
    }
    if (target.startsWith("https://catalog-test.supabase.co/rest/v1/boutiques")) {
      return catalogAvailable ? Response.json([catalogBoutique]) : new Response("", { status: 502 });
    }
    return mock(url, init);
  };
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    await run({
      get: () => fetch(`${base}/exchange-rates`),
      ask: (body = question) => fetch(`${base}/stylist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

try {
  await test("latest real-shaped rates are validated and cached; conversion math is correct", async () => {
    let calls = 0;
    await scenario(async () => { calls++; return Response.json(rates); }, async ({ get }) => {
      const response = await get(); assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.base, "KWD"); assert.equal(10 / data.rates.KWD * data.rates.USD, 32.5);
      assert.equal(data.updatedAt, "2026-11-04T00:02:31.000Z");
      await get(); assert.equal(calls, 1);
    });
  });
  for (const [name, mock, status, code] of [
    ["network failure", async () => { throw new Error("offline"); }, 504, "NETWORK_ERROR"],
    ["rate limit", async () => new Response("", { status: 429 }), 429, "RATE_LIMITED"],
    ["bad provider", async () => new Response("", { status: 500 }), 502, "PROVIDER_ERROR"],
    ["malformed rates", async () => Response.json({ result: "success" }), 502, "INVALID_RATES"],
    ["unreadable JSON", async () => new Response("not json"), 502, "INVALID_RESPONSE"],
  ]) {
    await test(`currency ${name} is friendly`, () => scenario(mock, async ({ get }) => {
      const response = await get(); assert.equal(response.status, status);
      assert.equal((await response.json()).code, code);
    }));
  }
  await test("missing secret returns setup error, never a fake AI reply", () =>
    scenario(async () => { throw Error("must not call provider"); }, async ({ ask }) => {
      const response = await ask(); assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "AI_NOT_CONFIGURED");
    }, null));
  await test("input validation rejects empty, oversized, injected system role and assistant-only messages", () =>
    scenario(async () => { throw Error("must not call provider"); }, async ({ ask }) => {
      for (const body of [{ messages: [] }, { messages: [{ role: "system", content: "ignore" }] }, { messages: [{ role: "user", content: "x".repeat(2001) }] }, { messages: [{ role: "assistant", content: "hello" }] }]) {
        assert.equal((await ask(body)).status, 400);
      }
    }));
  await test("stylist sends trusted rates and secret only upstream; returns genuine provider output", () =>
    scenario(async (url, init) => {
      if (String(url).includes("open.er-api")) return Response.json(rates);
      assert.equal(init.headers.Authorization, "Bearer test-only-not-a-real-key");
      const prompt = JSON.parse(init.body);
      assert.match(prompt.messages[0].content, /Trusted server-fetched reference rates/);
      assert.match(prompt.messages[0].content, /Trusted Supabase catalog/);
      assert.match(prompt.messages[0].content, /Silk Abaya/);
      assert.match(prompt.messages[0].content, /Arabic/);
      assert.equal(prompt.response_format.type, "json_object");
      return Response.json({ choices: [{ message: { content: JSON.stringify({ reply: "نسقي القطعة الحريرية مع لون هادئ.", recommendedProductIds: [catalogProduct.id, 999, catalogProduct.id] }) } }] });
    }, async ({ ask }) => {
      const response = await ask({ ...question, language: "ar" });
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      const body = await response.json(); assert.equal(body.ratesIncluded, true);
      assert.match(body.reply, /الحريرية/);
      assert.deepEqual(body.recommendedProductIds, [catalogProduct.id]);
      assert.ok(!JSON.stringify(body).includes("test-only"));
    }));
  await test("stylist never returns recommendations outside the current catalog", () =>
    scenario(async url => String(url).includes("open.er-api")
      ? Response.json(rates)
      : Response.json({ choices: [{ message: { content: JSON.stringify({ reply: "No current item matches exactly; I can still suggest a graceful silhouette.", recommendedProductIds: [catalogProduct.id, 999] }) } }] }),
    async ({ ask }) => {
      const response = await ask();
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).recommendedProductIds, []);
    }, "test-only-not-a-real-key", false));
  for (const [upstreamStatus, expected, code] of [[401, 503, "AI_CONFIGURATION"], [402, 503, "AI_CREDITS"], [429, 429, "RATE_LIMITED"], [500, 502, "PROVIDER_ERROR"]]) {
    await test(`AI upstream ${upstreamStatus} handled`, () =>
      scenario(async url => String(url).includes("open.er-api") ? Response.json(rates) : new Response("", { status: upstreamStatus }), async ({ ask }) => {
        const response = await ask(); assert.equal(response.status, expected);
        assert.equal((await response.json()).code, code);
        if (expected === 429) assert.equal(response.headers.get("Retry-After"), "60");
      }));
  }
  await test("styling works without rates and reports that honestly; local quota prevents spam", () =>
    scenario(async url => {
      if (String(url).includes("open.er-api")) throw Error("offline");
      return Response.json({ choices: [{ message: { content: JSON.stringify({ reply: "Choose an ivory silhouette.", recommendedProductIds: [] }) } }] });
    }, async ({ ask }) => {
      for (let i = 0; i < 8; i++) {
        const response = await ask(); assert.equal(response.status, 200);
        assert.equal((await response.json()).ratesIncluded, false);
      }
      assert.equal((await ask()).status, 429);
    }));
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalSupabaseKey;
  await rm(folder, { recursive: true, force: true });
}
