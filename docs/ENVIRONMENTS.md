# Environments

Three places Good Loop runs, and one rule that holds all of them together:
**a deployment says what it is, and is pointed at exactly one database.**

| | Supabase project | Vercel project | Branch | `VITE_APP_ENV` | Data |
| --- | --- | --- | --- | --- | --- |
| **Production** | `goodloop-prod` | `goodloop` | `main` | `production` | Real people. |
| **Staging** | `goodloop-staging` | `goodloop-staging` | `staging` | `staging` | Fictional. Wiped freely. |
| **Demo** | `goodloop-demo` | `goodloop-demo` | `main` (same code as prod) | `demo` | Fictional. Reset between prospects. |
| **Local** | none (mock) or staging | — | any | `local` | Whatever is in front of you. |

All three Supabase projects live in **São Paulo**, for the same latency and
data-residency reasons production does.

Every environment except production carries a coloured banner across the top
of every screen with the word (STAGING / DEMO / LOCAL) and the database ref
it is pointed at. A deployment that does not set `VITE_APP_ENV` shows a red
**ENVIRONMENT NOT DECLARED** banner. That is deliberate: the alternative is
staging that looks exactly like the real thing.

---

## What you have to do, once, per environment

Claude cannot create Supabase or Vercel projects — they need your account.
Everything below is yours; the rest is already in the repo.

### 1. The Supabase project

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Name `goodloop-staging` (or `goodloop-demo`), region **South America (São
   Paulo)**, generate a strong database password and put it in the password
   manager — not in this repo.
3. Wait for it to finish provisioning.
4. **SQL Editor** → **New query** → paste the whole of `supabase/setup.sql`
   → **Run**. It is safe to re-run and it contains everything the numbered
   scripts add.
5. Still in the SQL editor, run `supabase/seed_demo.sql` only if you want the
   old pasted seed. You do not: `npm run seed` below does the same thing and
   tells you whether it worked.
6. **Project Settings → API**. Copy the **Project URL** and the **anon**
   key — those two go into Vercel. The **service_role** key stays out of
   every file; you will paste it into a shell for one command at a time.

### 2. The Vercel project

1. [vercel.com/new](https://vercel.com/new) → import `Uncle1roh/gudlup` again
   → name it `goodloop-staging`.
2. **Settings → Git → Production Branch**: set it to `staging`.
   This is the whole branch rule: the staging project's "production" is the
   `staging` branch, and the production project's is `main`. Neither can
   deploy the other's branch as live.
3. **Settings → Environment Variables**, for the Production scope of *that*
   project:

   | Name | Value |
   | --- | --- |
   | `VITE_APP_ENV` | `staging` |
   | `VITE_SUPABASE_URL` | the staging project URL |
   | `VITE_SUPABASE_ANON_KEY` | the staging anon key |
   | `VITE_DEFAULT_LOCALE` | `it` |

4. Deploy. Check the banner says **STAGING** and shows the staging ref. If it
   says ENVIRONMENT NOT DECLARED, `VITE_APP_ENV` did not get set.

Repeat both for the demo, with `demo` everywhere and the production branch
left as `main`.

### 3. Fill it

```bash
GL_TARGET_URL=https://xxxx.supabase.co \
GL_SERVICE_KEY=eyJ... \
npm run seed
```

The ref and the key come from step 1.6. It builds Aurora Tech, 121 employees
across six teams — two of them deliberately under k=5 so the anonymity
suppression actually fires — four quarters of psychosocial responses, an
approved therapist, four patients and two appointments. Deterministic: the
same world every time, so a screenshot from last month still matches.

It then prints the logins you must create by hand. **Supabase owns the auth
tables** and writing passwords into them directly breaks in ways that are
hard to see, so: Authentication → Users → Add user, *Auto Confirm User* on,
for `demo@goodloop.app`, `demo-therapist@goodloop.app` and `hr@goodloop.app`.
`supabase/7-demo-user.sql` has the statements that bind them to profiles.

### 4. Reset it, later

```bash
GL_TARGET_URL=https://xxxx.supabase.co GL_SERVICE_KEY=eyJ... npm run reset
```

Clears every account, company, patient, appointment, session and consent —
and **never touches protocols, their audio, the shelves, the operator
settings or the feature switches**. That split is enforced in the code:
`tools/reset.ts` has an explicit list of what it clears, counts the protocols
before and after, and fails if the number moved.

Then `npm run seed` again for a fresh demo.

---

## Keys: which exist where

The rule is that **a production key exists in exactly one place**, and that
place is the production Vercel project's environment variables.

| Key | Lives in | Never |
| --- | --- | --- |
| `VITE_SUPABASE_ANON_KEY` | Vercel env, per project | — it is public by design, protected by row-level security |
| Supabase **service_role** | your shell, for one command | a file, Vercel, a browser, this repo |
| Supabase **database password** | the password manager | anywhere else |
| **ElevenLabs** | the `app_settings` table of each project | see below |

**The ElevenLabs key is the one that needs attention.** It is not an
environment variable: it is typed into the admin console and stored in
`app_settings` on whichever project you are on. So the voice key follows the
*database*, not the deployment — which means:

- Staging and demo need **their own ElevenLabs key**, with their own spending
  cap. Give them a restricted key, or none at all; without one the Studio
  still previews with the browser voice.
- **Never paste the production key into a staging console.** It will render
  against the production account's credits, and anybody with staging admin
  access can then read it.
- Rotating production's key is done once, in the production console.

`VITE_AZURE_TTS_KEY` is a build-time variable and ships to the browser. Treat
it as public; keep the production one in the production project only.

---

## Branch rules

- `main` → production, and **only** by deliberate release. Merging to `main`
  deploys to real people.
- `staging` → the staging environment. This is where every E2E round and
  release check happens.
- Everything else → Vercel previews, which have **no environment variables**
  and therefore run on mock data with a LOCAL banner. That is why a wrong-role
  login or a fake therapist on a preview URL is not a bug.
- The demo project tracks `main`, so a prospect never sees something that has
  not shipped.

Nobody deploys to production from a laptop. `vercel --prod` from a machine
skips the branch rule, and the branch rule is the only thing standing between
a work-in-progress and a real person.

---

## Getting protocols into staging

`npm run seed` does not create protocols: they are months of authored work
and inventing fake ones would make staging a worse test, not a better one.
Two ways to get real ones in:

1. **Export and import.** On production, `npm run backup:studio` writes every
   Studio session as a file (see `docs/STUDIO_BACKUP.md`). On staging, import
   the PLAIN workbook through the admin console, then ⬆ Restore the session.
2. **Copy the rows.** Supabase dashboard → Table Editor → `protocols` → the
   ⋯ menu → *Export as CSV* on production, then *Import data from CSV* on
   staging. Copy `explore_rails` too, or the shelves are empty.

Either way: protocols are **the product**, not data, so copying them from
production to staging is copying code-like material, not real people's
records. Nothing about an employee or a patient ever moves between projects.

---

## Checking you got it right

After setting a new environment up, open it and confirm all four:

- [ ] The banner says the right word and shows the right database ref.
- [ ] Signing in works and the catalogue has protocols in it.
- [ ] Admin console → **Interruttori** lists three switches, all active.
- [ ] `npm run reset` on that project is refused if you give it the
      production ref — test it once, on purpose, so you know the guard works.
