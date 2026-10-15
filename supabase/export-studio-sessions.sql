/* ===========================================================================
   Every saved Studio session, as files you can keep — READ ONLY

   Nothing here writes to a protocol. Run it in the Supabase SQL editor
   whenever you want a copy of the Studio work that does not depend on the
   database being up.

   What comes out is not a dump: each row is a complete `.glstudio.json`
   file, byte for byte what the Studio ⬇ Backup button writes. Save a cell to
   a file under the name the query gives it and ⬆ Restore opens it. That is
   the whole point — an export you cannot put back is not a backup.

   HOW TO GET THE FILES OUT

     1. Run SECTION A once. It creates one helper function and one view that
        the rest of the file reads. Neither touches a protocol; both can be
        dropped afterwards (last section).
     2. Run QUERY 1. It lists what exists, with no payload, so you can see
        how many sessions and how big before pulling them.
     3. Run QUERY 2. In the results panel press "Download CSV".
     4. The CSV has two columns, `filename` and `glstudio_json`. Each row is
        one file. Split it with the snippet at the bottom of this file, or by
        hand for a few: open the cell, copy the JSON, save it under the name
        in the first column.

   If QUERY 2 is too heavy to pull in one go — a large catalogue can be tens
   of MB — use QUERY 3, which does one protocol at a time.

   WHAT IS IN A FILE: the session exactly as the database holds it. Tracks,
   clips, levels, EQ, effects, fades, phase windows, and for every voice clip
   its text, its rendered audio path and its voice in all four variants.

   WHAT IS NOT: `scripts`, the timeline texts the Studio uses to FILL a
   language a session is missing. The field is optional and these files are
   written in the base variant, where it is never consulted — the clips carry
   their own four variants. Nothing is lost by its absence.

   WHICH SESSIONS: the same rule the app uses (`studioFor` in
   src/data/catalog.ts). Each duration's own session, plus — for rows written
   before sessions were stored per duration — the single legacy session,
   offered to the one duration its length matches and to no other.

   BEFORE AND AFTER AN UPGRADE: run SECTION A and QUERY 1 before you touch
   production and keep the list. Run them again afterwards and compare. A row
   that disappeared, or a `clips` that fell, is the only reliable way to see
   that something went missing — and if it did, QUERY 2 from a restored
   backup gives you the files to put it back with ⬆ Restore, one session at
   a time, without touching anything else in the catalogue.

   IF A QUERY TIMES OUT: it is a read giving up, never a half-finished write.
   Use QUERY 3 and go protocol by protocol.
   =========================================================================== */


/* ===========================================================================
   SECTION A — the shared definition. Run this first; every query reads it.
   Run it again any time: `create or replace` on both.
   =========================================================================== */
/* How many clips a track holds, whatever shape the track is in. A function
   rather than an inline expression because the view needs it twice and an
   unguarded jsonb_array_length on a non-array raises. */
create or replace function gl_studio_clip_count(track jsonb)
returns int language sql immutable as $$
  select case when jsonb_typeof(track -> 'clips') = 'array'
              then jsonb_array_length(track -> 'clips')
              else 0
         end;
$$;

/* Why every jsonb read below is wrapped in a type check: a column that holds
   a scalar instead of an object makes jsonb_object_keys and
   jsonb_array_elements RAISE, not return nothing — "cannot call
   jsonb_object_keys on a scalar". A WHERE clause does not save you, because
   nothing guarantees it runs before a LATERAL function call or before a
   subquery in the select list. The guard has to be inside the expression. */
create or replace view studio_sessions_export as
with per_duration as (
  select
    p.code,
    k::int                    as duration,
    p.studio_by_duration -> k as project,
    'per-duration'::text      as origin
  from protocols p
  cross join lateral jsonb_object_keys(
    case when jsonb_typeof(p.studio_by_duration) = 'object'
         then p.studio_by_duration
         else '{}'::jsonb
    end) k
  where k ~ '^[0-9]+$'
    and jsonb_typeof(p.studio_by_duration -> k) = 'object'
),
legacy as (
  /* A session saved before the per-duration split carries no duration of its
     own. It belongs to the time signature its LENGTH matches, and only when
     that time signature has nothing of its own - exactly what the app does.
     A legacy session with no usable length goes out with duration null; the
     Studio works the duration out from the clips when you restore it. */
  select
    p.code,
    case
      when jsonb_typeof(p.studio -> 'lengthSec') = 'number' then (
        select d
          from (values (6), (12), (24)) v(d)
         order by abs(d * 60 - (p.studio ->> 'lengthSec')::numeric)
         limit 1
      )
    end            as duration,
    p.studio       as project,
    'legacy'::text as origin,
    case when jsonb_typeof(p.studio_by_duration) = 'object'
         then p.studio_by_duration
         else '{}'::jsonb
    end            as own
  from protocols p
  where jsonb_typeof(p.studio) = 'object'
),
all_sessions as (
  select code, duration, project, origin from per_duration
  union all
  select code, duration, project, origin from legacy
   where duration is null
      or not (own ? duration::text)
),
shaped as (
  /* The track list, as an array whatever the column actually holds. Every
     count below reads THIS and never the raw jsonb. */
  select
    s.*,
    case when jsonb_typeof(s.project -> 'tracks') = 'array'
         then s.project -> 'tracks'
         else '[]'::jsonb
    end as tracks_arr
  from all_sessions s
)
select
  s.code,
  s.duration,
  s.origin,
  jsonb_array_length(s.tracks_arr) as tracks,
  (select coalesce(sum(gl_studio_clip_count(t)), 0)
     from jsonb_array_elements(s.tracks_arr) t)            as clips,
  (select coalesce(sum(gl_studio_clip_count(t)), 0)
     from jsonb_array_elements(s.tracks_arr) t
    where t ->> 'type' = 'voice')                          as voice_clips,
  case when jsonb_typeof(s.project -> 'savedAt') = 'number'
       then to_timestamp(((s.project ->> 'savedAt')::numeric / 1000)::double precision)
  end                                                      as saved_at,
  pg_size_pretty(length(s.project::text)::bigint)          as size,
  length(s.project::text)                                  as size_bytes,
  s.project
