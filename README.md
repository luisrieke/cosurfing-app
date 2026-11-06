# Cosurfing

The best places to work in every big city, ranked. Every city with 500,000+ inhabitants plus curated nomad hotspots (~1,080 cities) gets a ranking of coworking spaces, laptop‑friendly cafés and libraries, with hard facts (measured Wi‑Fi speed, outlets, calls, day pass price, opening hours) and reviews from people who work there.

Anyone can see the rankings, scores and hard facts. Review texts, detail ratings and the speed test history need a free account; Plus removes ads and unlocks all photos.

One Expo codebase for **web (cosurfing.app), iOS and Android**. Supabase for data, auth and photos; Resend for email; Stripe (web) and RevenueCat (native) for the optional Plus subscription.

## Stack

| Layer | Choice |
| --- | --- |
| App | Expo SDK 58, React Native, TypeScript, Expo Router (typed routes, SPA web output) |
| Map | MapLibre GL + OpenFreeMap tiles on web, `react-native-maps` on native (Apple Maps / Google Maps) |
| Backend | Supabase: Postgres + RLS, Auth (email OTP), Storage, Edge Functions (Deno) |
| Email | Resend (REST API from Edge Functions) |
| Payments | Stripe Checkout + Customer Portal (web), RevenueCat (iOS/Android). Entitlements are written **only** by webhooks. |
| Hosting | Netlify (`netlify.toml`), EAS for app builds |

## Project layout

```
app/                     Expo Router routes
  index.tsx              Home: all cities as cards (search, continent, sort), nomads.com style
  [city]/index.tsx       City ranking (list first, optional map); unknown city → waiting list
  place/[slug]/          Place profile (score, hard facts, website facts, reviews, speed test), review form, report
  welcome.tsx            Onboarding after sign-up: name, home city, rate 3 places
  waitlist/              join, confirm, leave
  auth/sign-in.tsx       Email OTP sign-in / sign-up
  account/               Level + points, favorites, reviews, Plus status
  plus/                  Paywall + success page
  suggest.tsx            Suggest a place (signed in)
  admin/                 Admin area (guarded by is_admin()): cities + crawl status, places, reviews,
                         speed tests, suggestions, reports, waiting lists
src/
  components/            UI primitives, city ranking, place sections, speed test, sign-up gates, map
  lib/                   theme, strings (all copy), supabase client, queries, auth, billing, funnel, speedtest
  hooks/                 useQuery, usePaged, useBreakpoint, useUserLocation
scripts/
  import-cities.mjs      GeoNames ≥500k + nomad hotspots + Wikimedia cover photos → cities + crawl queue
  import-colivings.mjs   scripts/data/colivings.json → idempotent SQL upsert (nearest city within 40 km)
  replace-collage-covers.mjs   Finds collage covers of imported cities and writes SQL that swaps in single photos
supabase/
  migrations/            Schema, RLS, RPCs, crawler schedule (applied to the project)
  functions/             crawl-city, enrich-places, import-cities, waitlist, billing, stripe-webhook, revenuecat-webhook
```

## Local development

```bash
npm install
cp .env.example .env      # fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
npm run web               # http://localhost:8081
npm run ios / npm run android
npm run typecheck && npm run lint
```

Without Supabase credentials the app still renders and shows a clear "backend not configured" notice instead of pretending to work. Maps on native need a development build (`npx expo run:ios|android` or EAS); Expo Go does not include `react-native-maps` with these settings or `react-native-purchases`.

The old seeded example places have been removed from the project; if any remain in another environment, **Admin → Cities** offers a one-click delete.

## Data and crawler

