/* ===========================================================================
   How heavy the catalogue has become — READ ONLY

   "canceling statement due to statement timeout" is the database giving up
   on a query, not a failed write. The query that gave up was a read of the
   WHOLE protocols table — every timeline, every Studio session, every
   variant of every protocol — which the console issued after each save just
   to look at the one row it had written. That read is now a single-row
   lookup, so the save path no longer depends on the size of the catalogue.

   What is still a whole-table read: the admin catalogue list, and the app's
   own catalogue load. They work today. This says how much room is left.

   Reading the columns:

     total        the row, as the database stores it
     timelines    the imported Excel per time signature
     studio       the saved Studio sessions — usually the largest part,
                  because a session holds every clip of every variant
     the rest     cover, names, tags, versions: negligible

   The last query is the one that matters: the sum is roughly what one
   `select * from protocols` has to assemble and send. Past a few tens of MB
   expect the list to start timing out as well, and say so — the fix then is
   a lighter list that leaves the timelines and the sessions in the database
   until a protocol is actually opened.
   =========================================================================== */
select
  p.code,
  pg_size_pretty(length(to_jsonb(p)::text)::bigint)                        as total,
  pg_size_pretty(length(coalesce(p.plain_by_duration::text, ''))::bigint)  as timelines,
  pg_size_pretty(length(coalesce(p.studio_by_duration::text, ''))::bigint) as studio,
  pg_size_pretty(length(coalesce(p.datasheet::text, ''))::bigint)          as datasheet,
  p.updated_at
from protocols p
order by length(to_jsonb(p)::text) desc;

/* The whole table, as one number. */
select
  count(*)                                                          as protocols,
  pg_size_pretty(sum(length(to_jsonb(p)::text))::bigint)            as sent_by_select_star,
  pg_size_pretty(pg_total_relation_size('protocols'))               as on_disk_with_toast
from protocols p;

/* What the database is willing to wait for, per role. The console reads as
   `authenticated`; Supabase ships it at 8 s. */
select rolname, rolconfig
  from pg_roles
 where rolname in ('anon', 'authenticated', 'service_role')
 order by rolname;
