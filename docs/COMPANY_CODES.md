# Company codes

A company code is the string an employee types once, at registration. It links
their account to a company convention, and the convention decides **whether
therapist-led treatment exists in their app at all**.

It is not a therapist connection code. Keep the two apart:

| | company code | therapist connection code |
|---|---|---|
| reuse | reusable by everyone at the company | single use |
| life | as long as the convention | 72 hours |
| how many | one per company (per convention period) | one active per therapist |
| what it opens | the plan: Self Use, or Self Use **+ Professional Support** | one patient ↔ one therapist link |

Source of truth: `src/data/convention.ts`.

## The demo code

```
DEMO-2026-GL
```

Good Loop Demo · Self Use + Professional Support · valid to 31 Dec 2028.

Type it in the **Company code** field when creating an account (the field is on
the demo door too now). It opens the Therapist tab: booking, video sessions,
prescriptions, and a demo EAP contact for the Safety Gateway.

Two other built-in tenants exist, for the states a demo has to be able to show:

| code | company | plan |
|---|---|---|
| `DEMO-2026-GL` | Good Loop Demo | Self Use + Professional Support |
| `ACME-2026` | Acme Corporation | Self Use + Professional Support (legacy shape, no suffix) |
| `NOVA-2026` | Nova Industries | Self Use only — the *without* Professional Support state |

In demo mode, an account that types **no** code still gets `DEMO-2026-GL` from
the mock data layer, so nothing looks broken by default.

## The shape

```
STEM-YYYY-XX          ACME-2026-9C
```

- **STEM** — the company's first word, A–Z/0–9, up to 8 characters.
- **YYYY** — the year the convention **starts**. Renewal mints a new code, so
  an old code dies with the old convention. That is what makes a leaked code
  self-limiting.
- **XX** — two characters derived from stem + year + rotation, over an alphabet
  with no `I O U 0 1`, because codes get read down a phone line.

`STEM-YYYY` (no suffix) is still accepted — the first conventions were issued
that way and those codes are in use.

## It is also the way in

The code is the company row's primary key (`companies.id`), and an account's
`profiles.company_id` points at it. So one string does three jobs:

1. it identifies the company,
2. **HR registers with it** at `#hr` to open the company panel — that is how an
   `hr_admin` account comes to exist, and how it is tied to one company,
3. an employee types it at sign-up to be linked to their employer.

Creating the company in the admin console is therefore what creates the way in.
The console mints the code with the company (editable before you press Crea),
shows it, and copies it.

One step is still separate: a company created in the console is not yet a
CONVENTION, so Professional Support does not switch on until its convention is
registered as described below. The code works for linking accounts either way.

## Registering one

1. **Mint** — `generateCompanyCode(companyName, startYear, rotation?)`. It is
   deterministic: the employer dashboard and the back office cannot drift.
   `rotation` (any changing value) mints a different code of the same shape, for
   the one case that needs it — a code that leaked and must be replaced without
   the convention changing.
2. **Register** — a code opens nothing until its convention is in the registry.
   Until the tenant table exists, that is the `VITE_COMPANY_CONVENTIONS`
   environment variable: a JSON array of `Convention`, set per deployment.
   Registering a pilot company is an env change, not a release.

   ```json
   [
     {
       "companyId": "pilot-rossi",
       "companyName": "Rossi SpA",
       "code": "ROSSI-2026-K4",
       "type": "self-use-plus",
       "licences": 120,
       "eap": { "provider": "Assistenza Rossi", "phone": "+39 02 000 000",
                "info": "Lun–Ven 9–18" },
       "startsAt": 1767225600000,
       "endsAt": 1798761600000
     }
   ]
   ```

   `startsAt` / `endsAt` are epoch ms. A malformed value is ignored with a
   console warning rather than taking the app down; the built-ins stand.
   An env entry overrides a built-in with the same code.
3. **Hand it out** — the employer dashboard prints it, copies it and mails it.

## When a code stops working

`resolveCompanyCode` returns the convention while it is **active**, and through
the **grace** run-out (to the end of that quarter). After that it returns
`null` — the same answer as an unknown code — so nobody keeps a paid feature by
keeping an old code in their profile. Check a live one with
`conventionStatus(convention)`.

## The second gate: the addresses a company approves

A code is one secret shared with everybody. It travels, and it cannot be taken
back from **one** person: the employee who left on Friday knows the same string
as the one who starts on Monday, and rotating it makes the whole company
re-register. So a company may also keep a list of the addresses it approves.

```
code            which company, and what the convention opens
approved list   who inside it may use that code at all
```

**An empty list changes nothing** — the code alone is the gate, exactly as
before. Adding the first address is what arms the second one.

### Where HR does it

Employer console → **Dipendenti / Colaboradores**. Add one address at a time
(name, email, an optional reference of their own), or import a list: paste one
address per line, or a CSV with name / email / reference columns, or pick a
`.csv` file. An address already on the list is updated and **keeps its current
access** — re-importing an old export never re-admits somebody who was turned
off.

Each row can be turned **off** and back on. Off is the one that matters: the
account that holds the address is unlinked from the company in the same
transaction (`profiles.company_id → null`). The person keeps their account,
their history and their individual use, and loses what the convention opened —
the therapists, the EAP, the licence they consumed.

The panel also prints one aggregate: how many accounts hold the code **without**
being on the list — people who registered before the list existed, or with a
code somebody forwarded. A button disconnects all of them. It is a count and a
button; no names, ever.

### Where it is enforced

In the database, not in the browser:

| | |
|---|---|
| `company_members` | the list. HR reads its own company's rows; every write goes through a function |
| `company_email_status(code, email)` | what the sign-up form asks before an account exists. Answers `OK` / `DENIED` / `NO_ROSTER`, and never distinguishes "unknown" from "turned off", so a code cannot be used to read the list back out one guess at a time |
| `profiles_company_roster_guard` | a trigger on `profiles`. Any write that **gives** an account a company is checked; an existing link is not re-checked, so building a list cannot disconnect anybody by accident |
| `hr_set_member_access` · `hr_remove_company_member` · `hr_revoke_unlisted_members` | the writes, each taking the company from `my_company_id()` and never from the caller |

HR admins and clinicians are not on the list and are not checked against it —
it is about employees consuming licences.

### To switch it on

Run `supabase/25-company-roster.sql` in the Supabase SQL editor. Nothing to
edit, safe to re-run; the same block is in `setup.sql` for a fresh database.
Until it is run, `checkCompanyEmail` answers `no-roster` and every tenant keeps
code-only registration.

## What it does not do

No employee data flows back to the company through the code. A convention is
read by the app, never written by it, and reporting stays aggregate-only with
k-anonymity suppression (NR-1 + LGPD). The approved list is no exception: it
holds what HR typed into it and says nothing about whether an address has an
account, uses the app, or what it did there.
