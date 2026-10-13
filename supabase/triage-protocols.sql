/* ===========================================================================
   What is actually left in the protocols table — READ ONLY

   Run this in the Supabase SQL editor. It changes nothing. One query, so the
   editor shows the whole thing: it only ever displays the LAST statement's
   result, which is how a dry run once appeared to return a single row.

   WHY: the build currently in production rebuilds `versions` from whichever
   workbook was last published and writes `studio: null` on every publish, so
   a protocol can be left claiming one time signature when three were made,
   with its Studio session gone. This says, per protocol, what survived.

   Reading the columns:

     durations_on_row   the time signatures the row still claims. A protocol
                        the team built in 6/12/24 that shows only {24} has
                        been trimmed by a publish.
     durations_with_audio
                        of those, how many carry a published audio URL. The
                        FILES are still in storage either way — only the row's
                        reference to them is lost, so they can be re-attached.
     has_plain          a legacy single timeline exists.
     plain_durations    which time signatures that timeline actually contains.
                        If this says 24 and durations_on_row says 24, the
                        other two are not hiding in there either.
     has_studio         a saved Sound Studio session survived.
     per_duration       whether this row has already been migrated to
                        per-duration storage (it will be false everywhere
                        until the new build is deployed).
   =========================================================================== */
select
  p.code,
  p.title,
  p.updated_at,
  coalesce(
    (select array_agg(distinct (v ->> 'duration')::int order by (v ->> 'duration')::int)
       from jsonb_array_elements(coalesce(p.versions, '[]'::jsonb)) v),
    '{}'
  )                                                      as durations_on_row,
  (select count(*)
     from jsonb_array_elements(coalesce(p.versions, '[]'::jsonb)) v
    where v ? 'audioUrl' and v -> 'audioUrl' <> '{}'::jsonb)  as durations_with_audio,
  (p.plain is not null)                                  as has_plain,
  coalesce(
    (select array_agg(distinct (ver ->> 'durationMin')::int order by (ver ->> 'durationMin')::int)
       from jsonb_array_elements(coalesce(p.plain -> 'versions', '[]'::jsonb)) ver),
    '{}'
  )                                                      as plain_durations,
  (p.studio is not null)                                 as has_studio,
  /* Read through to_jsonb rather than naming the column: Postgres resolves
     column names at parse time, so `p.plain_by_duration` would make this
     whole query fail on a database that has not had the migration yet —
     which is exactly the case this is meant to diagnose. */
  (coalesce(to_jsonb(p) -> 'plain_by_duration', 'null'::jsonb) <> 'null'::jsonb)
                                                         as per_duration
from protocols p
order by p.updated_at desc nulls last;
