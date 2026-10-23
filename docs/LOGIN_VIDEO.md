# The loop behind the sign-in form

The desktop half of the door (`.auth__stage`, from 900px) plays a muted,
looping video. It is decoration: it carries no words, nothing depends on it,
and it is not rendered at all below 900px or for somebody whose system asks
for reduced motion.

## What is committed

| File | What it is |
|---|---|
| `public/media/login-loop.mp4` | what the browser loads — 1440px wide, no audio, ~1.1 MB |
| `public/media/login-loop.jpg` | the poster, ~23 KB |

Both are build output from a master that is **not** in this repository.

## Why the master is not committed

The master this one was made from — `videos/loop_login.mp4` — is 78 MB: 4K,
30 fps, 36 Mbit/s, with an AAC audio track nobody will ever hear, because the
element is muted and must be (a browser will not autoplay anything else).

That is close to GitHub's hard 100 MB per-file limit, it would sit in every
clone forever, and no build step reads it. `videos/` is in `.gitignore`.
Keep masters wherever the other masters live.

**It is also not a thing to put in front of somebody trying to sign in.** At
36 Mbit/s the first second of the page costs more than the entire rest of the
app. The encode below is 1.5% of the size and, scaled into a panel that is
never wider than about 1000 CSS pixels, indistinguishable.

## Replacing it

Put the new master at `videos/loop_login.mp4` and run:

```bash
ffmpeg -i videos/loop_login.mp4 -an \
  -vf "scale=1440:-2" \
  -c:v libx264 -profile:v high -preset slow -crf 30 \
  -g 60 -pix_fmt yuv420p -movflags +faststart \
  -y public/media/login-loop.mp4

ffmpeg -i public/media/login-loop.mp4 -frames:v 1 \
  -vf "scale=720:-2" -q:v 6 -y public/media/login-loop.jpg
```

What each part is for, since the numbers are not arbitrary:

- **`-an`** drops the audio. Autoplay without a gesture is only allowed for
  muted video, so the track could never be heard; it is weight and nothing
  else.
- **`-vf scale=1440:-2`** — the panel is at most ~1000 CSS pixels wide, and
  `-2` keeps the height even, which H.264 requires.
- **`-crf 30`** is the quality dial: lower is better and bigger. 30 is high
  for foreground video and right for something behind a scrim. Check the
  result before trusting a different number.
- **`-movflags +faststart`** moves the index to the front of the file so the
  video starts on the first bytes instead of the last.
- **`-g 60`** puts a keyframe every two seconds, which is what makes the
  loop seam cheap.

Aim for **under 2 MB**. Past that, reconsider: this plays before anybody has
signed in, on whatever connection they happen to be on.

## The frame to compose for

The panel is tall — roughly 860×900 on a 1440px window — and the video is
16:9 with `object-fit: cover`, so **the sides are cropped away**. Anything
that matters belongs in the middle third. Nothing may depend on reading the
edges.

A scrim sits over it (`.auth__stage__scrim`): a dark wash deepening towards
the form on the Self Use door, a light one on the clinician, employer and
admin doors. It is there so the two halves read as one product rather than a
photograph next to an app, and so the type in the form is never competing
with a sky. A new video is seen through it — judge it in the browser, not in
a player.

## Reduced motion

`AuthScreen` reads `prefers-reduced-motion` once and simply does not render
the `<video>` when it is set. CSS cannot stop playback, and a seventeen-second
drift behind a password field is exactly what that setting is asking not to
see. The poster stays, as the stage's background image.
