# Going live on Supabase — checklist

The app ships running on an in-memory **mock** provider. Point it at a Supabase
project and it switches to the **Supabase-backed** provider automatically — no
code changes, because both implement the same `DataProvider` interface
(`src/data/provider.tsx`). Auth flips the same way: with env set, sign-in/up is
real Supabase Auth instead of demo mode.

## 1 · Create the project

- supabase.com → New project.
- **Region: South America (São Paulo)** — keeps data in Brazil, which is the
  posture we want once real (non-demo) data is involved.
- Save the database password somewhere safe (not needed by the app).

## 2 · Apply the schema (one paste)

SQL Editor → New query → paste **`supabase/setup.sql`** → Run.

That single file is the whole backend: tables, helper functions, **all**
row-level-security policies, the real `nr1_report()` aggregate function
(k-anonymity suppression included), and the 5-protocol catalog seed. It is
safe to re-run. (It supersedes the older `docs/DATA_MODEL.sql` +
`docs/AUTH_POLICIES.sql` pair, which had to be run in a specific order and
was missing the write policies.)

**Optional demo data:** run **`supabase/seed_demo.sql`** next. It creates the
"Aurora Tech" tenant and a synthetic 65-employee population across 4 quarterly
cycles, so the employer NR-1 dashboard shows a full living report immediately
(including the under-k suppressed teams).

## 3 · Auth settings

- Authentication → Sign In / Up → Email: **disable "Confirm email"** while
  testing (otherwise sign-up returns no session and the app tells you so).
- Create the two privileged accounts by hand (they have no self-signup in the
  app, by design): Authentication → Users → **Add user** (auto-confirm):
  - `admin@goodloop.app` → then run the admin binding statement at the bottom
    of `seed_demo.sql`
  - `camila@aurora.co` → then run the HR binding statement (links her to the
    Aurora Tech tenant)
- B2C users and therapists sign up **in the app** — their profile/therapist
  rows are created by the sign-up flow itself. Therapist approval
  (pending → approved) is done from the admin console or the dashboard.

## 4 · Point the app at the project

Local: in `goodloop-app/.env.local`
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```
(Project Settings → API.) Restart `npm run dev`. Unset both to go back to mock.

Vercel: Settings → Environment Variables → add the same two → **Redeploy**.

## 5 · Verify each journey (5 minutes)

1. **B2C**: sign up with a fresh email → complete a session → it appears in
   Progress (that's a real `sessions` row now).
2. **Employee check-in**: submit the quarterly assessment → row lands in
   `psychosocial_responses`.
3. **Employer** (`#employer`): sign in as `camila@aurora.co` → the NR-1 report
   renders from `nr1_report()`; small teams show the 🔒 suppression.
4. **Therapist** (`#therapist`): sign up with name + CRP → account starts
   *pending*; approve it in the admin console; add a patient; run a session.
5. **Admin** (`#admin`): sign in as `admin@goodloop.app` → catalog shows the 5
   seeded protocols; credential queue shows the pending therapist.

## Notes

- **RLS is the privacy model.** HR has *no* SELECT on any employee table — the
  dashboard can only call `nr1_report()`, which returns aggregates with k=5
  suppression. The same boundary as the mock, now enforced by Postgres.
- **WebRTC signalling**: `createRealtimeSignaling()` (Supabase Realtime, a
  channel per session) is implemented in `src/b2b/webrtc/signaling.ts`. The
  monitored-session demo still uses the in-tab loopback; the two-device call
  (therapist + patient join screen) is the next slice and will consume it.
- **Generated types**: rows are mapped as `any`; run
  `supabase gen types typescript` later for end-to-end typing.
- **ElevenLabs proxy**: before public release, move the TTS call behind a
  Supabase Edge Function so the key stops shipping to the browser.
