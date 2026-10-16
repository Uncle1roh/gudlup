# Undoing a bad release

Three things can be wrong after a release, and they are undone in completely
different ways and at completely different speeds. Deciding **which one** is
the first and most important step, because the fast fix for one is useless
for the others.

| What is wrong | What to do | How long |
| --- | --- | --- |
| One area is broken — the player, booking, the video call | **Switch it off.** Admin console → Interruttori. | ~10 seconds |
| The code is bad — a screen throws, a flow is wrong | **Roll back the deployment.** Vercel → Instant Rollback. | ~30 seconds |
| The database is wrong — a migration, a bad write | **Restore from backup.** Supabase → Database → Backups. | 10–40 minutes, and it loses data |

Always try them in that order. A switch costs nothing and is reversible; a
deployment rollback is cheap and reversible; a database restore loses every
write since the backup and cannot be undone.

---

## 1. Switch the area off — 10 seconds

Admin console → **Interruttori** → **Spegni** on `Player`, `Prenotazioni` or
`Videochiamata`.

Every app picks it up within a few seconds. No build, no deploy. People see
"temporarily unavailable" with a line saying what is and is not affected —
not an error screen, because an error invites a retry and retrying will not
help.

This is the right first move even when you intend to roll back as well: it
stops the bleeding while the rollback builds.

**If the console itself is unreachable**, the switch lives in the database
and the database is the thing that is broken. Then set `VITE_FEATURES_OFF` in
the production Vercel project (`player`, `booking`, `video`, comma-separated)
and redeploy. That path needs a deploy, which is why it is second.

---

## 2. Roll the deployment back — 30 seconds

1. [vercel.com](https://vercel.com) → the **goodloop** project → **Deployments**
2. Find the last deployment that was good. The list shows the commit message
   and time; the one currently live is marked *Current*.
3. ⋯ → **Instant Rollback** → confirm.

It is instant because the previous build is still on the CDN — nothing is
rebuilt. The commit stays in `main`; only what is being served changes.

**Then fix forward.** A rollback is a pause, not a resolution: the next
merge to `main` deploys again and will re-deploy the bad code unless it has
been fixed or reverted. Either `git revert <sha>` and push, or fix and push.

**What a rollback does NOT undo:** anything already written to the database.
If the bad release wrote wrong rows, rolling back the code stops it writing
more and leaves what it wrote. That is case 3.

---

## 3. Restore the database — 10 to 40 minutes, and it costs data

This is the one that hurts, so it has its own decision first: **restoring
loses every write made since the backup.** Appointments booked, sessions
listened to, consents given, Studio work saved. If the damage is narrower
than that, repair the rows by hand instead.

Before anything:

1. **Switch the affected areas off** (step 1), so nothing new is written.
2. **Take a Studio backup if the database is still readable** —
   `npm run backup:studio` — because that is the work that cannot be
   recreated. See `docs/STUDIO_BACKUP.md`.
3. Write down the time you believe the damage started. You will need it.

Then: Supabase dashboard → **Database** → **Backups** → pick the point in
time → restore. Daily backups are included on the free and Pro plans;
point-in-time recovery is a Pro add-on and is worth having before you need
it rather than after.

Afterwards, put the Studio sessions back from the files with ⬆ Restore, and
tell anybody whose appointment or session disappeared.

---

## The drill

**Run this once, on staging, before you need it.** A procedure nobody has
performed is a document, not a procedure — and the number that matters is how
long it takes *you*, on your machine, with your access, not the number above.

Book an hour. Do all four.

### Drill 1 — the switch

1. Open the staging app as a normal person. Start a session; confirm it plays.
2. Admin console → Interruttori → Spegni on `Player`. Note the time.
3. Reload the app. Confirm "temporarily unavailable" and that the catalogue
   still browses.
4. Riaccendi. Reload. Confirm sessions play again. **Note how long the whole
   thing took.**

### Drill 2 — the rollback

1. On the `staging` branch, make a visible harmless change (change a heading),
   commit, push, wait for the deploy.
2. Confirm the change is live.
3. Vercel → staging project → Deployments → the previous one → Instant
   Rollback.
4. Confirm the heading is back. **Note how long from deciding to recovered.**
5. Roll forward again, or revert the commit.

### Drill 3 — the database restore

1. On staging, `npm run seed`, then note the employee count on the HR
   dashboard.
2. Delete something visible — `npm run reset` is a fine way to cause damage
   on purpose.
3. Supabase → staging project → Database → Backups → restore the most recent.
4. Confirm the count is back. **Note how long.** This is the number nobody
   knows until they do it, and it is usually larger than people expect.

### Drill 4 — the Studio restore

1. On staging, open a protocol in the Studio and press ⬇ Backup.
2. Change the session — move a clip, change a level. Save.
3. ⬆ Restore the file. Confirm the change is gone and the original is back.
4. Press 💾 Save to put it back in the database.

### Write the numbers down

At the end, fill this in and commit it:

```
Drill performed:        ____________  by ____________
Switch off → confirmed: ____ seconds
Rollback → confirmed:   ____ seconds
DB restore → confirmed: ____ minutes
Studio restore:         ____ minutes
What surprised us:      ______________________________________
```

Re-run the drill whenever the deployment setup changes, and at least once
before any release that a client is waiting on.

---

## What not to do

- **Do not `vercel --prod` from a laptop to fix something.** It skips the
  branch rule, and the branch rule is what stands between a work-in-progress
  and a real person. Push to `main`.
- **Do not reach for the database first.** It is the slowest, the only
  irreversible one, and the one most often unnecessary.
- **Do not leave a switch off and move on.** People see "temporarily
  unavailable" and it does not expire. The console shows a warning listing
  what is off; make turning it back on part of closing the incident.