| Data | Source | License / attribution |
| --- | --- | --- |
| Cities, population, coordinates | [GeoNames](https://www.geonames.org) `cities500` (≥ 500,000 inhabitants) + `scripts/data/nomad-hotspots.json` | CC BY 4.0, credited in the footer |
| City cover photos | Wikimedia Commons via Wikidata (P18); infobox montages are swapped for a single photo of the city's Wikipedia article (`scripts/lib/covers.mjs`) | Per-photo license + author stored in `cities.cover_attribution` / `cover_source_url`, shown on the city page |
| Places and their tags (Wi‑Fi, outlets, hours, website…) | OpenStreetMap via [QLever](https://qlever.cs.uni-freiburg.de) SPARQL, Overpass as fallback | ODbL, "© OpenStreetMap contributors" on every page with OSM data, plus an "edit on OSM" link |
| Day pass, advertised Mbit/s, phone booths, 24/7, laptop policy | The venue's own public website (`enrich-places`) | Each fact is stored with the sentence and URL it came from and shown with its source |
| Colivings | Researched by hand from each operator's own website: `scripts/data/colivings.json` (with the pages checked in `sources`), imported with `scripts/import-colivings.mjs` | Coordinates geocoded with OSM Nominatim (ODbL); descriptions are our own words |
| Reviews, detail ratings, speed tests | Users | Speed tests use Cloudflare's public speed endpoints. `submit_speed_test` checks GPS distance, accuracy and network type on the server; only tests confirmed on site count toward a place's medians |

**Pipeline.** `scripts/import-cities.mjs` writes the cities and queues one crawl job per city. pg_cron then runs:

- `cosurfing-crawl-city` every minute: `crawl-city` claims the next jobs by priority and upserts places. Fields an admin edited are listed in `places.locked_fields` and never overwritten.
- `cosurfing-enrich-places` every 2 minutes: `enrich-places` reads the venue websites (honours robots.txt, SSRF-guarded, size and time limits, 90-day refresh).
- `cosurfing-enqueue-due` daily: re-queues cities older than 30 days and prunes old jobs.

Visiting a city that has not been crawled yet bumps its job to the front (`request_city_crawl`). Admins can re-crawl a city or re-read its websites in **Admin → Cities**.

**Secrets.** The edge functions are deployed with `verify_jwt = false` and instead check a shared secret stored in Supabase Vault as `crawler_secret` (plus `project_url` for pg_net). Keep a local copy only in the gitignored `.env.crawler` and run the import with `set -a && . ./.env.crawler && node scripts/import-cities.mjs`.

**Colivings.** Places to stay with a workspace for residents, so they are kept apart from the places to work: they have their own tab on the city page (only shown when the city has colivings, never preselected) and are listed under "All" too, but are left out of the city's place count, city score and median Wi‑Fi, and only appear on the map when "Show colivings" is on. Their page says that you usually need a booked stay to work there and that some colivings are not open all year round. `season`, `non_guest_work` and `min_stay` hold what the operator's website says, `unknown` otherwise.

**Work score (0–10).** Reviews 55 %, Wi‑Fi 20 % (measured speed beats advertised beats "has Wi‑Fi"), outlets and calls 10 %, completeness of the info 10 %, type of place 5 %. Places with few reviews start near the middle. Ties are ranked by review count, then name, both in the city list and in the "#N place to work in …" rank on the place page.

## Supabase

Project: `cosurfing` (eu-central-1). Migrations in `supabase/migrations` are already applied; all Edge Functions are deployed.

To reproduce elsewhere: `supabase link --project-ref <ref>`, `supabase db push`, add `crawler_secret` and `project_url` to Vault, run the city import, then `supabase functions deploy <name> --no-verify-jwt` for each function (they authenticate in code: public waitlist actions are rate‑limited, admin/billing actions verify the user's session, webhooks verify provider signatures/secrets).

### Auth (email OTP)

1. Authentication → Providers → Email: enable, **disable "Confirm email"** is not needed; keep sign‑ups open.
2. Authentication → Email Templates → **Magic Link**: the app verifies an 8‑digit code (Authentication → Providers → Email → OTP length), so the template must contain `{{ .Token }}`, for example:
   `Your Cosurfing sign-in code is {{ .Token }}. It expires in 1 hour.`
3. Authentication → URL Configuration: Site URL `https://cosurfing.app`, add `http://localhost:8081` and `cosurfing://` to redirect URLs.
4. For production, configure a custom SMTP sender (Resend works) so OTP emails are not rate limited.

### First admin

Admins are rows in `public.admin_users`; the client can never grant this. Sign in once in the app, then in the SQL editor:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'you@example.com';
```

### Edge Function secrets

Set in Dashboard → Edge Functions → Secrets (or `supabase secrets set`). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

| Secret | Used by | Notes |
| --- | --- | --- |
| `SITE_URL` | waitlist, billing | `https://cosurfing.app`; links in emails and Stripe return URLs |
| `RESEND_API_KEY` | waitlist | Until set, joining a waiting list returns `email_not_configured` and nothing is stored |
| `RESEND_FROM` | waitlist | Default `Luis from Cosurfing <luis@cosurfing.app>` |
| `RESEND_REPLY_TO` | waitlist | Monitored mailbox for replies to the ambassador email |
| `EMAIL_SANDBOX_TO` | waitlist | **Testing safety net**: when set, every email is redirected to this address with the original recipient in the subject. Set it before any test, unset for production. |
| `RATE_LIMIT_SALT` | waitlist | Random string; IPs are only stored as salted hashes |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_WEEKLY`, `STRIPE_PRICE_ID_YEARLY`, `STRIPE_WEBHOOK_SECRET` | billing, stripe-webhook | See Stripe below |
| `REVENUECAT_WEBHOOK_AUTH` | revenuecat-webhook | Shared secret RevenueCat sends in the `Authorization` header |
| `ALLOW_DEV_ENTITLEMENTS` | billing | `true` only on a development project. Enables the clearly labelled "simulate Plus" toggle. Never set in production. |

## Resend

1. Add and verify the domain `cosurfing.app` (DKIM + SPF + return‑path records).
2. Create an API key with sending access → `RESEND_API_KEY`.
3. Set `RESEND_REPLY_TO` to a mailbox you read.
4. Before the first test, set `EMAIL_SANDBOX_TO` to your own address, join a waiting list for a test city, confirm via the link in the redirected email and check that the ambassador email arrives exactly once. Then remove the sandbox variable.

Email flow: join → confirmation email (48 h token) → confirm → entry `verified` → ambassador email **"Help bring Cosurfing to {city}?"** from **Luis from Cosurfing** with the button **Book a chat with Luis** (https://cal.com/luisrieke/user-interview). Send status is stored per entry; failed sends are visible in **Admin → Waiting lists** and can be retried. Every ambassador email contains a one‑click leave link.

## Plus (€0.99 / week or €29.99 / year)

Visitors: rankings, work scores, star averages, all hard facts and all photos in full resolution. Written reviews are always shown blurred; detail ratings and speed-test history are locked behind a **free account**. The app pushes sign-up with a gate after rank 10, a sticky banner and one interstitial from the second place viewed. After sign-up, `/welcome` asks for a home city and three quick ratings, and ends with a Plus offer.
Free account: detail ratings, speed tests, points and levels, plus **3 review unlocks per day** (UTC day; an unlocked review stays unlocked). Ads are shown (labelled; development placeholder until a provider is configured).
Plus: unlimited reviews and no ads, same status on every platform (entitlement lives in `public.entitlements`, keyed by user).

Protection is server‑side: `get_place_reviews()` returns review bodies only for the caller's own reviews, reviews in `review_unlocks`, Plus and admins; `unlock_review()` is the only writer of `review_unlocks` and enforces the daily limit (`review_unlock_limit()`); detail ratings and `get_place_speed_tests()` need a signed-in caller. Full photos live in the **private** `place-photos` bucket (storage RLS allows approved photos of published places for everyone) with 24 px previews in the public `place-previews` bucket.

### Stripe (web)

1. Create a product "Cosurfing Plus" with two recurring prices: €0.99 **weekly** → `STRIPE_PRICE_ID_WEEKLY` and €29.99 **yearly** → `STRIPE_PRICE_ID_YEARLY`. The checkout refuses a plan whose price id is missing (`plan_not_configured`).
2. Enable the Customer Portal (Settings → Billing → Customer portal) so users can cancel.
3. Add a webhook endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → `STRIPE_WEBHOOK_SECRET`.
4. Set `STRIPE_SECRET_KEY` and set `EXPO_PUBLIC_WEB_PAYMENTS=stripe` in the web build env so the paywall shows the real checkout button.

### RevenueCat (iOS / Android)

1. Create the app(s), a weekly €0.99 and a yearly €29.99 subscription in App Store Connect / Play Console (same subscription group), an entitlement with the identifier **`plus`** attached to both, and a current offering with a **Weekly** and an **Annual** package. The paywall only shows plans the offering contains.
2. Public SDK keys → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
3. Webhook: URL `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`, Authorization header value = `REVENUECAT_WEBHOOK_AUTH`.
4. The app logs in to RevenueCat with the Supabase user id, so the webhook maps purchases to accounts.

Until a provider is configured, the paywall says so and never shows a fake purchase. In `__DEV__` builds with `ALLOW_DEV_ENTITLEMENTS=true` on the server, a dashed **Development mode** box offers "Simulate Plus (no payment)" and stores the entitlement with `source = 'dev'`.

### Plus waiting list (Tally, until payments are live)

Set `EXPO_PUBLIC_PLUS_WAITLIST_URL` to a Tally form (`https://tally.so/r/<id>`) and the paywall on web, iOS and Android shows "Join the Plus waiting list" instead of a checkout, for signed-in users. The form is opened with `?email=…&user_id=…&plan=…&platform=…`; add hidden fields with exactly those names (and set the email field's pre-populate name to `email`) so every submission carries the Supabase user id. Turn on the form's self email notification (Integrations → Email notifications) to get an email per signup. Unset the variable to go back to the normal paywall.

The live form is [Cosurfing Plus waiting list](https://tally.so/r/kb97qe) (Tally workspace Spacifik, edit at `https://tally.so/forms/kb97qe/edit`). It has the four hidden fields, prefills the email question from `email`, and emails the form owner on every signup. `EXPO_PUBLIC_PLUS_WAITLIST_URL=https://tally.so/r/kb97qe` is set on Netlify (all contexts); set it in EAS too before a native build.

To unlock someone by hand, run in the Supabase SQL editor:

```sql
insert into public.entitlements (user_id, status, source, current_period_end)
values ('<user_id from the submission>', 'active', 'manual', now() + interval '1 year')
on conflict (user_id) do update
  set status = 'active', source = 'manual', current_period_end = excluded.current_period_end;
```

Use `current_period_end = null` for no end date, and `status = 'inactive'` to take it back.

## Maps

Web uses MapLibre with the OpenFreeMap `positron` style (no key). iOS uses Apple Maps. Android needs `GOOGLE_MAPS_ANDROID_API_KEY` (Maps SDK for Android) at build time.

MapLibre loads its worker from a separate file that Metro cannot resolve, so `scripts/copy-maplibre-worker.mjs` copies it to `public/maplibre-gl-worker.mjs` (runs on `postinstall` and before `build:web`; the copy is gitignored).

## Deploying

**Web (Netlify):** connect the repo; `netlify.toml` builds with `npm run build:web` and publishes `dist` with an SPA redirect. Set the `EXPO_PUBLIC_*` variables in Netlify (never server secrets).

**Apps (EAS):** `npx eas init` (fills `EAS_PROJECT_ID`), `eas build --profile production --platform all`. Bundle ids are `app.cosurfing.mobile`.

## Remaining setup (not possible without credentials)

- Resend domain + API key and `RESEND_REPLY_TO`; test with `EMAIL_SANDBOX_TO` first.
- Stripe product/price/webhook; RevenueCat apps/entitlement/webhook.
- Supabase Auth OTP template with `{{ .Token }}`, redirect URLs, custom SMTP.
- First admin row. Places come from the crawler; add photos only when you have the rights to them.
- Google Maps Android key, EAS project id, store listings.

## Principles baked in

- Only data that is known is shown; unknown facts render as "Unknown", never invented.
- Every crawled fact names its source (OpenStreetMap or the venue's website, with the quoted sentence).
- Account gating is enforced in the database RPCs, not only in the UI.
- Service keys, Resend and payment secrets exist only in Edge Function secrets.
- Public forms are validated server‑side (honeypot, rate limits, token hashing).
- Plus status is never set by the client; integrations are never shown as working when they are not configured.
