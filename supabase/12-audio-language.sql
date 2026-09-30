-- ============================================================================
-- Good Loop — SCRIPT 12: the published audio is Italian — file it as Italian
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run: a second run finds
-- nothing left to move and changes nothing.
--
-- WHY. Every session published so far was rendered from the Italian text,
-- with the Italian (ITA) voices and `lang: 'it'` — but the upload wrote its
-- URL under the key 'pt-BR', because 'pt-BR' was the only key the upload knew.
-- Now that protocols are published per language, that key is a claim: a
-- Portuguese reader would be served an Italian session as "the Portuguese
-- one", and the console would show every protocol as having Portuguese audio
-- and none in Italian.
--
-- WHAT. For every protocol and every version (6 / 12 / 24 min): when
-- `audioUrl` has a 'pt-BR' file and NO 'it' file, the URL moves to 'it' and
-- the 'pt-BR' key is removed. A version that already has an 'it' file is left
-- exactly as it is — then 'pt-BR' was written deliberately, after this change.
-- Nothing else on the row is touched: not the file (it keeps its storage name,
-- `…min-ptBR.mp3`), not the timelines, the Studio sessions, the names or the
-- enabled state. A person keeps hearing the same file; the app's player falls
-- back to the other language when theirs is missing, so nobody loses a session.
--
-- DATA ONLY — no schema change. It still ends with the PostgREST reload the
-- setup.sql convention asks every script to end with.
-- ============================================================================

-- What will move — run on its own first if you want to see it.
select p.code,
       (e->>'duration')::int        as minutes,
       e->'audioUrl'->>'pt-BR'      as file_now_under_pt_br
  from protocols p,
       jsonb_array_elements(case when jsonb_typeof(p.versions) = 'array' then p.versions else '[]'::jsonb end) e
 where jsonb_typeof(e->'audioUrl') = 'object'
   and coalesce(e->'audioUrl'->>'pt-BR', '') <> ''
   and coalesce(e->'audioUrl'->>'it', '')    =  ''
 order by p.code, minutes;

-- The move. One version at a time, in the order the array already has.
update protocols p
   set versions = (
         select jsonb_agg(
                  case
                    when jsonb_typeof(x.e->'audioUrl') = 'object'
                     and coalesce(x.e->'audioUrl'->>'pt-BR', '') <> ''
                     and coalesce(x.e->'audioUrl'->>'it', '')    =  ''
                    then jsonb_set(
                           x.e,
                           '{audioUrl}',
                           ((x.e->'audioUrl') - 'pt-BR' - 'it')
                             || jsonb_build_object('it', x.e->'audioUrl'->'pt-BR')
                         )
                    else x.e
                  end
                  order by x.ord)
           from jsonb_array_elements(p.versions) with ordinality as x(e, ord)
       ),
       updated_at = now()
 where jsonb_typeof(p.versions) = 'array'
   and exists (
         select 1
           from jsonb_array_elements(p.versions) e
          where jsonb_typeof(e->'audioUrl') = 'object'
            and coalesce(e->'audioUrl'->>'pt-BR', '') <> ''
            and coalesce(e->'audioUrl'->>'it', '')    =  ''
       );

-- What the catalogue holds now, per protocol and duration: which languages
-- have a file. After this script every published duration reads "it".
select p.code,
       (e->>'duration')::int                                        as minutes,
       coalesce((select string_agg(k, ' + ' order by k)
                   from jsonb_each_text(coalesce(e->'audioUrl', '{}'::jsonb)) as a(k, v)
                  where v <> ''), '—')                              as audio_languages
  from protocols p,
       jsonb_array_elements(case when jsonb_typeof(p.versions) = 'array' then p.versions else '[]'::jsonb end) e
 order by p.code, minutes;

notify pgrst, 'reload schema';
