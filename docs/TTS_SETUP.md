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
