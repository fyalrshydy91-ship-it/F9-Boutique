# F9 Boutique catalog

Supabase is the source of truth for products and boutiques. The existing Replit database is not replaced or migrated.

## Connection

The backend reads shared environment variables:

- `SUPABASE_URL`: Supabase project's API URL.
- `SUPABASE_PUBLISHABLE_KEY`: enabled **publishable** key (safe for public use, unlike an admin/service-role key).

No admin/service-role key is required or used. Frontend requests use the project's `/api/catalog` endpoint. Catalog data is validated against the generated OpenAPI schema before it reaches the UI. There is no static demo-catalog fallback on failures.

## Tables and access

`public.boutiques` contains the English/Arabic boutique names and editorial copy. `public.products` references its boutique through `brand`.

Both tables have Row Level Security enabled. `anon` and `authenticated` have SELECT-only grants and read-only policies. Visitors cannot insert, modify, or delete the catalog. Use the Supabase dashboard's Table Editor to manage it; no admin editor is included in F9.

The migration is in `migrations/20261107_f9_catalog.sql`. `seed.sql` contains the original approved six products and three boutiques. IDs were preserved so existing local bags and favorites still match. Re-running the seed does not overwrite edited records.

## Editing catalog data

- Prices are in **KWD**, with up to three decimal places.
- Preserve IDs when editing existing records. New records can use the generated identity ID.
- Each product must reference an existing boutique.
- `category` is `abayas` or `women`.
- `sizes` is a nonempty text array, such as `["S", "M", "L"]`.
- `colors` is a nonempty JSON array of triples: `[["Onyx", "أسود", "#292523"]]`.
- `image` is the local image filename suffix, for example `silk` maps to `public/images/f9-silk.jpg`. Adding image uploads/storage is not included in this connection.
- `fresh` marks new arrivals; `best` marks featured/bestselling pieces.
- The app refetches on window focus and every 60 seconds. Reloading fetches the current catalog immediately.

Accounts, bag, favorites, demo checkout, and AI conversation storage were not migrated to Supabase. Bag and favorites remain browser-local. If a saved product is removed from the catalog, its bag entry remains visible as unavailable until the user removes it.

## Verification

```sh
node --test artifacts/api-server/tests/catalog.test.mjs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/f9-boutique run typecheck
PORT=25340 BASE_PATH=/ pnpm --filter @workspace/f9-boutique run build
```

On Preview, `GET /api/catalog` should return six products and three boutiques initially. If the connection fails, the UI shows a retry message rather than claiming demo data is live.

Republish to update the public app, including both Supabase environment variables in production. This repository's migration/seed are applied to the connected Supabase project, not to Replit's database or via automatic deployment migrations.
