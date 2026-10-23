# Good Loop — Access Matrix

The access model from the 08 UX spec, made concrete. This is what the row-level
security policies in `DATA_MODEL.sql` enforce, and what the data-access layer
(`src/data/`) is shaped around. **Access is a database concern, not a UI concern**
— the screens never decide who can see what; they just ask the provider.

## Roles

| Role | Who | Surface |
|------|-----|---------|
| **B2C user** | Self-use app user (may also be a patient — single shared profile) | Consumer app (`/`) |
| **Therapist** | Credentialed CRP/CFP psychologist, admin-approved | Therapist console (`/#therapist`) |
| **Admin / HR** | Company contact for NR-1/PGR compliance | Corporate dashboard (post-MVP) |
| **Good Loop Admin** | Platform operator — catalogue, audio, credentials, switches | `/#admin` |
| **Good Loop Commercial** | Sells to companies, runs campaigns, negotiates partners | `/#sales` |

## Resource × role

`RW` = read+write · `R` = read · `R(own)` = only own rows · `agg` = anonymized aggregates only · `—` = no access

(The commercial role is in a table of its own below: it touches none of the
rows in this one.)

| Resource | B2C user | Therapist | Admin / HR |
|----------|----------|-----------|------------|
| Own profile | RW(own) | RW(own) | RW(own) |
| B2C sessions / VAS | RW(own) | R (their patients, if B2C consent given) | agg |
| Patient record (card) | — | RW (their patients) | — |
| **Clinical notes** | — | RW (their patients) | **—** |
| Assessment scores (DASS-21…) | R(own) | RW (their patients) | agg |
| B2B session + rapid notes | — | RW (their patients) | — |
| Session reports | R(own, on request) | RW (their patients) | — |
| Messages | — | — | — | *(retired: no chat surface in the app; the `messages` table is kept for what was already written)* |
| Consents | RW(own) | R (their patients) | — |
| Clinical events (audit) | — (append only) | — (append only) | agg |
| NR-1 / PGR aggregates | — | — | R (agg) |

## The commercial role (`sales`)

Added when the back-office split in two: the content team publish protocols,
the commercial team sell. `supabase/16-sales-role.sql` is the whole grant, and
`is_sales()` is a function of its own — a commercial account is **not** an
admin and inherits nothing from `is_admin()`, which appears in sixty-odd
policies that all keep meaning what they meant.

| Resource | `sales` |
|----------|---------|
| Companies (rows, codes, seats, status) | RW |
| Add-on plans — **this is the points multiplier** | RW |
| Company ↔ plan subscriptions | RW |
| Challenges and challenge templates (in-app campaigns) | RW |
| What a challenge counted | R |
| Benefits, their tags, their codes, partner products | RW |
| Benefit redemptions (who redeemed what) | **—** |
| Audit events | insert only |
| Economy settings — what a Loop is worth | **—** |
| Catalogue, audio, rails, credentials, feature switches, promo codes | **—** |
| Profiles, patients, sessions, notes, assessments, scores, goals, appointments, psychosocial responses | **—** |

The last row is the load-bearing one, and it is an absence rather than a
restriction: there is no policy for `sales` on any of those tables, which
under row-level security means no row comes back. Somebody selling a contract
has no business reading a clinical note, and that is settled in the database
and not in the sidebar.

Two deliberate omissions worth naming so they are not read as oversights:

- **Benefit redemptions.** The commercial team sees what a partner is costing
  in totals, through the reports. Who redeemed it is a person's.
- **Economy settings.** A campaign spends Loops; what a Loop is *worth* is the
  product's, and changing it to close a deal is not a commercial decision.

## Hard rules (load-bearing)

1. **Therapist isolation** — a therapist can only ever reach rows for patients
   where `patients.therapist_id = current_profile()`. Enforced by RLS, not by
   filtering in the app.
2. **Clinical notes are therapist-only** — never visible to admin, never in any
   aggregate. (`RN-LGPD-08`)
3. **Admin sees no individuals** — no names, no session content, no patient_id.
   Aggregates come from `SECURITY DEFINER` views that group and anonymize; admin
   has no grant on the base PII tables.
4. **B2C→B2B bridge is consent-gated** — a therapist sees a patient's B2C history
   only when the patient granted the `sharing` consent.
5. **Clinical events are immutable** — append-only; no UPDATE/DELETE. Each carries
   a hash + timestamp for compliance proof (NR-1 / PGR).
6. **Health data is sensitive under LGPD** — encryption at rest + in transit,
   data residency in a compliant region, granular revocable consent, and the
   export / delete ("right to disappear") flows already stubbed in the UI.

## Which surface an account may open

Access to DATA is a database concern. Access to a SURFACE is not — RLS can stop
an account writing, but it cannot stop a browser rendering the admin console
around it, and for a while nothing did: the gate asked only whether somebody
was signed in, so any account that could log in anywhere could open `#admin`
and read the catalogue, the company list and the audit log off the screen.

`AuthGate` (`src/auth/AuthScreen.tsx`) now reads the account's `role` from its
profile row before the first render of any surface, and one role opens one
surface:

| Surface | Route | Role |
|---------|-------|------|
| Self Use app | `#app` / default | `b2c_user` |
| Therapist workspace | `#therapist`, `#b2b-legacy` | `therapist` |
| Company panel · NR-1 | `#hr`, `#employer`, `#nr1` | `hr_admin` |
| Admin console | `#admin` | `admin` |
| Sound Studio | `#studio` | `admin` **or** `therapist` (it is authoring, and both author) |

An account on the wrong surface is not shown a refusal — it is sent to its own,
because a wrong door is a navigation mistake rather than a permissions one. An
account with no profile row opens nothing and is told to ask the team.

A therapist's surface has a second gate behind the role one: **`therapists.status`**.
The role says the account is a clinician; the status says whether anyone has
checked. Until a reviewer sets it to `approved`, the workspace opens on the
credentials screen — the registration number, the documents submitted so far,
and a way to add the one that was asked for — and **no patient is reachable**
through it. Failing to reach the server counts as not approved: an unreachable
check must not hand out a roster.

The documents live in the private `credentials` bucket under the clinician's own
auth id. Its policies let them write and read that folder, let an admin read
every folder (reviewing them is the point), and let nobody else read anything;
the console opens each one through a signed URL minted on the click. The row is
written by `submit_credentials()`, a SECURITY DEFINER function that can only
ever set the status back to `pending` — a clinician can write their number and
their documents and can never write their own verdict. Changing either re-opens
the review, because the thing that was approved has changed.

Three rules follow from the table:

1. **The admin console has no sign-up.** An account that can read every company
   and every protocol is provisioned by hand in the database, never claimed
   from a form.
2. **The public door creates two kinds of account**, and asks which: a person
   who will listen (`b2c_user`) or a clinician (`therapist`, who also gives a
   CRP/CFP and waits for credentialing). Nothing on any form can create an
   `admin`.
3. **A company panel account is minted against a company code.** An admin
   creates the company in the console, which mints the code; HR registers at
   `#hr` with it, which is what ties the account to the company whose
   aggregates it will read. See `COMPANY_CODES.md`.

## How the app honors this

The screens call a small set of provider methods (`listPatients`, `getPatient`,
`listSessions`, `recordSession`, `recordB2bSession`, `getTherapist`). Today those
resolve against an in-memory mock; in production the same method names resolve
against Supabase, where **RLS does the access enforcement server-side**. Because
the UI only ever sees already-scoped data, swapping the provider changes nothing
about the screens.
