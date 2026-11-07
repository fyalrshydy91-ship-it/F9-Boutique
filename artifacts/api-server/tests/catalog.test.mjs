import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import express from "express";

const require = createRequire(import.meta.url);
const temp = await mkdtemp(join(tmpdir(), "f9-catalog-"));
const bundle = join(temp, "catalog.cjs");
await build({
  entryPoints: [new URL("../src/routes/catalog.ts", import.meta.url).pathname],
  outfile: bundle, bundle: true, platform: "node", format: "cjs", logLevel: "silent",
});
const router = require(bundle).default;
const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const boutique = { id: 12, name: "Atelier", ar: "أتيليه", mark: "A", line: "", lineAr: "", story: "", storyAr: "" };
const product = { id: 50, name: "Silk Abaya", ar: "عباية حرير", brand: 12, price: 89, image: "silk", category: "abayas", sizes: ["S"], colors: [["Pearl", "لؤلؤي", "#eee"]], description: "", descriptionAr: "", fresh: true, best: false };
const app = express();
app.use("/api", router);
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/api/catalog`;

async function scenario(mock, status, check, configured = true) {
  process.env.SUPABASE_URL = "https://catalog-test.supabase.co";
  if (configured) process.env.SUPABASE_PUBLISHABLE_KEY = "test-only-publishable";
  else delete process.env.SUPABASE_PUBLISHABLE_KEY;
  globalThis.fetch = (url, init) => String(url).startsWith("http://127.0.0.1:")
    ? originalFetch(url, init) : mock(url, init);
  const response = await fetch(endpoint);
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  await check(await response.json(), response);
}

try {
  await test("catalog returns real-shaped data and preserves non-contiguous IDs", () => scenario(
    async (url, init) => {
      assert.equal(init.headers.apikey, "test-only-publishable");
      assert.equal(new URL(url).searchParams.get("order"), "id.asc");
      return Response.json(String(url).includes("/products?") ? [product] : [boutique]);
    }, 200, body => {
      assert.equal(body.products[0].price, 89);
      assert.equal(body.products[0].brand, body.boutiques[0].id);
      assert.equal(body.products[0].colors[0].length, 3);
      assert.ok(!JSON.stringify(body).includes("test-only-publishable"));
    }));
  await test("empty catalog is explicit, not replaced with demo data", () => scenario(
    async () => Response.json([]), 200, body => assert.deepEqual(body, { products: [], boutiques: [] })));
  await test("missing configuration is a friendly 503", () => scenario(
    async () => { throw Error("should not fetch"); }, 503, body => assert.match(body.error, /configured/), false));
  await test("network outage is a friendly 504", () => scenario(
    async () => { throw Error("offline"); }, 504, body => assert.equal(body.code, "CATALOG_UNAVAILABLE")));
  await test("provider 429 is preserved", () => scenario(
    async () => new Response("", { status: 429 }), 429,
    (_body, response) => assert.equal(response.headers.get("Retry-After"), "60")));
  await test("provider errors do not leak details", () => scenario(
    async () => Response.json({ error: "internal credential detail" }, { status: 403 }), 502,
    body => assert.ok(!JSON.stringify(body).includes("credential detail"))));
  await test("invalid colors fail rather than crashing frontend", () => scenario(
    async url => Response.json(String(url).includes("/products?") ? [{ ...product, colors: [[]] }] : [boutique]),
    502, body => assert.match(body.error, /incomplete/)));
  await test("orphaned products fail explicitly", () => scenario(
    async url => Response.json(String(url).includes("/products?") ? [{ ...product, brand: 999 }] : [boutique]),
    502, body => assert.match(body.error, /incomplete/)));
  await test("table reads paginate instead of silently truncating", () => {
    let pages = 0;
    return scenario(async url => {
      if (String(url).includes("/boutiques?")) return Response.json([boutique]);
      pages++;
      return Response.json(new URL(url).searchParams.get("offset") === "0"
        ? Array.from({ length: 500 }, (_, i) => ({ ...product, id: i + 1 })) : [{ ...product, id: 501 }]);
    }, 200, body => { assert.equal(pages, 2); assert.equal(body.products.length, 501); });
  });
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [["SUPABASE_URL", originalUrl], ["SUPABASE_PUBLISHABLE_KEY", originalKey]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
