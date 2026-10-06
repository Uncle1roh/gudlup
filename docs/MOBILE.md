# The downloadable app

The app is the **Self Use app** — the sessions people listen to. The Studio,
the admin console, the therapist workspace and the company dashboard stay on
the web, where they belong: the workspace already refuses under 1024px, and
nobody masters a protocol on a phone.

It is **not a second codebase**. It is this same `src`, built as a second
target, wrapped by Capacitor.

```
npm run build        →  dist/      the website, unchanged
npm run build:app    →  dist-app/  the Self Use app, what Capacitor wraps
```

## What makes the two different

One file: `vite.config.ts`.

| | web | app |
|---|---|---|
| command | `vite build` | `vite build --mode app` |
| output | `dist/` | `dist-app/` |
| asset URLs | `/assets/…` | `./assets/…` (loaded off the device) |
| Studio, console, workspace, company | compiled in | **resolved to a stub** |
| `__GL_APP__` | `false` | `true` — App.tsx ignores the hash and renders Self Use |

The desktop surfaces are not merely hidden in the app: `vite.config.ts`
resolves those imports to `src/app-target/desktopOnly.tsx`, so their code is
not in the binary. An app that *can* open an admin console is a finding in
store review and a liability on a lost phone.

Measured, same commit:

```
web      index.js  2,004 kB   (+ xlsx 429 kB)
app      index.js  1,219 kB   (no xlsx chunk at all)
```

**The web build is byte-identical to before any of this existed** — same
content hash, `index-CzDOY4mJ.js`. That is the point: adding the app changed
nothing about the site.

## Running it on a phone

Capacitor's CLI is installed (`@capacitor/cli`, `@capacitor/core`) and
`capacitor.config.ts` is written. The native projects are **not** generated —
they need the platform toolchains, and whether `ios/` and `android/` are
committed is a decision for whoever owns the release process.

**Android** (works from Windows, Linux or macOS; needs Android Studio):

```bash
npm i -D @capacitor/android
npm run build:app
npx cap add android
npx cap open android      # builds and runs from Android Studio
```

**iOS** (needs macOS with Xcode — it cannot be done from this machine):

```bash
npm i -D @capacitor/ios
npm run build:app
npx cap add ios
npx cap open ios
```

After any change to the web code: `npm run cap:sync`.

## What still has to be built

The scaffolding above is done and verified. These are the real pieces of app
work, roughly in the order they matter:

1. **Background audio.** Today `SessionPlayer` (`src/lib/audio.ts`) plays the
   published MP3 through an `<audio>` element. In a webview that stops when
   the screen locks — fatal for an eyes-closed product. The fix is a native
   audio plugin behind the *same* class: `playFile`, `pause`, `resume` and
   `stop` are the whole surface, and the Web Audio synth path (the
   placeholder bed) does not need touching. This is the single most valuable
   change and the reason to build an app at all.

2. **Lock-screen controls and the Now Playing entry** — comes with (1) in
   most plugins, but has to be wired to the session's name and length.

3. **Storage.** The app keeps its state in `localStorage`
   (`gl.selfuse.<id>`, consents, the addressed-as answer). iOS can evict
   WKWebView storage under pressure. Move it to Capacitor Preferences behind
   the accessors in `src/data/selfUseStore.ts` — one module, not a sweep.

4. **Auth.** Supabase works in a webview, but the session token should live
   in secure storage rather than `localStorage`, and password-reset links
   need a custom URL scheme to come back into the app.

5. **The video call.** WebRTC runs in both webviews, but needs camera and
   microphone permission plumbing, and a decision about what happens when a
   call is backgrounded.

6. **Push notifications.** There is already a notifications preference in
   Profile with nothing behind it.

7. **Headphone / audio-route detection**, so the stereo check and the
   "headphones recommended" line can mean something.

8. **Store compliance.** Privacy labels, age rating, account deletion (the
   app has it), and keeping the "mitigation, not therapy" wording consistent
   in the listing — health-adjacent apps get a closer read.

## What this costs you afterwards

Worth saying out loud before committing to it: a bug fix goes from "deploy in
two minutes" to "ship a build and wait for review". Two store accounts, two
release processes, and QA on both web and app for every change. None of that
is a reason not to do it — it is a reason to keep the app to the one surface
that needs to be an app, which is what the split above enforces.
