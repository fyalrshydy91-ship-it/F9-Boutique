---
name: F9 Boutique product boundaries
description: User-defined merchandising scope and prototype expectations.
---

F9 Boutique is a platform gathering multiple independent boutiques, not a single store. Merchandise is limited to abayas and women's clothing; exclude bags, shoes, accessories, perfume, and cosmetics.

**Why:** The user explicitly defined these boundaries in the supplied website requirements.

**How to apply:** Preserve this positioning in imagery, copy, sample products, and future shopping features.

The user wants luxurious model photography and beautiful garment designs while retaining the approved chocolate, champagne, and ivory brand. The requested first version uses demo data and frontend interactions, not real payments or live boutique connections. English is the default, with complete Arabic support and RTL.

**Why:** These are explicit user requirements, including the instruction not to claim unimplemented commerce connections.

**How to apply:** Keep prototype limitations honest; real checkout remains out of scope. The user later explicitly requested real account authentication and private favorites.

Publishing must preserve the approved design exactly, including later readability and navigation-spacing adjustments.

**Why:** The user explicitly requested fixing public access without changing the design.

**How to apply:** Treat deployment repair as a faithful transfer, not an opportunity to redesign or add commerce services. Preserve the canvas source as a reference.

The user expanded the scope for Day 3 to include real public currency rates and an OpenRouter fashion assistant while keeping the existing design, pages, and shopping behavior. This is an exception to the original frontend-only boundary, not permission to add real checkout or boutique connections.

**Why:** The user explicitly requested the class API and AI requirements in the existing project, not a rebuild.

**How to apply:** Keep external service calls server-side. Use the user's own OpenRouter key in Replit Secrets for this class requirement rather than substituting Replit-billed AI access.

The user initially chose Supabase for products and boutiques only, then explicitly expanded scope to accounts and saved favorites. Preserve the approved catalog and product IDs; the shopping bag remains browser-local.

**Why:** The user selected “Products and boutiques” when asked which part of F9 Supabase should power.

**How to apply:** Keep catalog access publicly readable but not publicly writable. Account authentication and favorites are now explicitly in scope; checkout and an administrative editor are not.

The user later explicitly expanded F9's Supabase scope to email authentication and private per-user favorites. The shopping bag remains browser-local. Browser credentials must use only the Supabase publishable key; private favorites are protected by `auth.uid()` RLS.

**Why:** The user specifically requested Supabase Auth, favorites scoped to each account, and no frontend service-role secret.

**How to apply:** Treat the public/publishable key as safe for browser use, never include an admin/service-role key in `VITE_*`, and keep each customer table limited to the rows belonging to its verified Supabase Auth user.
