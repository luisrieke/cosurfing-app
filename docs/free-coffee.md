# Early Contributors coffee program (`/free-coffee`)

“Your next 3 coffees are on me”: the first 50 contributors get up to three coffees (max €5 each, €15 per person) reimbursed after a person has reviewed their proof. Organized by Cosurfing (Spacifik UG).

| Step | Reward | Proof |
| --- | --- | --- |
| 1 · Contribute (base) | 1 coffee | Detailed own review + own photos on Cosurfing, screenshots, location screenshot, receipt |
| 2 · Add a new place | +1 coffee | Place suggestion through Cosurfing, screenshot, separate receipt |
| 3 · Spread the word | +1 coffee | Friend's new account (with the friend's agreement) **or** a public post marked as an ad, separate receipt |

Steps 2 and 3 need an approved Step 1. They can be sent together with Step 1 or later.

## How it fits together

```
/free-coffee (app)          coffee_join()            Supabase Postgres
  join + accept terms  ───────────────────────────▶  coffee_participants (spot: reserved/held/confirmed/waitlisted/released)
  "Send proof"         ── coffee_form_link() ──────▶  coffee_form_tokens (one-time, 48 h, stored as sha256)
        │ opens https://tally.so/r/<id>?token=…&email=…&base=open|done&place=…&share=…
        ▼
  Tally form  ── webhook (signed) ──▶ coffee-tally-webhook ── copies files ──▶ private bucket coffee-evidence
                                                └─ coffee_ingest_submission() ─▶ coffee_submissions, coffee_rewards, coffee_evidence
Admin → Coffee program  ── coffee_admin_* RPCs, coffee-evidence (signed URLs, access log)
pg_cron  ── coffee_housekeeping() hourly; coffee-jobs every 10 min (emails, deleting proof files)
```

* **Identity:** the form never trusts an email or user id typed in it. `coffee_form_link()` creates a random token, stores only its hash and hands the token to the form as a hidden field. The webhook maps the hash back to the account; tokens are single-use and expire after 48 hours.
* **50-spot cap:** enforced in Postgres under an advisory lock (`coffee_rebalance()`); tested with 40 parallel joins against a cap of 5.
* **Reservation policy:** joining reserves a spot for 7 days (`reservation_days`). Sending Step 1 moves it to *held* while it is reviewed. Approval makes it *confirmed*. An expired reservation is released and the next person on the waiting list is promoted (and emailed). A rejected Step 1 can be fixed once within 7 days (`resubmit_days`, `max_attempts = 2`); a final rejection releases the spot and rejects pending bonus steps. Someone whose reservation expired may rejoin once, at the end of the waiting list.
* **No double rewards:** one participation per account (`coffee_participants.user_id` unique), one reward per step (`coffee_rewards (user_id, step)` unique), a referred friend counts once, and a receipt (fingerprint of venue + date + total + number, entered by the reviewer) can only be approved or paid once across everyone. Receipt files with the same SHA-256 are flagged to the reviewer.
* **Money:** nothing is paid automatically. The admin approves an amount (≤ €5 and ≤ receipt total), the participant then adds PayPal or IBAN on `/free-coffee`, the admin sends the money by hand and records it with *Mark as paid* (writes the `coffee_payouts` ledger).
* **Incentive label:** reviews written while someone takes part get `reviews.coffee_program = true` and show “Early Contributor: coffee reimbursed by Cosurfing, any rating allowed” on the place page (§ 5b (3) UWG). The rating never influences the decision.
* **Popup:** visitors without an account see the coffee invitation instead of the normal sign-up interstitial while the program is live and has free spots. It is shown at most once per session and paused 14 days after “Maybe later”, never on a device whose account has joined, and always keeps a sign-in link. Signed-in users get a card on the account page and a footer link.

## Retention

| Data | Deleted |
| --- | --- |
| Location screenshots | 30 days after the decision on the step |
| Proof of rejected steps | 30 days after the decision |
| Proof of paid steps | 90 days after payment |
| Any proof file | at the latest 180 days after upload; at once when the participant leaves or an admin presses *Delete proof files now* |
| Payout details (PayPal / IBAN) | 30 days after the last payment |
| Form answers | 1 year |
| Admin evidence-view log, sent email log | 1 year |
| Payment ledger (`coffee_payouts`: payee, amount, date, method, reference) | kept 10 years (§ 147 AO); survives account deletion with `user_id` set to null |

