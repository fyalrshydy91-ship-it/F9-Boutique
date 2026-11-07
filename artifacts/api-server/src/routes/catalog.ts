import { Router, type IRouter } from "express";
import { GetCatalogResponse } from "@workspace/api-zod";

class CatalogError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Use only Supabase's public/publishable credential. Row-level security and
// SELECT-only grants apply to this connection; no admin credential is needed.
async function readTable(table: "products" | "boutiques"): Promise<unknown[]> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new CatalogError(503, "The catalog connection needs to be configured. Please contact the site owner.");
  const all: unknown[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const url = new URL(`/rest/v1/${table}`, base);
    url.search = new URLSearchParams({ select: "*", order: "id.asc", limit: "500", offset: String(offset) }).toString();
    let response: Response;
    try { response = await fetch(url, { headers: { apikey: key }, signal: AbortSignal.timeout(10000) }); }
    catch { throw new CatalogError(504, "The catalog could not be reached. Please try again."); }
    if (response.status === 429) throw new CatalogError(429, "The catalog is busy. Please wait a moment and try again.");
    if (!response.ok) throw new CatalogError(502, "The catalog is temporarily unavailable. Please try again shortly.");
    let rows: unknown;
    try { rows = await response.json(); } catch { throw new CatalogError(502, "The catalog returned an unreadable response. Please try again."); }
    if (!Array.isArray(rows)) throw new CatalogError(502, "The catalog returned an invalid response. Please try again.");
    all.push(...rows);
    if (rows.length < 500) return all;
  }
  throw new CatalogError(502, "The catalog is too large to load. Please contact the site owner.");
}

const router: IRouter = Router();
router.get("/catalog", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [products, boutiques] = await Promise.all([readTable("products"), readTable("boutiques")]);
    const result = GetCatalogResponse.safeParse({ products, boutiques });
    if (!result.success || result.data.products.some(product => !result.data.boutiques.some(b => b.id === product.brand))) {
      throw new CatalogError(502, "Some catalog information is incomplete. Please try again or contact the site owner.");
    }
    res.json(result.data);
  } catch (error) {
    const problem = error instanceof CatalogError ? error : new CatalogError(500, "The catalog could not be loaded. Please try again.");
    if (problem.status === 429) res.setHeader("Retry-After", "60");
    res.status(problem.status).json({ error: problem.message, code: "CATALOG_UNAVAILABLE" });
  }
});
export default router;
