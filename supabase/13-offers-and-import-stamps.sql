/* ===========================================================================
   13 — the two columns the client writes and the database did not have

   RUN THIS BEFORE DEPLOYING. It is additive, idempotent and takes a moment.

   `saveProtocol` upserts a fixed set of columns. PostgREST rejects the WHOLE
   row when one of them does not exist — so a single missing column does not
   degrade anything gracefully, it makes every protocol save fail, which is
   what "saving the protocols gets cancelled" looks like from the console.

   offer
     The free / reduced-cost flag on a self-service entry. Added to the
     client's write path without a column to land in; this is that mistake
     being corrected.

   plain_imported_at
     When each duration's timeline was last replaced by a full import. It is
     what lets a Studio session saved from replaced clips be recognised as
     STALE instead of being deleted — the deletion came first, and it cost
     rack work on four protocols before a triage caught it.

   Both are jsonb and both default to NULL, which every reader already
   handles: no offer, and no import ever recorded.
   =========================================================================== */

alter table protocols add column if not exists offer             jsonb;
alter table protocols add column if not exists plain_imported_at jsonb;

/* PostgREST caches the table schema. Without this the first save after the
   migration still answers "Could not find the 'offer' column of 'protocols'
   in the schema cache", and it looks like the migration did not work. */
notify pgrst, 'reload schema';

/* Confirm. Two rows means the database is ready for the deploy. */
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'protocols'
   and column_name in ('offer', 'plain_imported_at')
 order by column_name;
