# Good Loop — Full platform review & requirements list
**Review date:** 8 July 2026 · **Verified against:** strict `tsc` (0 errors, 78 source files) + production `vite build` (144 modules, clean) + file-level journey walkthroughs of every slice.

Status legend: ✅ built & verified in this review · 🔴 launch-blocking · 🟠 required for the corporate pilot · 🟡 post-pilot.

---

## PART 1 — Stories already built (verified)

### Epic A — B2C onboarding & first session (Module 1)
- ✅ A1. Welcome → MicroIntake → StereoCheck → ImmersivePlayer → PostSession flow (state machine in `app/Onboarding.tsx`)
- ✅ A2. First session always the 6-min Quick "WOW"; duration question sets a later preference (FN routing in `pickFirstProtocol`)
- ✅ A3. Emoji mood check with hidden VAS — clinical value never shown as a number (RN-UX-04, `lib/vas.ts`)
- ✅ A4. Placeholder ambient bed with graceful fallback when a version has no rendered `audioUrl`
- ✅ A5. Post-session VAS delta capture; session recorded through the data layer

### Epic B — B2C returning-user app shell (per 08 spec)
- ✅ B1. Four-tab shell: Session / Progress / Explore / Profile (`src/app/`)
- ✅ B2. Home single-CTA + Quick Start + "Compose your own" entry into the Session Composer
- ✅ B3. Progress dashboard: 3-month journey, mood trend, session history
- ✅ B4. Explore two-tap guided filter (feeling × duration → session)
- ✅ B5. Profile: reminder cadence UI, language UI, LGPD export/delete entry points (UI stubs — see NS-04)
- ✅ B6. Session runner records completed sessions with pre/post VAS via `DataProvider.recordSession`

### Epic C — Employee psychosocial assessment → NR-1 aggregates
- ✅ C1. 11-item quarterly questionnaire on COPSOQ/HSE-style dimensions (`employer/assessment.ts`), Likert UI with progress
- ✅ C2. Pure `aggregate()` function: overall band, per-dimension splits, outcome prevalence with cycle-over-cycle delta, per-team k-anonymity suppression, high-risk trend
- ✅ C3. Deterministic seeded population so the dashboard is populated on first open; a new submission visibly moves the live numbers (end-to-end verified loop)
- ✅ C4. Anonymity messaging shown to the employee before and after submission

### Epic D — Employer (HR) NR-1 dashboard
- ✅ D1. `#employer` route gated to the `hr` auth mode; separate gate from B2C/B2B/admin
- ✅ D2. Aggregates-only `Nr1Report` type — no individual records can reach the client by construction (LGPD + NR-1 load-bearing model)
- ✅ D3. K-anonymity: any team group under `minCellSize` renders as "Hidden — group under k 🔒"
- ✅ D4. Response rate, overall risk split, eight-dimension ranking, outcome prevalence with deltas
- ✅ D5. Dependency-free SVG high-risk trend chart
- ✅ D6. Schema side: `psychosocial_responses` table with RLS and **no HR SELECT policy**; access only via the `SECURITY DEFINER` `nr1_report()` RPC (body must still be finalized — NS-02)

### Epic E — B2B clinician console (telemedicine MVP)
- ✅ E1. Therapist credentialing screen; CRP identity chip in the top bar
- ✅ E2. Patient roster with linked-account badge; patient card with goals, scores, consents, B2C self-practice history
- ✅ E3. Editable patient records (`PatientEdit` + `updatePatient` on the data layer, immediate refetch)
- ✅ E4. Clinical wizard: protocol picker sourced from the **admin catalog (enabled only)**, goal presets, green/red pre-launch checklist including active-consent gate
- ✅ E5. Monitored session: 3-panel layout, phase timeline, INTERVENE (two-way audio state + timestamped auto-note), rapid notes, demo/full-length toggle
- ✅ E6. Debrief → generated session report → CRP sign-off → `recordB2bSession` writes onto the patient history
- ✅ E7. Missing-protocol crash guard: session resolves unknown codes with a safe fallback instead of a non-null assertion

