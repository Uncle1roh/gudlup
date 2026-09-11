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

## What it does not do

No employee data flows back to the company through the code. A convention is
read by the app, never written by it, and reporting stays aggregate-only with
k-anonymity suppression (NR-1 + LGPD).
