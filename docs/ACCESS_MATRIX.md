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
| **Good Loop Admin** | Platform operator (credential approval) | Internal |

## Resource × role

`RW` = read+write · `R` = read · `R(own)` = only own rows · `agg` = anonymized aggregates only · `—` = no access

| Resource | B2C user | Therapist | Admin / HR |
|----------|----------|-----------|------------|
| Own profile | RW(own) | RW(own) | RW(own) |
| B2C sessions / VAS | RW(own) | R (their patients, if B2C consent given) | agg |
| Patient record (card) | — | RW (their patients) | — |
| **Clinical notes** | — | RW (their patients) | **—** |
| Assessment scores (DASS-21…) | R(own) | RW (their patients) | agg |
| B2B session + rapid notes | — | RW (their patients) | — |
| Session reports | R(own, on request) | RW (their patients) | — |
| Messages | RW(own thread) | RW (their patients) | — |
| Consents | RW(own) | R (their patients) | — |
| Clinical events (audit) | — (append only) | — (append only) | agg |
| NR-1 / PGR aggregates | — | — | R (agg) |

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

## How the app honors this

The screens call a small set of provider methods (`listPatients`, `getPatient`,
`listSessions`, `recordSession`, `recordB2bSession`, `getTherapist`). Today those
resolve against an in-memory mock; in production the same method names resolve
against Supabase, where **RLS does the access enforcement server-side**. Because
the UI only ever sees already-scoped data, swapping the provider changes nothing
about the screens.