### Epic F — Live video (WebRTC)
- ✅ F1. Real `getUserMedia` camera/mic acquisition with denied / insecure-origin / no-device states and retry
- ✅ F2. Real `RTCPeerConnection` pair negotiating real SDP + ICE; candidate buffering with flush after remote description (prevents the classic early-candidate failure)
- ✅ F3. `Signaling` interface seam — in-memory loopback pair for the offline demo; call code is transport-agnostic
- ✅ F4. Simulated patient feed as an animated canvas stream flowing through the actual connection (visibly live: motion + clock)
- ✅ F5. Cam/mic toggles via `track.enabled`; hangup tears down peers/canvas/RAF but keeps the camera for reconnect; full teardown on unmount
- ✅ F6. Connection-state pill (idle / connecting / live / failed) + retry; "two-way audio open" indicator during INTERVENE

### Epic G — Admin console & content pipeline
- ✅ G1. `#admin` route with its own auth gate and role; sidebar shell with section router
- ✅ G2. Overview with live count tiles
- ✅ G3. Data-backed protocol catalog: enable/disable, source (seed/imported), tenant scope, audio-ready flag — catalog is the B2B prescription source of truth
- ✅ G4. Content-import pipeline: upload → parse (CSV/TSV/JSON, RFC-4180-ish with quoting) → per-row validation with blocking vs warning issues → review/edit titles → selective publish → in-session runtime registration
- ✅ G5. Therapist credential queue: approve / request info / reject, 48h SLA flag
- ✅ G6. Companies (corporate tenants): list, create, pause/resume
- ✅ G7. Users & roles: role select, activate/deactivate
- ✅ G8. Append-only audit log recording admin actions

### Epic H — Audio engine, Composer, Studio, TTS
- ✅ H1. Sound Studio multitrack editor (desktop ≥1024px): track lanes for the GL layers (binaural / soundscape / breath / voice), place/move/trim clips with live waveforms, mute/solo/volume, mixed transport, WAV mixdown; binaural stays stereo through playback and export
- ✅ H2. Session Composer "easy mode": focus / length / soundscape / brainwave / voice / intensity presets → live preview → Export WAV → **Open in Studio** seeded with the same bed (handoff singleton) → **Use for this session**
- ✅ H3. Composer shared by B2C (home) and B2B (wizard step)
- ✅ H4. TTS provider chain: ElevenLabs → Azure (pt-BR neural) → browser preview, env-selected, lazy, no network until requested; renders real voice into the Studio voice clip
- ✅ H5. B2C player + monitored-session player share `SessionPlayer` (pre-rendered file with synth fallback)

### Epic I — Data layer, auth & schema
- ✅ I1. `DataProvider` seam: all 21 methods, every screen reads/writes through async hooks — verified **full parity** between the mock and Supabase implementations (programmatic diff, zero missing methods)
- ✅ I2. Shared in-memory mock singleton across B2C/B2B/admin/employer in one tab; live B2C↔B2B link (self-use session pushes into linked patient `p1`, resets inactivity)
- ✅ I3. Supabase provider: snake_case→domain mappers, sessions/patients/catalog/admin/psychosocial writes matching `DATA_MODEL.sql` (spot-checked column-by-column on `sessions`)
- ✅ I4. Auth: demo mode (any creds, localStorage session) ⇄ Supabase email+password with role provisioning (profiles row + therapists row for clinicians), auto-selected by env; four gate modes (b2c / b2b / admin / hr)
- ✅ I5. Schema: 14+ tables, RLS enabled on all clinical tables, ownership policies, `is_admin()` policies, LGPD granular consents table, `AUTH_POLICIES.sql` self-service policies
- ✅ I6. Brand re-skin: Fragment Sans + TT Commons Pro self-hosted woff2, brand palette in `:root` cascading across all surfaces

---

## PART 2 — Next steps

