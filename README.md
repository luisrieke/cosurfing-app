# Cosurfing

Find great places to work: coworking spaces and laptop‑friendly cafés, starting with **Berlin** and **Parga**. Every other city gets a waiting list.

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
  index.tsx              Home: city picker + search
  [city]/index.tsx       Active city → explore (map + list); other city → waiting list
  place/[slug]/          Public place profile, review, report
  waitlist/              join, confirm, leave
  auth/sign-in.tsx       Email OTP sign-in
  account/               Profile, favorites, reviews, Plus status
  plus/                  Paywall + success page
  suggest.tsx            Suggest a place (signed in)
  admin/                 Admin area (guarded by is_admin())
src/
  components/            UI primitives, map, explore screen, waitlist form, admin shell
  lib/                   theme, strings (all copy), supabase client, queries, auth, billing, purchases
  hooks/                 useQuery, useBreakpoint, useUserLocation
supabase/
  migrations/            Schema, RLS, RPCs, storage buckets (applied to the project)
  seed.sql               Example places flagged is_example = true
  functions/             waitlist, billing, stripe-webhook, revenuecat-webhook
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

Set `EXPO_PUBLIC_SHOW_EXAMPLE_PLACES=true` locally to see the seeded example places. They are flagged everywhere as example data and hidden from visitors by default; delete them in **Admin → Cities** before launch.

## Supabase

Project: `cosurfing` (eu-central-1). Migrations in `supabase/migrations` are already applied; the four Edge Functions are deployed.

To reproduce elsewhere: `supabase link --project-ref <ref>`, `supabase db push`, `supabase db execute -f supabase/seed.sql` (optional), then `supabase functions deploy <name> --no-verify-jwt` for each function (they authenticate in code: public waitlist actions are rate‑limited, admin/billing actions verify the user's session, webhooks verify provider signatures/secrets).

### Auth (email OTP)

1. Authentication → Providers → Email: enable, **disable "Confirm email"** is not needed; keep sign‑ups open.
2. Authentication → Email Templates → **Magic Link**: the app verifies a 6‑digit code, so the template must contain `{{ .Token }}`, for example:
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
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_WEEKLY`, `STRIPE_WEBHOOK_SECRET` | billing, stripe-webhook | See Stripe below |
| `REVENUECAT_WEBHOOK_AUTH` | revenuecat-webhook | Shared secret RevenueCat sends in the `Authorization` header |
| `ALLOW_DEV_ENTITLEMENTS` | billing | `true` only on a development project. Enables the clearly labelled "simulate Plus" toggle. Never set in production. |

## Resend

1. Add and verify the domain `cosurfing.app` (DKIM + SPF + return‑path records).
2. Create an API key with sending access → `RESEND_API_KEY`.
3. Set `RESEND_REPLY_TO` to a mailbox you read.
4. Before the first test, set `EMAIL_SANDBOX_TO` to your own address, join a waiting list for a test city, confirm via the link in the redirected email and check that the ambassador email arrives exactly once. Then remove the sandbox variable.

Email flow: join → confirmation email (48 h token) → confirm → entry `verified` → ambassador email **"Help bring Cosurfing to {city}?"** from **Luis from Cosurfing** with the button **Book a chat with Luis** (https://cal.com/luisrieke/user-interview). Send status is stored per entry; failed sends are visible in **Admin → Waiting lists** and can be retried. Every ambassador email contains a one‑click leave link.

## Plus (€0.99 / week)

Free: ads (labelled; development placeholder only until a provider is configured), full coworking profiles, café pins + facts, café photos as tiny blurred previews, café review text replaced by locked placeholders.
Plus: no ads, all café photos and reviews, same status on every platform (entitlement lives in `public.entitlements`, keyed by user).

Protection is server‑side: full photos live in the **private** `place-photos` bucket (storage RLS allows coworking photos for everyone, café photos for Plus/admins), blurred 24 px previews in the public `place-previews` bucket, and `get_place_reviews()` nulls café review bodies for non‑Plus callers.

### Stripe (web)

1. Create a product "Cosurfing Plus" with a recurring price of €0.99 **weekly** → `STRIPE_PRICE_ID_WEEKLY`.
2. Enable the Customer Portal (Settings → Billing → Customer portal) so users can cancel.
3. Add a webhook endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → `STRIPE_WEBHOOK_SECRET`.
4. Set `STRIPE_SECRET_KEY` and set `EXPO_PUBLIC_WEB_PAYMENTS=stripe` in the web build env so the paywall shows the real checkout button.

### RevenueCat (iOS / Android)

1. Create the app(s), a product with a weekly €0.99 subscription in App Store Connect / Play Console, an entitlement with the identifier **`plus`**, and an offering whose weekly package uses it.
2. Public SDK keys → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
3. Webhook: URL `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`, Authorization header value = `REVENUECAT_WEBHOOK_AUTH`.
4. The app logs in to RevenueCat with the Supabase user id, so the webhook maps purchases to accounts.

Until a provider is configured, the paywall says so and never shows a fake purchase. In `__DEV__` builds with `ALLOW_DEV_ENTITLEMENTS=true` on the server, a dashed **Development mode** box offers "Simulate Plus (no payment)" and stores the entitlement with `source = 'dev'`.

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
- First admin row, then real Berlin/Parga places with photos you have the rights to; delete the example places.
- Google Maps Android key, EAS project id, store listings.

## Principles baked in

- Only data that is known is shown; unknown facts render as "Unknown", never invented.
- Example data is flagged and cannot be mistaken for real places.
- Service keys, Resend and payment secrets exist only in Edge Function secrets.
- Public forms are validated server‑side (honeypot, rate limits, token hashing).
- Plus status is never set by the client; integrations are never shown as working when they are not configured.
