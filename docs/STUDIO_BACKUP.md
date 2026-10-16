# Backing up the Studio work

Everything a PO builds in the Sound Studio — tracks, clips, levels, EQ,
effects, fades, phase windows, and for every voice line its text, its
rendered audio and its voice in all four language variants — lives in one
place: the `protocols` table in Supabase. On 14 October 2026 that place was
not reachable, and the lesson was simple. One copy is not a copy.

This is how to make the second copy, check it is real, and put it somewhere
the database going down cannot touch.

**Time: about fifteen minutes the first time. Two minutes every time after.**

---

## Before you start: the main repository is PUBLIC

`github.com/Uncle1roh/gudlup` is public. Anyone can read it.

A Studio session file holds the protocol's **voice scripts in four language
variants** — the material itself, not a description of it. It must not go
into that repository.

So the backups get a **separate, private** repository of their own. That is
step 1, and it is the only step that needs doing once. `studio-backups/` and
`*.glstudio.json` are in the main `.gitignore` as a net under a stray
`git add .`, but the net is not the plan — the separate repository is.

> Worth deciding separately, when there is time: whether the main repository
> should be public at all. That is a bigger question than this guide and it
> is yours to make. This guide only makes sure the backups are not caught up
> in it.

---

## Step 1 — make the private backup repository (once)

In a browser:

1. Go to **https://github.com/new**
2. Repository name: `goodloop-studio-backups`
3. **Select Private.** This is the step that matters.
4. Tick *Add a README file* so the repository is not empty.
5. **Create repository.**

Then in a terminal, clone it **next to** the app folder, not inside it:

```bash
cd "C:/Users/DELL/Desktop/Good Loop For Developes - Begin Here/files/goodloop-app"
git clone https://github.com/Uncle1roh/goodloop-studio-backups.git
```

You should now have two folders side by side:

```
goodloop-app/
  goodloop-app/              <- the app (public repo)
  goodloop-studio-backups/   <- the backups (private repo)
```

Putting it beside rather than inside is deliberate: nothing in the public
repository can ever accidentally sweep it up.

---

## Step 2 — take the backup

From the **app** folder:

```bash
cd "C:/Users/DELL/Desktop/Good Loop For Developes - Begin Here/files/goodloop-app/goodloop-app"
npm run backup:studio -- ../goodloop-studio-backups
```

It asks for the admin email and password — the same ones you use for the
admin console. The password is not shown while you type it, is not saved
anywhere, and is not written to a file.

What it does: signs in, reads the Studio sessions out of the catalogue, and
writes **one file per session**:

```
Signing in... ok.
Reading the catalogue... 23 protocols.
  GL-ANX-1.1_6min_2026-10-16_09-14.glstudio.json   ·  6 tracks, 41 clips
  GL-ANX-1.1_12min_2026-10-16_09-14.glstudio.json  ·  6 tracks, 78 clips
  GL-ANX-1.1_24min_2026-10-16_09-14.glstudio.json  ·  6 tracks, 151 clips
  ...

31 sessions from 14 protocols
written to ../goodloop-studio-backups/ , with manifest.json beside them.
```

Each file is the same thing the Studio's ⬇ Backup button writes, so any of
them goes straight back in through ⬆ Restore. `manifest.json` lists every
file with its track, clip and voice-clip counts — that is what makes the
backup checkable rather than merely present.

**If it fails:**

| What it says | What to do |
| --- | --- |
| `No Supabase connection found` | `.env.local` is missing or has no `VITE_SUPABASE_URL`. |
| `That email and password were not accepted` | Use the admin console account. |
| `statement timeout` | The catalogue is large — use the SQL route at the bottom of this page. |
| `No saved Studio sessions found` | Either the account cannot read the catalogue, or there is genuinely nothing saved. Check in the admin console. |

---

## Step 3 — check the backup is real

This is the step people skip, and it is the step that decides whether the
backup is worth anything. A backup nobody has opened is a belief.

```bash
npm run verify:studio -- ../goodloop-studio-backups
```

It opens every file with **the same reader the ⬆ Restore button uses**. A
file that passes here is a file that will restore.

```
Checking 31 files in ../goodloop-studio-backups/

  ok  GL-ANX-1.1_24min_2026-10-16_09-14.glstudio.json
      GL-ANX 1.1 · 24 min — 6 tracks, 151 clips (47 voice), saved 13/10/2026, 11:42
  ...

Manifest taken 2026-10-16T09:14:02.511Z from xyzabc: 31 sessions out of 23 protocols.

All 31 files are restorable. 2214 clips in total, 603 of them voice.
```

It also checks that every file in the folder is in the manifest and vice
versa, that the counts match, and that voice clips are filled in all four
variants. **Missing variants are a warning, not a failure** — a protocol
that has not been translated yet is normal, and the warning is there so a
real loss cannot hide behind it.

