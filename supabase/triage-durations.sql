/* ===========================================================================
   WHICH time signatures have material — READ ONLY

   The first triage settled the frightening question: every row still claims
   6, 12 and 24, so nothing has been trimmed and no work has been destroyed.
   What it could not answer is whether those maps have anything IN them —
   `per_duration: true` only says the map is present. The console shows a
   time signature as empty whenever `plainFor()` finds nothing for it, which
   reads on screen as "it only shows 24 min" with every byte still in place.

   So: the keys, and nothing else.

   THE GUARD, because the obvious version of this raises
   "cannot call jsonb_object_keys on a scalar": a jsonb column that is SQL
   NULL, or JSON `null`, is a SCALAR, not an empty object, and `coalesce`
   does not catch the second kind. `jsonb_typeof` is the only check that
   tells an object from JSON null, so every accessor goes through it.

   Reading the columns:

     plain_map / studio_map   the JSON type of each map. Expect "object".
                              "null" means that map was never written.
     timelines_for            the durations with a stored timeline. THIS is
                              what the Studio and the console read. A row
                              showing 6, 12 and 24 is whole.
     studio_for               the durations with their own saved Studio
                              session. Only {24} here, with 6 and 12 opening
                              blank, is the other way this symptom appears.
   =========================================================================== */
select
  p.code,
  p.title,
  jsonb_typeof(p.plain_by_duration)                                  as plain_map,
  (select string_agg(k, '  ' order by k)
     from jsonb_object_keys(
       case when jsonb_typeof(p.plain_by_duration) = 'object'
            then p.plain_by_duration
            else '{}'::jsonb end) k)                                 as timelines_for,
  jsonb_typeof(p.studio_by_duration)                                 as studio_map,
  (select string_agg(k, '  ' order by k)
     from jsonb_object_keys(
       case when jsonb_typeof(p.studio_by_duration) = 'object'
            then p.studio_by_duration
            else '{}'::jsonb end) k)                                 as studio_for,
  p.updated_at
from protocols p
order by p.updated_at desc nulls last;