Deleting an account deletes everything else (cascade) and the proof files (`account` function).

## Launch checklist

### 1. Database and functions

```bash
supabase db push                                  # applies 20261110120000_coffee_campaign.sql
supabase functions deploy coffee-tally-webhook --no-verify-jwt
supabase functions deploy coffee-evidence --no-verify-jwt   # checks the admin session itself
supabase functions deploy coffee-jobs --no-verify-jwt       # checks the crawler secret
supabase functions deploy account --no-verify-jwt           # now also deletes coffee proof files
```

The migration schedules two cron jobs (`cosurfing-coffee-housekeeping`, `cosurfing-coffee-jobs`); `coffee-jobs` is called through the existing `invoke_crawler()`, so the Vault secrets `crawler_secret` and `project_url` must already exist (they do if the crawlers run).

The campaign starts in status **draft**: nobody can join until an admin sets it live.

### 2. Supabase secrets

| Secret | Required | Notes |
| --- | --- | --- |
| `TALLY_SIGNING_SECRET` | yes | The webhook answers 503 until it is set, and 401 for unsigned requests |
| `TALLY_COFFEE_FORM_ID` | recommended | The form id (`https://tally.so/r/<id>`); other forms' events are ignored |
| `TALLY_API_KEY` | recommended | Tally → Settings → API keys. Lets the webhook delete each submission from Tally after copying it, so receipts, location screenshots and a friend's email do not stay at Tally. Without it, delete submissions in Tally by hand regularly (and mention the longer storage in the privacy policy) |
| `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`, `SITE_URL` | yes (existing) | Participant emails; they stay queued until Resend is configured. Use `EMAIL_SANDBOX_TO` while testing |

### 3. App / website env

`EXPO_PUBLIC_COFFEE_FORM_URL=https://tally.so/r/<id>` in Netlify (all contexts) and EAS. Until it is set, “Send proof” says the form is not ready and the admin page refuses to go live.

### 4. Tally form

Create one form in the Spacifik workspace, e.g. “Cosurfing Early Contributors · proof”. **Question titles must match exactly** (case does not matter) because the webhook finds answers by title. Put each section on its own page.

**Hidden fields** (Insert → Hidden fields): `token`, `base`, `place`, `share`. The app sets `base/place/share` to `open` or `done`.

**Page 1 · Account**

