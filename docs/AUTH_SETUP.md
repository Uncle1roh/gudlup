# Auth setup (email + password)

Good Loop uses Supabase Auth. With no Supabase env vars set, the app runs on the
in-memory mock and **shows no login screen** — exactly as before. Auth turns on
automatically once you point the app at a real Supabase project.

## What it does

- **B2C** (`/`) — a consumer signs up / signs in, and a `profiles` row with role
  `b2c_user` is created. Their sessions are scoped to that profile.
- **B2B** (`/#therapist`) — a clinician signs up with name + CRP. A `profiles`
  row (role `therapist`) **and** a `therapists` row (status `pending`) are
  created. Approval is a privileged step done from the Supabase dashboard.
- **Studio** (`/#studio`) — left ungated; it's an internal authoring tool.
- Auth and the data layer share **one** Supabase client, so a single sign-in
  authenticates every query.

## Turn it on

1. Create a project at supabase.com.
2. SQL editor → run **`docs/DATA_MODEL.sql`**, then **`docs/AUTH_POLICIES.sql`**.
   The second file is required — without it, sign-up and profile lookups are
   blocked by row-level security.
3. **Auth → Providers → Email**: keep *Email* enabled and turn **Confirm email
   OFF** while testing. (With confirmation on, sign-up returns no session and the
   profile row can't be created — the app surfaces a clear error if this happens.)
4. Project settings → API: copy the **Project URL** and the **anon public** key.
5. Copy `.env.example` → `.env.local` and set:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
6. `npm run dev`. You'll now get a sign-in screen on the consumer and clinician
   routes. Create an account to proceed.

## Notes

- A brand-new clinician sees an **empty roster** in Supabase mode — the demo
  patients live only in the mock. That's expected: it's a real, empty account.
- To approve a clinician: Supabase dashboard → table editor → `therapists` →
  set `status` to `approved` (there's deliberately no client-side control for
  this).
- Magic-link or OAuth can be swapped in later with no data-model change — the
  `profiles.auth_uid` mapping stays the same.
- Sign-out lives in the B2C **Profile** tab and the B2B top bar (both hidden in
  mock mode).