### 🔴 Launch-blocking (fix before any production build / pilot)
- **NS-01. `npm run build` fails — FIXED IN THIS DELIVERY.** `tsconfig.node.json` combined `composite: true` with `noEmit: true` (TS6310), so `tsc -b` — and therefore the build script — exited 1. Fixed to declaration-only emit into `node_modules/.tsout`; `tsc -b` verified exit 0. Overwrite the file from this zip.
- **NS-02. Finalize the `nr1_report()` SQL function.** The body in `DATA_MODEL.sql` is marked illustrative and contains a placeholder `join … on false` where the consent gate belongs — in Supabase mode the employer dashboard returns nothing. Port the mock's `aggregate()` logic (the stated reference) into real plpgsql, including the per-respondent 'aggregates' consent join and k-suppression.
- **NS-03. Capture the 'aggregates' consent in the assessment flow.** The SQL gates inclusion on consent, but the client never collects it — add an explicit consent step/checkbox to the assessment (and persist it to `patient_consents` / an equivalent employee consent record).
- **NS-04. Make LGPD export & deletion real.** Profile's "Export my data (PDF)" and "Delete account & all data" only show a toast. Deletion must actually purge (or queue purge of) the user's rows; export should produce a real file. Required under LGPD Art. 18 for a Brazilian corporate pilot.
- **NS-05. Proxy TTS keys server-side.** `VITE_ELEVENLABS_API_KEY` / `VITE_AZURE_TTS_KEY` ship in the client bundle. A small edge function/proxy must hold the keys before any non-internal build.
- **NS-06. Production font licences.** PP Fragment (personal-use build) and TT Commons (free-host build) both need commercial licences before public launch.

### 🟠 Pilot-hardening (needed for the corporate pilot — as you've directed)
- **NS-07. Hydrate the runtime protocol registry from the catalog at app start.** Today `getProtocol()` knows only the static seeds plus same-tab imports; with a persistent Supabase catalog, an imported protocol prescribed in the wizard silently falls back to GL-ANX 1.1 in the session/debrief/report. One loader on `DataLayerProvider` ready → `registerProtocols(catalog)`.
- **NS-08. Point B2C at the catalog.** Explore/Home/Onboarding hardcode four seed codes: admin-disabled protocols remain launchable from B2C and imported ones never surface there. Source B2C lists/routing from enabled catalog entries.
- **NS-09. Supabase Realtime signalling for WebRTC.** Implement `createRealtimeSignaling(sessionId, role)` per the sketch in `signaling.ts` (channel per session id); the call code already speaks `Signaling` and needs no change. Add STUN/TURN config for real networks.
- **NS-10. Patient-side session join.** A patient-facing route/screen that joins the same signalling channel and publishes their real camera (replaces the simulated canvas feed), receiving the therapist feed + the session audio.
- **NS-11. Wire composed settings into the live players.** `config.compose` travels into the monitored session but `SessionPlayer` still plays the pre-rendered/placeholder bed. Drive the real-time bed (or a just-in-time render) from the composed parameters — the "session maker → live session" close-out.
- **NS-12. Go live on the data seam.** Create the Supabase project, apply `DATA_MODEL.sql` then `AUTH_POLICIES.sql`, disable email confirmation, set env — provisioning, not construction. Then verify each journey against Postgres (esp. catalog reads, `recordB2bSession`, psychosocial insert).
- **NS-13. Persist Profile settings + micro-intake + full credentialing** to the DB (reminders, language, intake result, therapist onboarding fields per the 08.1 B2B onboarding spec: CPF, CRP regional/number, document upload, approaches, expertise areas).
- **NS-14. B2C↔B2B data merge in production:** wire consent-gated self-use history into the clinician view via the existing `patients.b2c_profile_id` bridge (replaces the demo `p1` hard link).
- **NS-15. Scheduling:** appointments table + booking UI + real "next session" on both the patient card and the B2C home.
- **NS-16. Static CVV-188 crisis footer** in B2C (no logic; thresholds remain a parked open flag requiring clinical input).
- **NS-17. Real pre-rendered audio assets** produced from the protocol scripts for the seeded families; mark `audioReady` in the catalog.
- **NS-18. pt-BR voice selection:** pick the winning ElevenLabs/Azure voice on the ANX family before rendering the asset batch.

