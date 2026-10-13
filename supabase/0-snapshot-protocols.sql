/* ===========================================================================
   0 — a copy of the protocols table, before touching anything

   Run this FIRST, any time you are about to change the protocols table or
   deploy something that writes to it. It costs seconds and it is the only
   undo that does not depend on somebody else's backup schedule.

   It does not modify `protocols` in any way. `create table as select` READS
   the table and writes a new one beside it; the original is untouched, and
   nothing in here can alter or remove a row.

   Change the date in the name each time so snapshots accumulate rather than
   overwrite each other. `if not exists` means re-running on the same day is
   harmless — but note it will then keep the EARLIER copy and not refresh it,
   which is the safe direction.
   =========================================================================== */

create table if not exists protocols_backup_20261013 as
select * from protocols;

/* What you just saved. Compare it with the live table: the two counts should
   match, and every timeline and Studio session is now held in two places. */
select
  (select count(*) from protocols_backup_20261013) as rows_in_snapshot,
  (select count(*) from protocols)                 as rows_live;

/* ---------------------------------------------------------------------------
   IF YOU EVER NEED IT BACK

   Look before you leap — this one DOES write. Check first:

     select code, title from protocols_backup_20261013 order by code;

   Restore the per-duration material for a single protocol:

     update protocols p
        set plain               = b.plain,
            plain_by_duration   = b.plain_by_duration,
            studio              = b.studio,
            studio_by_duration  = b.studio_by_duration,
            versions            = b.versions
       from protocols_backup_20261013 b
      where b.code = p.code
        and p.code = 'GL-ANX 1.5';

   Drop the `and p.code = ...` line to restore every protocol at once. Take a
   fresh snapshot before doing that, so the restore itself is also undoable.

   When you are confident you no longer need a snapshot:

     drop table protocols_backup_20261013;
   --------------------------------------------------------------------------- */
