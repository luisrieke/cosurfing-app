# Early Contributors coffee program (`/free-coffee`)

“Your next 3 coffees are on me”: the first 50 contributors get up to three coffees (max €5 each, €15 per person) reimbursed after a person has reviewed their proof. Organized by Cosurfing (Spacifik UG).

| Step | Reward | Proof (sent by direct message) |
| --- | --- | --- |
| 1 · Contribute (base) | 1 coffee | Detailed own review + own photos on Cosurfing; screenshots of both, location screenshot, receipt |
| 2 · Add a new place | +1 coffee | Place suggestion through Cosurfing; screenshot, separate receipt |
| 3 · Spread the word | +1 coffee | Friend's new account email (with the friend's agreement) **or** link + screenshot of a public post marked as an ad; separate receipt |

Steps 2 and 3 need an approved Step 1. They can be sent together with Step 1 or later.

## How it fits together

There is no upload form. Proof goes to Luis as a direct message on one of his channels:

| Channel | Account | Link used by the app |
| --- | --- | --- |
| Instagram | @luisbuildsinpublic | `https://ig.me/m/luisbuildsinpublic` (opens the DM directly) |
| TikTok | @luisbuildsinpublic | `https://www.tiktok.com/@luisbuildsinpublic` (profile, then *Message*) |
| X | @luisbu1lds | `https://x.com/luisbu1lds` (profile, then *Message*) |

The list lives in `COFFEE_CHANNELS` in `src/lib/coffee.ts`; change it there if a handle changes. TikTok and X only allow messages from people you follow back or with open DMs, so **open your DM settings on TikTok and X** (or drop those channels) before going live.

```
/free-coffee (app)              Supabase Postgres
  join + accept terms  ── coffee_join() ──────▶ coffee_participants (code CS-XXXXX, spot: reserved/held/confirmed/waitlisted/released)
  shows code + what to send + "Message on Instagram/TikTok/X"
  participant DMs Luis with the code and proof
  "I've sent my proof" ── coffee_mark_sent(steps, channel, username) ──▶ coffee_rewards → submitted, spot → held
Admin → Coffee program  ── coffee_admin_* RPCs (search by code/username, approve with receipt details, mark paid)
pg_cron  ── coffee_housekeeping() hourly; coffee-jobs every 10 min (participant emails)
```

* **Matching a message to an account:** every participant gets a random code (`CS-` + 5 characters, no 0/O/1/I). The prefilled message on `/free-coffee` starts with it. In the admin list, paste the code (or the username) into *Find a participant*. Only steps the participant marked as sent are in *Needs action*; if someone sends a DM but forgets the button, open their page and press *Mark proof received* on the step.
* **Spoofing:** anybody could DM a code that is not theirs, but approval only ever pays the account that owns the code, after the admin has checked the review, photos and suggestion on that account (the participant page lists them). Check that the username in the DM matches the one the participant entered.
* **50-spot cap:** enforced in Postgres under an advisory lock (`coffee_rebalance()`).
* **Reservation policy:** joining reserves a spot for 7 days (`reservation_days`). Marking Step 1 as sent moves it to *held* while it is reviewed. Approval makes it *confirmed*. An expired reservation is released and the next person on the waiting list is promoted (and emailed). A rejected Step 1 can be fixed once within 7 days (`resubmit_days`, `max_attempts = 2`); a final rejection releases the spot and rejects pending bonus steps. Someone whose reservation expired may rejoin once, at the end of the waiting list.
* **Pressed "sent" but no DM arrived:** reject the step with *proof not received*. For Step 1 this puts the spot back to *reserved* for 7 days (second and last attempt), so a spot cannot be blocked forever. Do this within about 3 days so spots keep moving.
* **No double rewards:** one participation per account, one reward per step, a referred friend counts once (entered by the admin when approving Step 3, checked against existing accounts: must exist, not be the participant, be created after they joined, and not be used before), and a receipt (fingerprint of venue + date + total + number, entered by the reviewer) can only be approved or paid once across everyone.
* **Money:** nothing is paid automatically. The admin approves an amount (≤ €5 and ≤ receipt total), the participant then adds PayPal or IBAN on `/free-coffee` (never in a DM), the admin sends the money by hand and records it with *Mark as paid* (writes the `coffee_payouts` ledger).
* **Incentive label:** reviews written while someone takes part get `reviews.coffee_program = true` and show “Early Contributor: coffee reimbursed by Cosurfing, any rating allowed” on the place page (§ 5b (3) UWG). The rating never influences the decision.
* **Popup:** visitors without an account see the coffee invitation instead of the normal sign-up interstitial while the program is live and has free spots. It is shown at most once per session and paused 14 days after “Maybe later”, never on a device whose account has joined, and always keeps a sign-in link. Signed-in users get a card on the account page and a footer link.

## Reviewing a direct message

