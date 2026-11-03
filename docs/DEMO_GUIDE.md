# Good Loop — B2B demo script (full journey)

> ## Giving a demo from the commercial console (2026-11-03)
>
> This is the way to do it in front of a client. Everything below it is the
> older developer-machine walkthrough, still true, still useful for testing.
>
> 1. Sign in to **#sales** with a commercial account.
> 2. In the sidebar, **▶ Fare una demo**. Type the **client's company name**
>    in the field — "Vale Logística", whatever is on the contract. It will be
>    the company on every screen: the dashboard's header, the sponsor line in
>    the profile, the Loops multiplier, the account settings. Leave it empty
>    and the demo company is called Aurora Tech.
> 3. Pick a door: **Utente**, **Terapeuta**, **Impresa**. The bar at the top
>    of each surface moves between them without leaving the demo, and **Esci
>    dall'anteprima** ends it and clears everything the demo wrote.
>
> **One story, three sides.** The person in the app is **Mariana Alves**, an
> employee of the client's company, in treatment with **Dra. Helena Costa**.
> Open the clinician's door and Mariana is in her roster, with her sessions,
> her DASS-21 and her notes. Open the company's door and it is the same
> company, run by **Camila Rocha** in HR. A session finished in front of the
> client on the first screen shows up on the other two.
>
> **Her month is fourteen finished sessions and 198 minutes**, two of them
> stopped early, with a mood calendar and two weekly check-ins — and the
> Loops balance is the arithmetic of exactly those minutes. One list in
> `src/demo/world.ts` feeds the device, the ledger and the clinician's
> record, so the three cannot disagree on screen.
>
> **Nothing real is read or written.** A demo forces the in-memory data
> layer, whatever the deployment is configured with (`src/demo/flag.ts`,
> per tab, in sessionStorage). It no longer needs a deployment of its own or
> `VITE_DEMO_FIXTURES`: the switch is the demo itself.
>
> **Every demo starts clean.** Whatever the last one left behind — a
> half-finished session, a redeemed benefit, another client's company name —
> is cleared when a surface is opened. Moving between the three surfaces
> keeps it: there the state is the demo being given.

Everything below works **offline, with no backend and no API keys**. Mock data lives in
memory and is shared across B2C and B2B for the whole browser session.

## Setup
```
npm install
npm run dev
```
Open the dev URL. Routes:
- `/` or `/#app` → B2C consumer app
- `/#therapist` (or `/#b2b`) → clinician console
- `/#studio` → Sound Studio (desktop ≥1024px)

> Tip: present on a laptop/desktop so the **Open in Studio** step works.

---

## A. The clinician journey (the headline)

1. **Log in.** Go to `/#therapist`. The login screen is prefilled
   (`helena@clinic.demo` / `demo`). Any email + password works — tap **Sign in**.
2. **Roster.** You land on the caseload. Open **Mariana Alves** (she's the patient
   linked to the consumer app — note the **● linked account · live** badge on her card).
3. **Edit the record.** Tap **Edit record**. Change the reason, add/disable a goal, set
   the next appointment, edit clinical notes → **Save changes**. The card reflects it
   immediately (this proves the data layer handles writes, not just reads).
4. **Start a session** → **Start session**. The clinical wizard appears: pick a protocol,
   set a goal, run the pre-launch checklist (stereo, consent, ready). When all green, tap
   **Compose audio →**.
5. **Compose the audio (preset mode).** This is the "easy mode" in front of the Studio —
   no timeline. Choose **Focus / Length / Soundscape / Brainwave**, toggle the **guiding
   voice** and edit the affirmation, set **Intensity**, then **♪ Generate preview** and
   press play. You can **Export WAV**, or:
   - **Open in Studio →** — opens the full multitrack editor *seeded with exactly this
     bed*. This is the "Studio linked to the session maker." (In the Studio you can
     synthesize the real spoken voice once TTS keys are set — see `docs/TTS_SETUP.md`.)
   - **Use for this session →** — carries the composed settings into the monitored session.
6. **Run the monitored session.** Watch the phase timeline, VAS, and rapid notes. (Use the
   **demo ~90s** toggle in the top bar to compress the 24-min session.)
7. **Debrief → Report.** Add observations, generate the session report, **sign** it. Signing
   writes the session back onto the patient's history.

## B. B2C ↔ B2B, live

1. Open the consumer app at `/#app` (prefilled login `demo@goodloop.app` / `demo`).
2. On the home screen tap **Compose your own** → same preset composer → **Start this
   session →**, or just **Start session**. Let it finish.
3. Go back to `/#therapist` → open **Mariana** again. The self-use session you just
   completed now appears under **B2C self-practice**, and the pre-session briefing updates.
   That's the same in-memory database powering both products.

---

## What's demo-grade vs production
- **Login** is a local demo session (localStorage). Real auth is Supabase — set the env
  vars and it activates automatically (`docs/AUTH_SETUP.md`).
- **Persistence** is in-memory for the session (resets on a hard reload of a fresh tab).
  The Supabase data layer is already wired behind the same interface.
- **Composer preview voice** is a placeholder tone; the **real spoken voice** is rendered in
  the Studio via TTS once keys are set.
- The composed parameters drive the **preview, export, and Studio hand-off** today; wiring
  them into the live in-session player bed is a small follow-up.