from shaped s
where jsonb_array_length(s.tracks_arr) > 0;


/* ===========================================================================
   QUERY 1 — what there is to export. No payload: safe to run any time.

   Read it before and after anything risky and compare the two. A row that
   disappeared, or a `clips` that went to zero, is the thing to notice — and
   this is the list to check against after the production upgrade.
   =========================================================================== */
select code, duration, origin, tracks, clips, voice_clips, saved_at, size
  from studio_sessions_export
 order by code, duration nulls last;

/* And the total, so you know what QUERY 2 is about to produce. */
select
  count(*)                                as sessions,
  count(distinct code)                    as protocols,
  pg_size_pretty(sum(size_bytes)::bigint) as total
from studio_sessions_export;


/* ===========================================================================
   QUERY 2 — the files themselves. Two columns, one row per session.
   Download CSV, then split it.
   =========================================================================== */
select
  /* The same name the ⬇ Backup button gives a file: code, time signature,
     and a UTC stamp so two exports of the same session sit side by side
     instead of one replacing the other. Characters Windows refuses are
     folded out, because a protocol code can contain a slash. */
  regexp_replace(
    regexp_replace(
      translate(trim(code),
                E'\\/:*?"<>|' || chr(9) || chr(10) || chr(13) || ' ',
                '-------------'),
      '-+', '-', 'g'),
    '(^-)|(-$)', '', 'g')
  || coalesce('_' || duration || 'min', '')
  || '_' || to_char(now() at time zone 'utc', 'YYYY-MM-DD_HH24-MI')
  || '.glstudio.json'                                   as filename,

  /* The file. `kind` and `version` are what the Studio checks before it will
     open anything; `workingLang` / `workingTo` say which of the four variants
     a restore lands in, and the base variant is the right answer here because
     that is the variant the session is stored in. */
  jsonb_build_object(
    'kind',        'goodloop.studio.session',
    'version',     1,
    'exportedAt',  (extract(epoch from now()) * 1000)::bigint,
    'code',        code,
    'duration',    duration,
    'workingLang', 'it',
    'workingTo',   'm',
    'project',     project
  )::text                                               as glstudio_json
from studio_sessions_export
order by code, duration nulls last;


/* ===========================================================================
   QUERY 3 — one protocol at a time, for when QUERY 2 is too much to pull in
   one request. Put the code in the WHERE.
   =========================================================================== */
select
  regexp_replace(
    regexp_replace(
      translate(trim(code),
                E'\\/:*?"<>|' || chr(9) || chr(10) || chr(13) || ' ',
                '-------------'),
      '-+', '-', 'g'),
    '(^-)|(-$)', '', 'g')
  || coalesce('_' || duration || 'min', '')
  || '_' || to_char(now() at time zone 'utc', 'YYYY-MM-DD_HH24-MI')
  || '.glstudio.json'                                   as filename,
  jsonb_build_object(
    'kind',        'goodloop.studio.session',
    'version',     1,
    'exportedAt',  (extract(epoch from now()) * 1000)::bigint,
    'code',        code,
    'duration',    duration,
    'workingLang', 'it',
    'workingTo',   'm',
    'project',     project
  )::text                                               as glstudio_json
from studio_sessions_export
where code = 'GL-ANX 1.1'          -- <<< change this
order by duration nulls last;


/* ===========================================================================
   SPLITTING THE CSV INTO FILES

   Save QUERY 2's download as `sessions.csv`, put `tools/split-studio-csv.mjs`
   next to it, and run:

     node split-studio-csv.mjs sessions.csv

   It writes one `.glstudio.json` per row into `./studio-backups/`, refusing
   to write anything that is not valid JSON. No dependencies.

   CLEANING UP: the view is a convenience, not part of the schema. It stores
   nothing, so leaving it costs nothing — but to remove it:

     drop view if exists studio_sessions_export;
     drop function if exists gl_studio_clip_count(jsonb);
   =========================================================================== */