1. Search the code from the message in **Admin → Coffee program**.
2. Compare the sender with the username on the participant page.
3. Check the review, photos and suggestion listed under *Contributions since joining* against the screenshots.
4. *Approve…*: copy venue, date, total and receipt number from the receipt photo. For Step 3 referrals, paste the friend's email (leave it empty for a post; open the post link and check it is public and marked #ad).
5. Or *Reject…* with a reason; the participant gets an email with it.
6. Within 30 days after the decision, delete the screenshots, receipt photo and any friend's email from the chat (privacy policy 9a). Do not forward proof elsewhere.

## Retention

| Data | Where | Deleted |
| --- | --- | --- |
| Screenshots, receipt photo, friend's email | Luis's DMs only, never in Cosurfing's systems | By Luis from the chat at the latest 30 days after the decision on the step; at once when the participant leaves |
| Username and channel | `coffee_participants` | Automatically 90 days after the last decision, once nothing is pending |
| Receipt fingerprint (venue, date, total, number) | `coffee_rewards` | With the account |
| Payout details (PayPal / IBAN) | `coffee_payout_details` | 30 days after the last payment |
| Sent email log | `coffee_notices` | 1 year |
| Payment ledger (payee, amount, date, method, reference) | `coffee_payouts` | Kept 10 years (§ 147 AO); survives account deletion with `user_id` set to null |

Deleting an account deletes everything else in Cosurfing (cascade). Proof in the chat is not linked to the account deletion, so delete the chat by hand if a participant deletes their account or leaves the program while a step is pending.

## Launch checklist

### 1. Database and functions

```bash
supabase db push                                       # applies 20261110120000_coffee_campaign.sql
supabase functions deploy coffee-jobs --no-verify-jwt  # checks the crawler secret
```

The migration schedules two cron jobs (`cosurfing-coffee-housekeeping`, `cosurfing-coffee-jobs`); `coffee-jobs` is called through the existing `invoke_crawler()`, so the Vault secrets `crawler_secret` and `project_url` must already exist (they do if the crawlers run).

The campaign starts in status **draft**: nobody can join until an admin sets it live.

### 2. Secrets

No new secrets. Participant emails use the existing `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO` and `SITE_URL`; they stay queued until Resend is configured. Use `EMAIL_SANDBOX_TO` while testing.

### 3. Social accounts

* Instagram: make sure message requests from people you do not follow land in *Requests* and check that folder.
* TikTok and X: allow direct messages from everyone (TikTok: Settings → Privacy → Direct messages; X: Settings → Privacy and safety → Direct messages → Allow message requests from everyone), or remove the channel from `COFFEE_CHANNELS`.
* Never ask for or accept payout details, passwords or login codes in DMs. Expect impersonation attempts once the campaign is public; the terms tell participants that payout details are only entered on `/free-coffee`.

### 4. Test before going live

1. Set `EMAIL_SANDBOX_TO` to your address.
2. In Admin → Coffee program set *Max participants* to 50, end date, status **live**.
3. With a test account: join on `/free-coffee`, write a review with photos, copy the message, DM yourself the test proof, press *I've sent my proof* with your username.
4. In Admin → Coffee program: search the code, *Start review*, *Approve…* with receipt details. The participant adds payout details; *Mark as paid…* records the payment. Check the emails at each step.
5. Try the same receipt details on another reward: approval must fail with “already reimbursed”.
6. Remove `EMAIL_SANDBOX_TO`, delete the test accounts, and go live.

## Before launch: needs a human decision or legal/tax review

* **Legal review of `/free-coffee/terms` and privacy section 9a** (German UWG § 5a/5b, incentivized reviews and Omnibus directive; consumer law for the participants' countries). Especially:
  * Geography (currently EU/EEA, Switzerland, UK) and the age limit (18+).
  * Whether a “first 50” promotion with discretionary review is sufficiently transparent (criteria are listed in the terms).
  * The incentive label wording on reviews and whether incentivized reviews may count toward the ranking (currently they count like any other review, and the ranking page says so).
  * Influencer labelling for Step 3 posts (#ad / “Anzeige”).
* **Proof by direct message (GDPR):** receipts and location screenshots now pass through Meta, TikTok or X (their own controllers, with transfers outside the EU) and sit in a personal inbox. Have the privacy section 9a wording checked, confirm that Luis receives the messages on behalf of Spacifik UG, and keep to the 30-day deletion. Requiring a social account to take part is a design choice to confirm.
* **Tax:** booking of reimbursements as marketing expense, whether receipt images must be kept as accounting vouchers (they are deleted from the chat 30 days after the decision; if your tax adviser wants them, save paid receipts to the accounting system and update section 9a), and possible income for participants.
* **PayPal / bank:** decide the account you pay from; PayPal “friends and family” vs. goods-and-services has fee and terms implications.
* **Budget:** maximum exposure is 50 × €15 = €750 plus fees.
