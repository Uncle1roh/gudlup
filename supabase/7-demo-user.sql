-- ============================================================================
-- Good Loop — SCRIPT 7: a demo person, already a few weeks into therapy
--
-- Builds a patient who has done sessions, is connected to a therapist, has a
-- prescribed pathway, a conversation, measurements and an appointment coming
-- up — so a demo opens on a populated app instead of an empty one.
--
-- ── BEFORE YOU RUN IT ──────────────────────────────────────────────────────
-- Two LOGINS have to exist first. This script cannot create them: Supabase
-- owns the auth tables and writing passwords into them by hand breaks in ways
-- that are hard to see. Make them in the dashboard:
--
--   Authentication → Users → Add user → "Auto Confirm User" ON
--     1. demo@goodloop.app        (the person)
--     2. terapeuta@goodloop.app   (their therapist)
--
-- Use any passwords you like — you will sign in with them.
-- Then edit the two lines below if you chose different addresses, and Run.
--
-- Safe to run more than once: it updates what it already made rather than
-- making a second copy, so you can re-run it to reset the demo between
-- meetings. Nothing outside these two accounts is touched.
--
-- Run scripts 5 and 6 first — this uses the tables they create.
-- ============================================================================

do $$
declare
  -- ---- edit these two if you used different addresses ---------------------
  patient_email   text := 'demo@goodloop.app';
  therapist_email text := 'terapeuta@goodloop.app';
  -- -------------------------------------------------------------------------

  patient_auth   uuid;
  therapist_auth uuid;
  p_profile      uuid;   -- the person's profile
  t_profile      uuid;   -- the therapist's profile (= therapists.id)
  patient_row    uuid;   -- the patients row: THE link between the two
  now_ts         timestamptz := now();
  day            interval := interval '1 day';
