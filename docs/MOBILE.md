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

Capacitor's CLI is installed (`@capacitor/cli`, `@capacitor/core`,
`@capacitor/android`) and `capacitor.config.ts` is written. **Android is
generated and committed.** iOS is not: it needs a Mac with Xcode.

### Android — already generated, in `android/`

The project exists and is committed: app id `health.goodloop.app`, name
"Good Loop", the Self Use build bundled, and the permissions the video call
needs declared in `AndroidManifest.xml` with a comment each saying why.

What is committed is the *project* — manifest, icons, gradle, app id. The web
assets inside it (`android/app/src/main/assets/public`) are generated and
ignored; `npm run cap:sync` puts a fresh build there.

To produce an APK you need a JDK 21 and the Android SDK, neither of which is
on the machine this was scaffolded on:

```bash
npm run cap:sync          # build the web app + copy it into android/
npx cap open android      # opens Android Studio; Run builds and installs
```

or without the IDE:

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

**That `JAVA_HOME` line is not optional**, and it is the one thing that will
waste an afternoon. See below.

### The JDK: neither one on this machine works

This cost two builds, so it is written down properly.

The project needs a JDK that **both** the Android Gradle Plugin and Gradle
8.14.3 accept. Two JDKs are installed here and neither qualifies:

| JDK | Where | What happens |
|---|---|---|
| **27** | `C:\Program Files\Java\jdk-27` | AGP dies in `JdkImageTransform` — `jlink.exe` fails on `core-for-system-modules.jar` |
| **25** | Android Studio's bundled JBR | Gradle cannot compile its own scripts: `Unsupported class file major version 69` |

Java 25 is class-file major version 69, and **Gradle only supports running on
Java 25 from version 9.1.0**. The wrapper here is 8.14.3, whose ceiling is
Java 24.

A build *did* succeed on the JBR once, before the media-session plugin was
added. That was luck: the settings script was still compiled in the Gradle
cache, so the Groovy compiler never ran. The first `cap sync` that changed
`capacitor.settings.gradle` invalidated it and the real incompatibility
surfaced. Do not trust a green build that follows a cache hit.

**The fix: build on JDK 21.** It is the LTS that AGP 8.x and Gradle 8.14.3
both target. Installed here as Temurin 21
(`winget install EclipseAdoptium.Temurin.21.JDK`), and with it the APK builds
in about 20 seconds.

* In Android Studio: Settings → Build, Execution, Deployment → Build Tools →
  Gradle → **Gradle JDK** → *Download JDK* → version 21 (Temurin). Studio
  fetches and manages it, and Run works from then on.
* From a terminal, once a 21 exists:

  ```bash
  export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"
  export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
  cd android && ./gradlew assembleDebug
  ```

The alternative — moving the wrapper to Gradle 9.1+ so Java 25 is allowed —
is one line in `gradle/wrapper/gradle-wrapper.properties`, but it drags the
Android Gradle Plugin's own Gradle-9 compatibility into the question. Not
worth it to avoid installing an LTS JDK.

### Installing it on a phone

```bash
export PATH="$PATH:$LOCALAPPDATA/Android/Sdk/platform-tools"
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or copy the `.apk` to the phone and open it (Android will ask about
installing from an unknown source — a debug build is unsigned for the store).

### What the APK was verified to contain

Built and inspected on 6 Oct: 8.2 MB, Gradle 8.14.3, 93 tasks, 71 seconds.

* the Self Use bundle, `index-vCnYAsdU.js`, 1.2 MB — the same file
  `npm run build:app` produces;
* assets referenced **relatively** (`./assets/…`). An absolute path is what
  white-screens a Capacitor app, and `base: './'` is what prevents it;
* **no desktop code.** Every marker that only the desktop components emit —
  `adm-nav__item`, `w-table--roster`, `w-navitem`, `c-kpis`, `mt-worklang`,
  `mt-track`, `pvw__btn` — is absent from the bundle.

Two honest qualifications to that last point:

* the **i18n dictionary** is one module and ships whole, so admin and
  workspace *strings* ("Catalogo protocolli", "Add patient") are in the
  binary as data. No screen can render them;
* the **stylesheet** still carries the desktop rules — roughly a third of
  273 kB of dead CSS. Harmless, invisible, and worth trimming one day.

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

1. ~~**Background audio**~~ and ~~**lock-screen controls**~~ — **done**, via
   `@capgo/capacitor-media-session` behind `src/lib/mediaSession.ts`. One
   interface, two implementations: `navigator.mediaSession` on the web, the
   plugin in the app. `SessionPlayer` did not change.

   Two things to know. The plugin runs a foreground service of type
   `mediaPlayback`, and that service — not the audio element — is what stops
   Android suspending the webview when the screen goes dark. And its own
   manifest declares only `FOREGROUND_SERVICE`; from Android 14 a service
   also needs the permission matching its type, so
   `FOREGROUND_SERVICE_MEDIA_PLAYBACK` is declared in ours. Without that line
   the merged manifest looks right and the service is refused at runtime,
   which reads as "the audio stops when I lock the phone".

   **Not yet confirmed on a device.** It builds and the manifest merges; that
   a twelve-minute session really survives the lock screen is the next thing
   to watch, on hardware.

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
