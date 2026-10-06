#!/bin/sh
# ============================================================================
# Build the app, put it on the running device, and (optionally) wipe its data.
#
#   sh tools/android-run.sh            build, install, keep existing data
#   sh tools/android-run.sh --fresh    build, install, and CLEAR the app's
#                                      data first — a genuine first run
#   sh tools/android-run.sh --demo     build against the DEMO fixtures
#                                      instead of the real Supabase project
#
# WHICH BACKEND. `npm run build:app` reads .env.local like every other build,
# so by default the app on the phone talks to the real project and needs a
# real account. --demo blanks those two variables for this build only, which
# puts the app on the in-memory fixtures: any email and password sign in, and
# nothing you do touches live data. Neither is wrong; knowing which one is in
# your hand is what matters, and "Invalid login credentials" on a build you
# thought was demo is how an hour disappears.
#
# Written because the cycle is four commands with two environment variables,
# and getting one of them wrong produces an error that looks like a code bug.
# See docs/MOBILE.md for what each of those errors actually means.
# ============================================================================
set -e

APP_ID="health.goodloop.app"
APK="android/app/build/outputs/apk/debug/app-debug.apk"

cd "$(dirname "$0")/.."

# ---- the JDK -------------------------------------------------------------
# Gradle 8.14.3 runs on Java up to 24, and AGP refuses anything newer still.
# Prefer a 21 if one is installed; say so clearly if not.
if [ -z "$JAVA_HOME" ]; then
  for candidate in "/c/Program Files/Eclipse Adoptium"/jdk-21*; do
    if [ -x "$candidate/bin/java.exe" ] || [ -x "$candidate/bin/java" ]; then
      JAVA_HOME="$candidate"
      break
    fi
  done
fi
if [ -z "$JAVA_HOME" ]; then
  echo "No JDK 21 found, and the JDKs this machine ships with cannot build" >&2
  echo "this project (see docs/MOBILE.md, 'The JDK')." >&2
  echo "  winget install EclipseAdoptium.Temurin.21.JDK" >&2
  exit 1
fi
export JAVA_HOME
echo "JDK:  $JAVA_HOME"

# ---- the SDK -------------------------------------------------------------
if [ -z "$ANDROID_HOME" ]; then
  if [ -d "$LOCALAPPDATA/Android/Sdk" ]; then
    ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
  elif [ -d "$HOME/Android/Sdk" ]; then
    ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi
if [ -z "$ANDROID_HOME" ]; then
  echo "No Android SDK found. Open the project in Android Studio once, or set" >&2
  echo "ANDROID_HOME." >&2
  exit 1
fi
export ANDROID_HOME
PATH="$PATH:$ANDROID_HOME/platform-tools"
export PATH
echo "SDK:  $ANDROID_HOME"

# ---- the web app, into the native project --------------------------------
DEMO=""
for arg in "$@"; do [ "$arg" = "--demo" ] && DEMO=1; done

echo
if [ -n "$DEMO" ]; then
  echo "== building the Self Use bundle (DEMO fixtures) and syncing it =="
  VITE_SUPABASE_URL="" VITE_SUPABASE_ANON_KEY="" npm run cap:sync
else
  echo "== building the Self Use bundle (real backend, from .env.local) =="
  npm run cap:sync
fi

# ---- the APK -------------------------------------------------------------
echo
echo "== assembling the debug APK =="
( cd android && ./gradlew assembleDebug )

# ---- onto the device -----------------------------------------------------
DEVICES=$(adb devices | grep -cw "device" || true)
if [ "$DEVICES" -eq 0 ]; then
  echo
  echo "Built: $APK"
  echo "No device or emulator is attached, so nothing was installed."
  echo "Start one (Android Studio → Device Manager) and run this again."
  exit 0
fi

FRESH=""
for arg in "$@"; do [ "$arg" = "--fresh" ] && FRESH=1; done
if [ -n "$FRESH" ]; then
  echo
  echo "== clearing $APP_ID (a genuine first run) =="
  # Wipes the webview's localStorage too, which is where the account's
  # onboarding, consents and the addressed-as answer live.
  adb shell pm clear "$APP_ID" >/dev/null 2>&1 || true
fi

echo
echo "== installing =="
adb install -r "$APK"

echo
echo "Done. Launching."
adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
