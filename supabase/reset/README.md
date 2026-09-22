# Resetting the people, keeping the product

Clears the accounts and companies that have accumulated in a database and
leaves one demo company, one demo clinician and one demo person behind.
Protocols, audio, shelves, operator settings and the admin account are never
touched.

Everything happens in the Supabase dashboard. You will not need a terminal.

---

## Before you start

**1. Confirm which project you are about to change.** Open `.env.local` in the
repo and look at `VITE_SUPABASE_URL`. The project you open in
[supabase.com/dashboard](https://supabase.com/dashboard) must be that one.

**2. Take a copy of the things that matter.** The scripts do not delete them,
but a five-minute export costs nothing:

> Table Editor → `protocols` → the **⋯** menu top right → *Export as CSV*.
> Repeat for `explore_rails` and `app_settings`.

**3. Run `supabase/setup.sql` once.** SQL Editor → *New query* → paste the
whole file → **Run**. It is safe to re-run, it contains everything the older
numbered scripts added, and it includes two fixes from this week that the
database needs: the missing booking functions, and the `hr_admin` role the app
has been writing at sign-up since the employer dashboard shipped.

---

## The five steps

Each script is one file. Open it, select all, paste into a **new query** in the
SQL Editor, press **Run**. Do them in order and read the output of each before
moving on.

> **The editor shows only the last result.** If you paste several queries into
> one Supabase tab, you see the output of the last one and the others vanish.
> Every script here is written around that: the dry run and the check are a
> single query, and the wipe ends with its own summary. Run one file per tab.

### Step 1 — Look before you delete · `1-dry-run.sql`

Deletes nothing. Returns one table in four blocks:

```
=== WOULD BE DELETED ===        people, therapists, patients, appointments,
                                companies, logins — with counts
=== WOULD BE KEPT ===           PROTOCOLS, shelves, audio tags, operator
                                settings, audit trail, admin profiles
=== ADMINS THAT SURVIVE ===     one line per admin account
=== PROTOCOLS LIMITED TO ONE COMPANY ===
```

Two things to check before going on:

- the admins block lists `admin@goodloop.app`;
- the last block says **"none — every protocol is visible to all tenants"**.
  If it names protocols instead, stop and say so: those would become invisible
  to everyone once their company is deleted.

### Step 2 — Delete · `2-wipe.sql`

The only destructive script. It refuses to run if no admin profile exists, and
it is a single transaction, so a failure half way leaves the database exactly
as it was. Its final query should show: profiles = your admins only, companies
= 0, and **protocols unchanged** from what step 1 reported.

### Step 3 — Create the three logins (dashboard, not SQL)

> Authentication → Users → **Add user** → *Create new user*
> Turn **Auto Confirm User** ON, or the account cannot sign in.

| Email | Who they are |
|---|---|
| `demo@goodloop.app` | the person using the app |
| `terapeuta@goodloop.app` | their clinician |
| `hr.demo@goodloop.app` | the company's HR contact |

Give all three the same password so a demo is one thing to remember, and change
it after any demo where someone watched you type it.

### Step 4 — Build the demo · `../7-demo-user.sql`, then `3-demo-company.sql`

`7-demo-user.sql` (one folder up) creates the person and the clinician as they
should look on stage: several weeks of session history, a prescribed plan,
measurements over time, and an appointment coming up, both on the demo company.
It reads the two logins you just made.

`3-demo-company.sql` then adds the employer side: the HR profile, the
clinician's place on the company's bookable list, and a spare activation code
so "a therapist joins a company list" can be shown live.

That code matters: `DEMO-2026-GL` is the one the app resolves to *Self Use +
Professional Support*. On any other code the Terapeuta tab shows "your plan
does not include professional support" and there is nothing to demonstrate.

### Step 5 — Check · `4-verify.sql`

Four rows of people (admin, person, clinician, HR), protocol counts identical
to step 1, and an upcoming appointment. Then sign in and look:

| Where | Sign in as | What should be there |
|---|---|---|
| the app | `demo@goodloop.app` | the library, and a Terapeuta tab with the clinician, the plan and the next session |
| `/#therapist` | `terapeuta@goodloop.app` | a roster with the demo person on it |
| `/#hr` | `hr.demo@goodloop.app` | participation figures and the clinician on the company list |
| `/#admin` | `admin@goodloop.app` | every protocol, exactly as before |

---

## If something looks wrong

- **"Email confirmation is ON"** at sign-up — Authentication → Sign In /
  Providers → Email → turn *Confirm email* off, then try again.
- **"Unknown company code"** at sign-up — the `companies` row is missing. Run
  `3-demo-company.sql`.
- **The clinician sees the credential upload instead of a roster** — their
  `therapists.status` is not `approved`. `3-demo-company.sql` sets it.
- **"No free times in the next three weeks"** on the booking screen — the
  clinician has no availability. `../7-demo-user.sql` publishes Tue/Thu hours;
  re-run it, or set them in the workspace under Calendar → Manage availability.
- **Anything unexpected before step 2** — stop. Nothing has been deleted yet.
