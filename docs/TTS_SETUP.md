# Voice (TTS) setup

The Sound Studio's **Voice** track can speak real guidance. Select a voice clip
in the inspector, type the affirmation, then:

- **▶ Preview** — hear it immediately. Works with no keys (browser voice).
- **✓ Synthesize into clip** — render real voice into the clip so it layers with
  the other tracks and lands in the WAV export. Needs an API key (below).

With no key set, Preview still works but Synthesize is disabled — the panel says
so. Pick **one** engine.

## ElevenLabs (preferred)

The key is **typed in the app, never set in the environment**: Admin →
Dettagli → motore vocale. It is saved in this browser and, for an admin, in the
shared `app_settings` row, so other machines pick it up.

There used to be a build-time key (`VITE_ELEVENLABS_API_KEY`). It was used
whenever a browser had no key saved — a fresh or incognito tab listed that
account's voices and could spend its credits instead of the key the operator
typed. It is no longer read. If it is still set in Vercel → Settings →
Environment Variables, delete it there too (and `VITE_ELEVENLABS_VOICE_ID`,
`VITE_ELEVENLABS_VOICE_ID_M`).

Reminder: a key used in the browser is visible to the browser. That's acceptable
for a closed PO test; before a public release the ElevenLabs call moves behind a
server proxy (e.g. a Supabase Edge Function) so the key never leaves the server.

## Which ACCOUNT speaks — one, fixed in the code

The engine speaks with **goodloop — Giovanni Bartegno** and with nothing else.
It is a constant, `ACTIVE_ACCOUNT_ID` in `src/tts/voiceAccounts.ts`, not a
preference: the panel offers that one account, and the key in force is checked
against its fingerprint on every load.

A key that is not its own — a personal workspace, the legacy account — is
**re-pointed** the moment an admin opens the panel: Giovanni's key (stored in
`app_settings`, admin-only) becomes the key in force and is pushed to the
shared row, so every other machine follows on its next load. If his key is not
in the database, the panel says so in red and asks for it once; it does not
keep rendering on the wrong account as if nothing were wrong.

Why it matters: a voice id belongs to the account that made it. On another
account the ids saved in the protocols do not exist — every line either 400s
or comes back in a voice nobody chose — and the credits are spent on the wrong
bill. The older **Mattia Volpe** account stays in `voiceAccounts.ts` so ids
saved under it still resolve to their twins (`resolveVoiceId`), and it is
never offered and never connected.

## Which model speaks, and why it is a dropdown

Admin -> Dettagli -> motore vocale, under the two voice pickers. It is stored
beside the key and shared the same way, because two operators on two different
models render the same protocol differently.

The setting exists because of one request parameter. ElevenLabs infers the
language **per request**, and a protocol is one request per line, so a line
like `calma` -- Italian, Portuguese and Spanish at once -- is placed by guess.
`language_code` is how you stop the guessing, and
**`eleven_multilingual_v2` is the one model in the catalogue that rejects it**
(422). That model was hard-coded here for a year. It is where the Brazilian
accent on the Italian lines came from, and the stray English and Spanish words
inside the Portuguese ones.

| Model | Tells it the language | Character timings | Stability |
|---|---|---|---|
| `eleven_flash_v2_5` (default) | yes | yes | a dial |
| `eleven_v4`, `eleven_v4_turbo` | yes | yes | 0 / 0.5 / 1 only |
| `eleven_v3` | yes | yes | 0 / 0.5 / 1 only |
| `eleven_multilingual_v2` | **no** | yes | a dial |

Flash v2.5 is the default because it fits this catalogue: the lines are very
short (`pace`, `calma`, `sono al sicuro`), it takes a hard `language_code`, it
serves the character timings the Studio needs to speak a block as one utterance
and cut it apart, and its stability is a continuous dial -- which is what holds
one archetype together over the ~100 generations of a protocol.

v3 and v4 are offered because they are more expressive and may well win a
re-audition, but two of their properties are a poor fit and should be heard
before anything is published: stability is three positions rather than a dial
(0.8 is rounded to 1.0 in `tts/model.ts`, deliberately and visibly), and
ElevenLabs' own guidance is that prompts under ~250 characters come out less
consistently. Every voice line here is far under 250 characters.

**Portuguese is `pt`, not `pt-BR`.** ElevenLabs' language list has one
Portuguese entry, and an unrecognised code is silently ignored -- i.e. back to
guessing. The Brazilian accent comes from the **voice**, which is why the
catalogue carries an Italian and a Brazilian voice for every archetype and the
Studio picks by language.

### If a model refuses something

ElevenLabs does not advertise these differences -- `GET /v1/models` says
nothing about `language_code`, alignment or stitching -- so the table in
`src/tts/model.ts` is this project's reading, and it has been wrong before. A
422 that names a parameter therefore drops that parameter, writes it down
(`gl.tts.unsupported` in localStorage) and retries. A 422 costs no credits, so
a stale row costs one free round trip per browser instead of a dead render
queue. Whatever a model has refused is listed under the dropdown.

## Azure neural voices

1. Create a *Speech* resource in the Azure portal; copy a **Key** and the
   **Region** (e.g. `brazilsouth`).
2. Choose a pt-BR neural voice, e.g. `pt-BR-FranciscaNeural` (warm) or
   `pt-BR-AntonioNeural`.
3. In `.env.local`:
   ```
   VITE_AZURE_TTS_KEY=your-key
   VITE_AZURE_TTS_REGION=brazilsouth
   VITE_AZURE_TTS_VOICE=pt-BR-FranciscaNeural
   ```

Selection order is ElevenLabs → Azure → browser. Restart `npm run dev` after
editing env.

## How to test a method on the ANX family

1. Open `/#studio` (it loads the GL-ANX 1.1 bed).
2. Select the **Voice** clip, type the phase line (e.g. *"Você está em
   segurança. Respire fundo."*), Preview, then Synthesize.
3. Position the clip in the timeline, press play to hear it over the bed, and
   **Export WAV** to capture the composed result.

Pan and clip length re-bake the rendered voice instantly (no re-charge to the
API). Editing the text and pressing Synthesize again replaces the voice.

## ⚠️ Security

These are `VITE_` vars, so the key **ships to the browser**. That's fine for a
closed internal test, but **not for production** — anyone can read it. Before any
public release, move the TTS call behind a server proxy (e.g. a Supabase Edge
Function) that holds the key and returns the audio. The provider interface in
`src/tts/` is the single place to repoint at that proxy.

## Easiest path: paste the keys in the app (no files, no rebuild)

Open the **Sound Studio** (`#studio`) and click the **🎙 microphone button** in
the top bar — or open the **PDF → audio** render screen in the admin console
(the "Engine" row). Paste the ElevenLabs **API key** and **Voice ID**, hit
**Save keys**, then **▶ Test voice** — you should hear the real ElevenLabs
voice speak a pt-BR line, and the badge turns to "Active engine: ElevenLabs".

- Takes effect immediately, in any deployment (local or Vercel), because the
  keys are stored in that browser's localStorage — no `.env`, no redeploy.
- If the test fails you'll see the exact API error (wrong key = 401, wrong
  voice id, quota exceeded) instead of a silent fallback to the robotic
  browser voice.
- `.env.local` / Vercel env keys still work and act as the fallback when
  nothing is saved in the browser.