| Title | Type | Settings |
| --- | --- | --- |
| `Email` | Email | Required. Pre-populate from URL parameter `email` (the account email; informational only) |
| `Campaign rules` | Checkbox | Required. Text: “I have read and accept the [campaign terms](https://cosurfing.app/free-coffee/terms) and the [privacy information](https://cosurfing.app/privacy).” |

Logic on page 1: if `token` *is empty* → show a statement “Please open this form from cosurfing.app/free-coffee” and hide the submit button (or jump to an end page). Then: if `base` is `open` → go to page 2; else if `place` is `open` → page 3; else if `share` is `open` → page 4; else → page 5.

**Page 2 · Step 1: Review and visit** (only when `base` is `open`)

| Title | Type | Settings |
| --- | --- | --- |
| `Place reviewed` | Short answer | Required. Name of the café or link to its Cosurfing page |
| `Review screenshot` | File upload | Required, 1 file, images or PDF, max 10 MB |
| `Photos screenshot` | File upload | Required, 1–3 files. Screenshot of the photos you uploaded to the place |
| `Genuine visit` | Checkbox | Required. “I visited this place myself and the review is my own honest experience.” |
| `Location screenshot` | File upload | Required, 1 file. “Your current location in Google Maps or Apple Maps, taken at the place.” |
| `Receipt` | File upload | Required, 1 file. “Cover card numbers before uploading.” |
| `Visit date` | Date | Required |
| `Coffee amount` | Short answer | Required. “Price of the coffee in €, e.g. 3.80” |

**Page 3 · Step 2: New place** (when `place` is `open`; logic from page 2 continues here when `place` is `open`)

| Title | Type | Settings |
| --- | --- | --- |
| `New place submitted` | Multiple choice | Options exactly `Yes` and `Not now`. Show the next three only when `Yes` |
| `New place name or link` | Short answer | Required if shown |
| `New place screenshot` | File upload | Required if shown, 1 file |
| `New place receipt` | File upload | Required if shown, 1 file (a separate coffee receipt) |
| `New place coffee amount` | Short answer | Required if shown |

**Page 4 · Step 3: Spread the word** (when `share` is `open`)

| Title | Type | Settings |
| --- | --- | --- |
| `Spread the word` | Multiple choice | Options must contain the words **friend** and **post**, e.g. `A friend created an account`, `I published a public post`, `Not now` |
| `Friend's email` | Email | Shown for the friend option. Help text: “Only with your friend's agreement. We use it once to find their account and do not keep it.” |
| `Friend agreed` | Checkbox | Shown for the friend option, required. “My friend agreed that I share their email address with Cosurfing for this check.” |
| `Post URL` | Link | Shown for the post option, required. Help text: “Your post must be public and marked as an ad (e.g. #ad).” |
| `Post screenshot` | File upload | Shown for the post option, required |
| `Share receipt` | File upload | Shown unless `Not now`, required |
| `Share coffee amount` | Short answer | Shown unless `Not now`, required |

**Page 5 · Submission**

| Title | Type | Settings |
| --- | --- | --- |
| `Final confirmation` | Checkbox | Required. “All proof is mine and genuine. Every receipt is used only once. I understand that a person reviews my submission and that a reward is not guaranteed.” |

Thank-you page: “Thanks! We usually review within 7 days. You can follow the status at cosurfing.app/free-coffee.” Do **not** promise a reimbursement.

**Form settings:** multiple submissions must stay allowed (participants send bonus steps later; each link's token works once). Disable partial submissions. Do not enable Tally email notifications that copy answers into mailboxes (receipts would end up there).

**Webhook:** Integrations → Webhooks → Endpoint `https://<project-ref>.supabase.co/functions/v1/coffee-tally-webhook`, enable a signing secret and store the same value as `TALLY_SIGNING_SECRET`. Tally waits 10 s; slow deliveries are retried after 5 min and deduplicated by submission id.

**Processor:** check that the Tally DPA covers the workspace (Tally BV, Belgium) and that uploaded files are not publicly listed; the webhook only downloads from Tally's storage hosts.

### 5. Test before going live

1. Set `EMAIL_SANDBOX_TO` to your address.
2. In Admin → Coffee program set *Max participants* to 50, end date, status **live**. Joining is only possible while live.
3. With a test account: join on `/free-coffee`, write a review with photos, press *Send Step 1 proof*, fill the form with test images, submit.
4. In Admin → Coffee program → participant: *Show files* (images load, view is logged), check the signals, *Start review*, *Approve…* with receipt details. The participant adds payout details; *Mark as paid…* records the payment. Check the emails at each step.
5. Try the same receipt details on another reward: approval must fail with “already reimbursed”.
6. Remove `EMAIL_SANDBOX_TO`, delete test participants (delete the test accounts), and go live.

## Before launch: needs a human decision or legal/tax review

* **Legal review of `/free-coffee/terms` and privacy section 9a** (German UWG § 5a/5b, incentivized reviews and Omnibus directive; consumer law for the participants' countries). Especially:
  * Geography (currently EU/EEA, Switzerland, UK) and the age limit (18+).
  * Whether a “first 50” promotion with discretionary review is sufficiently transparent (criteria are listed in the terms).
  * The incentive label wording on reviews and whether incentivized reviews may count toward the ranking (currently they count like any other review, and the ranking page says so).
  * Influencer labelling for Step 3 posts (#ad / “Anzeige”).
* **Tax:** booking of reimbursements as marketing expense, whether receipts must be kept as accounting vouchers (the ledger is kept 10 years; receipt images are deleted after 90 days, so if your tax adviser wants the receipt images as vouchers, extend the paid-proof retention and update section 9a), and possible income for participants.
* **Referral email legal basis:** currently legitimate interest + the friend's agreement confirmed by the participant; the email is used once and not stored by Cosurfing, but it is stored at Tally until the submission is deleted (set `TALLY_API_KEY`).
* **PayPal / bank:** decide the account you pay from; PayPal “friends and family” vs. goods-and-services has fee and terms implications.
* **Budget:** maximum exposure is 50 × €15 = €750 plus fees.
