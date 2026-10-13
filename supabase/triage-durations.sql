/* ===========================================================================
   WHICH time signatures actually have material — READ ONLY

   The first triage asked whether per-duration storage existed and got "yes"
   everywhere. That was the wrong question: a row can have the map and still
   have only one duration inside it, and the admin console shows a time
   signature as empty when `plainFor()` finds nothing for it. "It only shows
   24 min" is consistent with exactly that.

   So this asks what is IN the map.

   Reading the columns:

     versions_say     the time signatures the row claims (all three, per the
                      first triage).
     timelines_for    the keys actually present in plain_by_duration. THIS is
                      what the Studio and the console read through
                      `plainFor()`. A row that says {6,12,24} here is whole.
     legacy_plain_for the single duration in the old `plain` field. Expected
                      to be one value — that field only ever held the last
                      publish, which is why per-duration storage exists.
     studio_for       the keys in studio_by_duration: which time signatures
                      have a saved Sound Studio session of their own.
     audio_for        the time signatures with a published audio URL.
     missing_timeline versions_say minus timelines_for — the gap the PO is
                      looking at. Empty means nothing is missing.
   =========================================================================== */
with p as (
  select
    code,
    title,
    updated_at,
    coalesce(
      (select array_agg(distinct (v ->> 'duration')::int order by (v ->> 'duration')::int)
         from jsonb_array_elements(coalesce(versions, '[]'::jsonb)) v),
      '{}'
    ) as versions_say,
    coalesce(
      (select array_agg(k::int order by k::int)
         from jsonb_object_keys(coalesce(to_jsonb(protocols) -> 'plain_by_duration', '{}'::jsonb)) k
        where k ~ '^[0-9]+$'),
      '{}'
    ) as timelines_for,
    coalesce(
      (select array_agg(distinct (ver ->> 'durationMin')::int order by (ver ->> 'durationMin')::int)
         from jsonb_array_elements(coalesce(plain -> 'versions', '[]'::jsonb)) ver),
      '{}'
    ) as legacy_plain_for,
    coalesce(
      (select array_agg(k::int order by k::int)
         from jsonb_object_keys(coalesce(to_jsonb(protocols) -> 'studio_by_duration', '{}'::jsonb)) k
        where k ~ '^[0-9]+$'),
      '{}'
    ) as studio_for,
    coalesce(
      (select array_agg((v ->> 'duration')::int order by (v ->> 'duration')::int)
         from jsonb_array_elements(coalesce(versions, '[]'::jsonb)) v
        where v ? 'audioUrl' and v -> 'audioUrl' <> '{}'::jsonb),
      '{}'
    ) as audio_for
  from protocols
)
select
  code,
  title,
  versions_say,
  timelines_for,
  legacy_plain_for,
  studio_for,
  audio_for,
  array(select unnest(versions_say) except select unnest(timelines_for) order by 1) as missing_timeline,
  updated_at
from p
order by cardinality(array(select unnest(versions_say) except select unnest(timelines_for))) desc,
         updated_at desc;
