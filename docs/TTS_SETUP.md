# Voice (TTS) setup

The Sound Studio's **Voice** track can speak real guidance. Select a voice clip
in the inspector, type the affirmation, then:

- **▶ Preview** — hear it immediately. Works with no keys (browser voice).
- **✓ Synthesize into clip** — render real voice into the clip so it layers with
  the other tracks and lands in the WAV export. Needs an API key (below).

With no key set, Preview still works but Synthesize is disabled — the panel says
so. Pick **one** engine.

## ElevenLabs (preferred — most natural pt-BR)

1. Create a key at elevenlabs.io (Profile → API key).
2. Pick a voice and copy its **Voice ID** (Voices → the voice → ID).
3. In `.env.local`:
   ```
   VITE_ELEVENLABS_API_KEY=your-key
   VITE_ELEVENLABS_VOICE_ID=the-voice-id
   ```
   The multilingual model auto-detects pt-BR from the text.

## Deploying the keys to Vercel

Vite bakes `VITE_*` variables in at **build time**, so on Vercel they are set as
project environment variables (not pasted into the code):

1. Vercel dashboard -> your project -> **Settings -> Environment Variables**.
2. Add `VITE_ELEVENLABS_API_KEY` and `VITE_ELEVENLABS_VOICE_ID`
   (and `VITE_DEFAULT_LOCALE=it` for the Italian PO deployment).
3. Apply to the environments you deploy (Production / Preview).
4. **Redeploy** — existing builds don't pick up new variables.

Reminder: any `VITE_*` value ships inside the browser bundle. That's acceptable
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
