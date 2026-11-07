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

The authenticated account and favorites connection is described below. The shopping bag, demo checkout, and AI conversation storage were not migrated to Supabase. The shopping bag remains browser-local. If a saved product is removed from the catalog, its bag entry remains visible as unavailable until the user removes it.

## Authentication and account favorites

The account page uses Supabase Auth email/password signup, sign-in, sign-out, email password-reset links, and password updates after a recovery link. Supabase Auth stores salted bcrypt hashes, not plaintext passwords; F9 never writes passwords to its tables or browser storage. The browser uses only the Supabase publishable key. Never add a Supabase `service_role` or `sb_secret_...` key to `VITE_*` environment variables.

Authenticated favorites are rows in `public.favorites`; their composite key is `(user_id, product_id)`. Supabase Auth supplies the signed user ID, and RLS requires `auth.uid() = user_id` for reads, inserts, and deletes. The browser always filters queries by the current account, but RLS is the actual security boundary. Logged-out visitors continue to use browser-local favorites; on sign-in those guest favorites are added to the user's own list. The shopping bag stays local.

### Auth Dashboard settings

- Enable **Email** under **Authentication → Providers**.
- Choose whether email confirmation is required. If enabled, sign-up explains that the user must confirm their address before logging in.
- Configure **Authentication → URL Configuration** so email confirmations and recovery links return to the app:
  - Site URL: `https://luxury-model-designs.replit.app`
  - Redirect URLs: `https://luxury-model-designs.replit.app/**` and the current preview, `https://4730a85c-94b9-4b28-91b7-4cb5922266a5-00-1465gikooptme.pike.replit.dev/**`. Add the current preview origin again if Replit changes it.
  - The app uses `window.location.origin` for confirmation and password-recovery redirect requests.
- For reliable confirmation and recovery email delivery at production scale, configure custom SMTP. Supabase's built-in email service has provider rate limits.

The auth page and app metadata are bilingual, but Supabase's default confirmation and recovery emails use the project email templates; localizing those templates is a separate dashboard setting.

## Verification

```sh
node --test artifacts/api-server/tests/catalog.test.mjs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/f9-boutique run typecheck
PORT=25340 BASE_PATH=/ pnpm --filter @workspace/f9-boutique run build
```

On Preview, `GET /api/catalog` should return six products and three boutiques initially. Try sign-up with an address you control, confirm the email if required, log in, favorite a product, log out, then log in again and verify it remains in the account. Log in with a different account and verify it does not see the first account's favorites. Guest favorites continue to work while logged out.

Republish to update the public app, including both Supabase environment variables in production. This repository's migration/seed are applied to the connected Supabase project, not to Replit's database or via automatic deployment migrations.