If it says `PROBLEMS`, the folder is not a complete backup. Run step 2 again.

---

## Step 4 — push it to GitHub

```bash
cd ../goodloop-studio-backups
git add .
git commit -m "Studio sessions, 16 October 2026"
git push
```

Now the work exists in three places: Supabase, this machine, and GitHub.

Each run writes files with a **new timestamp in the name**, so a later
backup sits beside the earlier ones rather than replacing them. That is on
purpose — if something goes wrong and is not noticed for a week, last
week's copy is still there. When the folder eventually gets crowded, delete
old ones by hand; never let a script do it.

---

## Step 5 — test that a restore actually works

Do this **once**, now, on a protocol you do not mind touching. Knowing the
restore works is the whole point of the exercise.

1. Open the admin console → a protocol → a time signature → **Studio**.
2. Press **⬆ Restore** and choose one of the backup files.
3. It shows what is arriving — clip count and when it was taken — and asks
   before replacing what is on screen. Say yes.
4. The session loads. The message says it is **not in the database yet**.
5. Look at it: the clips, the levels, the voice lines.
6. **Do not press Save** unless you actually want to write it back. Press
   ← to leave instead.

That is the whole recovery procedure. If the database ever loses a session,
it is: open the Studio on that protocol and time signature, ⬆ Restore the
file, press 💾 Save.

A few things worth knowing about Restore:

- It never writes to the database by itself. Nothing is overwritten until
  somebody presses 💾 Save.
- It marks the session unsaved on purpose. Restoring is not saving.
- A file from a **newer** Studio than the one you are running is refused
  rather than opened. Opening it would silently drop fields that version
  does not know about, and the next Save would write that loss into the
  database. An older file opens fine.

---

## How often

| When | Why |
| --- | --- |
| **Before any deploy or database change** | So there is a known-good point to come back to. |
| **After a big Studio session** | The work that only exists in one place is the work just finished. |
| **Weekly** | Cheap, and it means the worst case is a week. |

Each run is two commands and about two minutes.

**Before and after a deploy, compare.** Take a backup before, take another
after, and diff the two `manifest.json` files:

```bash
git diff HEAD~1 -- manifest.json
```

A session that disappeared, or one whose clip count fell, shows up as a
changed line. That is the only reliable way to notice a loss — a loss does
not announce itself.

---

## The other route: the SQL editor

`supabase/export-studio-sessions.sql` does exactly the same job from the
Supabase SQL editor. Use it when this machine cannot reach the database,
when Node is not available, or when the catalogue is too large for one
request.

1. Open the Supabase dashboard → **SQL Editor**.
2. Run **SECTION A** — one helper function and one view. Read-only on
   protocols.
3. Run **QUERY 1** — the list of what exists, no payload. Keep the result.
4. Run **QUERY 2** — the files. Press **Download CSV**.
5. Split the CSV into files:
   ```bash
   node tools/split-studio-csv.mjs sessions.csv ../goodloop-studio-backups
   ```
6. Then **step 3** above, the same as always.

If QUERY 2 is too big to pull in one request, **QUERY 3** does one protocol
at a time. A timeout there is a read giving up — never a half-finished
write.

---

## What is in a backup, and what is not

**In it:** the session exactly as the database holds it. Tracks, clips,
levels, EQ, effects, fades, phase windows, master gain, and for every voice
clip its text, its rendered audio path and its voice — in all four variants,
not only the one that was on screen.

**Not in it:** audio files. A clip re-renders from its parameters and a
voice clip re-synthesises from its text or re-fetches its path. The files
are JSON, a few hundred KB each, and readable — if anything ever goes wrong
with the format itself, a session can be recovered by hand.

**Also not in it:** the protocol's timeline Excel, its cover, its public
naming, its tags. Those are not Studio work. The timeline workbooks you
already have as files; the rest is quick to retype. The Studio session is
the part that is months of work and exists nowhere else.

---

## The pieces, for reference

| File | What it is |
| --- | --- |
| `tools/backup-studio.ts` | `npm run backup:studio` — database to files. |
| `tools/verify-studio-backup.ts` | `npm run verify:studio` — opens every file with the Studio's own reader. |
| `tools/studioBackupSet.ts` | Which session belongs to which time signature. Shared by both. |
| `supabase/export-studio-sessions.sql` | The same export from the SQL editor. |
| `tools/split-studio-csv.mjs` | Turns the SQL editor's CSV download into files. |
| `src/studio/sessionFile.ts` | The file format. The ⬇ Backup and ⬆ Restore buttons, and everything above, use this one definition. |
| `tools/test-backup-studio.ts` | 27 assertions over the pipeline. |
| `tools/test-export-roundtrip.ts` | 19 assertions that the SQL route produces files Restore accepts. |
| `tools/test-session-file.ts` | 29 assertions on the format itself. |