### 🟡 Post-pilot / backlog
- **NS-19. Full pattern engine (FN-catalogue):** breathing patterns as a clock for the cycler/refrain (FN-12/27/28), hypnotic stacking echo (FN-14), background whisper loop (FN-15), affirmation cycler variations (FN-16), voice archetypes (FN-04), effects chain (FN-07), access-level enforcement for SUPERVISED/EXPERIMENTAL techniques (FN-18/19, FN-23)
- **NS-20. Textual-content repository (FN-13):** affirmations with IDs, echo keywords, durations, complementary pairs, autogenic formulas — the dependency for stacking/cycling
- **NS-21. XLSX protocol template import** (the 05.2 pipeline: metadata/config/phases/affirmations/timeline sheets → 9 pattern instances), extending today's CSV/TSV/JSON importer
- **NS-22. Timeline builder + preview-from-any-point** in admin (FN-11, FN-20) and project-format output (FN-21 — configuration, not rendered audio)
- **NS-23. Progressive Assessment + Smart Reminders backend** (08 spec remainder)
- **NS-24. Messaging inbox, structured-rapport wizard, granular wizard sliders, training & sandbox** (post-MVP per the 07 annotations)
- **NS-25. Generated DB types** (`supabase gen types typescript`) to remove the `any` row mappers
- **NS-26. Bundle code-splitting** (main chunk 523 KB) + PWA/native wrapper
- **NS-27. Studio polish:** save/load projects, more track types, snapping
- **NS-28. Repo hygiene:** delete the stale `goodloop-admin-slice/` folder from the working directory (its files are older than the main app and would regress the import pipeline, provider, and schema if ever re-applied); exclude `node_modules` from future zips

### Standing non-engineering flags (unchanged)
- Crisis/referral thresholds must be defined with clinical input before real users
- Scientific-claim calibration for ANVISA/CFP; CRP psychologist validation
- Clinic/partner onboarding and LGPD/telehealth compliance posture for the pilot


---

## Addendum — slice delivered 2026-07-08: PDF protocol-document import + audio render

**New built stories (epic G — admin console / import pipeline):**

- **G-IMP-PDF-1 — Protocol-document parsing.** The import wizard now accepts the full "Protocol for Developers" document (`.pdf`, `.txt`, `.md`) in the doc-06 format: invariant parameters, per-version timelines (`Time | Ch | PAT | FN | Event`), affirmation loops, and the CSI affirmations database are parsed into a structured `ProtocolSpec` (`src/admin/protocolDoc.ts`). Verified end-to-end against the real GL-ANX 1.1 document in three shapes — pipe tables, pipe-less text, and a real 8-page PDF via pdf.js — all parsing identically (26/40/54 events, 30/54/56 voice lines, loops, bilateral and binaural-transition plans, 20 affirmations, zero issues).
- **G-IMP-PDF-2 — PDF text extraction.** `src/admin/pdfText.ts`, pdf.js loaded lazily (separate chunk; main bundle unaffected). New dependency: `pdfjs-dist` — run `npm install` once after applying this slice.
- **G-IMP-PDF-3 — Review & publish with spec.** `src/admin/SpecImport.tsx`: parsed-spec review (invariants, per-version phase chips with loop tooltips, parser warnings), publish to the catalog with the full spec attached (`CatalogProtocol.spec`; `protocols.spec jsonb` added to DATA_MODEL.sql additively; Supabase provider maps it).
- **G-IMP-PDF-4 — Audio render from spec.** `src/admin/renderProtocol.ts`: offline-renders any version to 44.1 kHz / 16-bit stereo WAV — binaural layer with the documented band transitions (Deep: Alpha→Theta at 11:55, back at 21:45) and invariant fades, soundscape bed, breathing cue in breathing phases, PAT-05 bilateral blips (400 Hz / 120 ms / every 3–4 s, alternating L/R), and every spoken line plus the affirmation loops synthesized via the active pt-BR TTS provider and panned per channel (whisper lines attenuated). 90-second preview or full render, WAV download, then "Mark audio ready".

**Next-steps status changes:**

- **NS-07 (catalog → runtime registry hydration): DONE.** `DataLayerProvider` hydrates the protocol registry from `listProtocols()` on startup, so imported protocols resolve in fresh sessions on persistent backends.
- **NS-21 (XLSX authoring template): still open** — the PDF path now covers the founders' document format directly; XLSX remains the structured bulk-authoring route.

**Honest limits of the renderer (documented, not blockers):** the music layer is approximated by the soundscape synth (no FN-11 library files yet — see NS-17); voice archetype parameters (Hz/wpm/reverb) are not applied to TTS output; PAT-06 echo/whisper stacking layers are not separately synthesized — voice lines render at the documented pan and whisper levels. Voice synthesis requires an ElevenLabs/Azure key (docs/TTS_SETUP.md); the browser TTS is preview-only, so without a key the render is bed-only and lists the skipped lines.