begin
  select id into patient_auth   from auth.users where lower(email) = lower(patient_email);
  select id into therapist_auth from auth.users where lower(email) = lower(therapist_email);

  if patient_auth is null or therapist_auth is null then
    raise exception
      'Create the logins first: % is %, % is %. Authentication -> Users -> Add user, with Auto Confirm on.',
      patient_email,   coalesce(patient_auth::text, 'MISSING'),
      therapist_email, coalesce(therapist_auth::text, 'MISSING');
  end if;

  -- ---- the company, so the convention features light up --------------------
  -- ACME-2026 is the code src/data/convention.ts knows, including its EAP
  -- crisis contacts. Without a company the person is still fine; they just
  -- see the generic crisis numbers.
  insert into companies (id, name, seats, active_users, status)
  values ('ACME-2026', 'ACME Brasil', 250, 118, 'active')
  on conflict (id) do update set name = excluded.name;

  -- ---- the therapist ------------------------------------------------------
  insert into profiles (auth_uid, role, name, email, locale, active)
  values (therapist_auth, 'therapist', 'Dra. Ana Ribeiro', therapist_email, 'pt-BR', true)
  on conflict (auth_uid) do update
    set role = 'therapist', name = excluded.name, email = excluded.email, active = true
  returning id into t_profile;

  insert into therapists (id, crp, status, approved_at)
  values (t_profile, 'CRP 06/128456', 'approved', now_ts - 200 * day)
  on conflict (id) do update set status = 'approved', approved_at = coalesce(therapists.approved_at, now_ts);

  -- Times they offer: Tue/Thu, hourly 09:00–12:00 and 14:00–17:00.
  insert into therapist_availability (therapist_id, slots, updated_at)
  values (t_profile, '[
    {"weekday":2,"hhmm":"09:00"},{"weekday":2,"hhmm":"10:00"},{"weekday":2,"hhmm":"11:00"},
    {"weekday":2,"hhmm":"14:00"},{"weekday":2,"hhmm":"15:00"},{"weekday":2,"hhmm":"16:00"},
    {"weekday":4,"hhmm":"09:00"},{"weekday":4,"hhmm":"10:00"},{"weekday":4,"hhmm":"11:00"},
    {"weekday":4,"hhmm":"14:00"},{"weekday":4,"hhmm":"15:00"},{"weekday":4,"hhmm":"16:00"}
  ]'::jsonb, now_ts)
  on conflict (therapist_id) do update set slots = excluded.slots, updated_at = now_ts;

  -- A connection code, in case you want to demo the join flow with a THIRD
  -- account instead of the pre-linked one below.
  insert into therapist_codes (code, therapist_id, label, active)
  values ('GL-DEMO-2026', t_profile, 'Demo', true)
  on conflict (code) do update set therapist_id = excluded.therapist_id, active = true;

  -- ---- the person ---------------------------------------------------------
  insert into profiles (auth_uid, role, name, email, locale, company_id, active, team)
  values (patient_auth, 'b2c_user', 'Giulia Marchetti', patient_email, 'it', 'ACME-2026', true, 'Operations')
  on conflict (auth_uid) do update
    set role = 'b2c_user', name = excluded.name, email = excluded.email,
        company_id = 'ACME-2026', active = true
  returning id into p_profile;

  -- ---- the link, which is what "has a therapist" actually means ------------
  select id into patient_row
  from patients where b2c_profile_id = p_profile and therapist_id = t_profile;

  if patient_row is null then
    insert into patients (therapist_id, b2c_profile_id, name, reason, clinical_notes, plan_title, next_session_at)
    values (t_profile, p_profile, 'Giulia Marchetti',
            'Ansia legata al lavoro, difficoltà a staccare la sera',
            'Buona aderenza. Risponde bene al respiro guidato; da monitorare il sonno.',
            'Tre mesi — respiro, confini, recupero',
            now_ts + 2 * day)
    returning id into patient_row;
  else
    update patients
       set plan_title = 'Tre mesi — respiro, confini, recupero',
           next_session_at = now_ts + 2 * day
     where id = patient_row;
  end if;

  insert into patient_consents (patient_id, kind, granted)
  values (patient_row, 'therapy', true), (patient_row, 'sharing', true)
  on conflict (patient_id, kind) do update set granted = true;

  -- ---- history: eight sessions over the last five weeks --------------------
  -- Deleted and rewritten so re-running resets the demo instead of stacking
  -- another five weeks on top of the last run.
  delete from sessions where b2c_profile_id = p_profile or patient_id = patient_row;

  insert into sessions (kind, b2c_profile_id, patient_id, therapist_id, protocol_code, duration_min, started_at, ended_at, vas_pre, vas_post, completed)
  values
    ('b2c', p_profile, null, null, 'GL-ANX 1.1', 12, now_ts - 33 * day, now_ts - 33 * day + interval '12 min', 2, 3, true),
    ('b2c', p_profile, null, null, 'GL-ANX 1.1', 12, now_ts - 29 * day, now_ts - 29 * day + interval '12 min', 2, 4, true),
    ('b2b', null, patient_row, t_profile, 'GL-ANX 1.1', 24, now_ts - 26 * day, now_ts - 26 * day + interval '50 min', 2, 4, true),
    ('b2c', p_profile, null, null, 'GL-ANX 1.3',  6, now_ts - 21 * day, now_ts - 21 * day + interval '6 min',  3, 4, true),
    ('b2c', p_profile, null, null, 'GL-ANX 1.1', 12, now_ts - 16 * day, now_ts - 16 * day + interval '12 min', 3, 4, true),
    ('b2b', null, patient_row, t_profile, 'GL-ANX 1.3', 24, now_ts - 12 * day, now_ts - 12 * day + interval '50 min', 3, 5, true),
    ('b2c', p_profile, null, null, 'GL-ANX 1.3', 12, now_ts -  6 * day, now_ts -  6 * day + interval '12 min', 3, 5, true),
    ('b2c', p_profile, null, null, 'GL-ANX 1.1', 12, now_ts -  2 * day, now_ts -  2 * day + interval '12 min', 4, 5, true);

  -- ---- the prescribed pathway ---------------------------------------------
  -- Two protocols, twice a week, three weeks. The first week is done.
  delete from plan_items where patient_id = patient_row;

  insert into plan_items (patient_id, position, protocol_code, duration_min, week, note, done_at)
  select patient_row, n - 1,
         case when n % 2 = 1 then 'GL-ANX 1.1' else 'GL-ANX 1.3' end,
         case when n % 2 = 1 then 12 else 6 end,
         ((n - 1) / 2) + 1,
         case when n = 1 then 'Falla quando senti il corpo attivato, non solo la sera.' end,
         case when n <= 2 then now_ts - (7 - n) * day end
  from generate_series(1, 6) as n;

  -- ---- the conversation ----------------------------------------------------
  delete from messages where patient_id = patient_row;

  insert into messages (patient_id, sender, body, at, read_by_patient, read_by_therapist)
  values
    (patient_row, 'therapist', 'Ciao Giulia — ho impostato il percorso per le prossime tre settimane. Fammi sapere come va il respiro la sera.', now_ts - 20 * day, true, true),
    (patient_row, 'patient',   'Grazie! La sera è ancora il momento più difficile, ma la sessione da 12 minuti aiuta.',                             now_ts - 19 * day, true, true),
    (patient_row, 'therapist', 'Perfetto. Proviamo ad aggiungere la Quick da 6 minuti prima delle riunioni.',                                       now_ts - 13 * day, true, true),
    (patient_row, 'patient',   'Questa settimana è stata pesante, ne ho saltata una.',                                                              now_ts -  3 * day, true, false);

  -- ---- measurements the therapist's charts read ----------------------------
  delete from scores where patient_id = patient_row;
  insert into scores (patient_id, instrument, max, lower_is_better, t0, t1, t2, captured_at) values
    (patient_row, 'DASS-21 Ansia', 42, true,  22, 16, 12, now_ts - 2 * day),
    (patient_row, 'PSS-10',        40, true,  27, 22, 19, now_ts - 2 * day),
    (patient_row, 'BRS',            5, false, 2.4, 2.9, 3.3, now_ts - 2 * day);

  delete from goals where patient_id = patient_row;
  insert into goals (patient_id, text, status) values
    (patient_row, 'Addormentarsi entro 30 minuti quattro sere su sette', 'in-progress'),
    (patient_row, 'Chiudere il portatile entro le 19:30',                'in-progress'),
    (patient_row, 'Una pausa vera a metà giornata',                      'achieved');

  -- ---- the next appointment, and the video room it opens -------------------
  delete from appointments where profile_id = p_profile and status = 'booked';
  insert into appointments (therapist_id, profile_id, patient_name, company_id, starts_at, duration_min, status)
  values (t_profile, p_profile, 'Giulia Marchetti', 'ACME-2026',
          date_trunc('day', now_ts + 2 * day) + interval '10 hour',
          50, 'booked');

  raise notice 'Demo ready. patient profile %, therapist profile %, patients row %', p_profile, t_profile, patient_row;
end $$;

-- What you just made.
select
  (select name  from profiles  where email = 'demo@goodloop.app')                                as person,
  (select count(*) from sessions s join profiles p on p.id = s.b2c_profile_id
     where p.email = 'demo@goodloop.app')                                                        as own_sessions,
  (select count(*) from plan_items pi join patients pa on pa.id = pi.patient_id
     join profiles p on p.id = pa.b2c_profile_id where p.email = 'demo@goodloop.app')            as prescribed_sessions,
  (select count(*) from messages m join patients pa on pa.id = m.patient_id
     join profiles p on p.id = pa.b2c_profile_id where p.email = 'demo@goodloop.app')            as messages,
  (select to_char(min(starts_at), 'DD/MM HH24:MI') from appointments a
     join profiles p on p.id = a.profile_id
     where p.email = 'demo@goodloop.app' and a.status = 'booked')                                as next_appointment;
