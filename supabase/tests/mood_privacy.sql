-- ============================================================================
-- The emotional check-in: who may write one, and who may read one — through
-- RLS, as Supabase's `authenticated` role. Run by tools/db-gate.mjs on its
-- own copy of a fresh database.
--
-- Mood is health data (GDPR art. 9, LGPD sensível). Three claims are made in
-- docs/ui-redesign and in 26-mood-checkins.sql, and all three are proved
-- here rather than asserted:
--
--   1 · a person reads their own rows and nobody else's,
--   2 · nothing is written without the measurement consent — not even by an
--       app build that forgot to ask,
--   3 · an HR admin and a clinician read NOTHING, however the question is
--       asked. There is no policy for them; this is what that is worth.
-- ============================================================================

do $$
declare
  failures text := '';
  n int;
  ana uuid;
  bruno uuid;
  rh uuid;
  psi uuid;
  sess uuid := gen_random_uuid();
begin
  insert into companies (id, name) values ('MD-ACME', 'Acme') on conflict do nothing;
  insert into profiles (auth_uid, role, name, company_id) values
    ('00000000-0000-0000-0000-0000000000e1', 'b2c_user', 'md-ana', 'MD-ACME') returning id into ana;
  insert into profiles (auth_uid, role, name, company_id) values
    ('00000000-0000-0000-0000-0000000000e2', 'b2c_user', 'md-bruno', 'MD-ACME') returning id into bruno;
  insert into profiles (auth_uid, role, name, company_id) values
    ('00000000-0000-0000-0000-0000000000e3', 'hr_admin', 'md-rh', 'MD-ACME') returning id into rh;
  insert into profiles (auth_uid, role, name) values
    ('00000000-0000-0000-0000-0000000000e4', 'therapist', 'md-psi') returning id into psi;

  -- Ana consented to measurement; Bruno did not.
  insert into consent_events (profile_id, purpose, granted, wording, locale, at)
  values (ana, 'measurement', true, 'test', 'pt-BR', now() - interval '10 days');

  grant select, insert on mood_checkins to authenticated;

  -- 1 · Ana writes her own check-in, before and after one session
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
  set local role authenticated;
  begin
    insert into mood_checkins (user_id, context, session_id, protocol_code, valence, arousal, label_id, locale, color_oklch)
    values (ana, 'pre_session', sess, 'GL-ANX 1.1', -0.60, 0.70, 'tense', 'pt-BR', 'oklch(0.620 0.112 44.0)');
    insert into mood_checkins (user_id, context, session_id, protocol_code, valence, arousal, label_id, locale, color_oklch)
    values (ana, 'post_session', sess, 'GL-ANX 1.1', 0.30, -0.40, 'calm', 'pt-BR', 'oklch(0.800 0.049 149.0)');
  exception when others then
    failures := failures || format(E'\n  a consented person could not write her own check-in: %s', sqlerrm);
  end;
  reset role;

  -- 2 · Bruno has not consented: the insert must be refused
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
  set local role authenticated;
  begin
    insert into mood_checkins (user_id, context, valence, arousal, locale, color_oklch)
    values (bruno, 'standalone', 0.1, 0.1, 'pt-BR', 'oklch(0.780 0.020 80.0)');
    failures := failures || E'\n  a check-in was stored WITHOUT the measurement consent';
  exception when insufficient_privilege then null;
    when others then
      if sqlstate <> '42501' then failures := failures || format(E'\n  unexpected error for an unconsented insert: %s', sqlerrm); end if;
  end;
  reset role;

  -- 3 · nobody writes a row for somebody else, consent or no consent
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
  set local role authenticated;
  begin
    insert into mood_checkins (user_id, context, valence, arousal, locale, color_oklch)
    values (ana, 'standalone', 0.9, 0.9, 'pt-BR', 'oklch(0.860 0.140 85.0)');
    failures := failures || E'\n  one person wrote a check-in in another person''s name';
  exception when insufficient_privilege then null; when others then null;
  end;
  reset role;

  -- 4 · Ana reads her two rows
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
  set local role authenticated;
  select count(*) into n from mood_checkins;
  reset role;
  if n <> 2 then failures := failures || format(E'\n  she reads %s of her own rows, expected 2', n); end if;

  -- 5 · Bruno reads none of them
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
  set local role authenticated;
  select count(*) into n from mood_checkins;
  reset role;
  if n <> 0 then failures := failures || format(E'\n  another employee read %s of her rows', n); end if;

  -- 6 · the employer reads none of them. Not a filtered view, not an
  --     aggregate: nothing. This is the claim the whole product rests on.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', true);
  set local role authenticated;
  select count(*) into n from mood_checkins;
  reset role;
  if n <> 0 then failures := failures || format(E'\n  the HR admin of her company read %s mood rows', n); end if;

  -- 7 · a clinician reads none of them either. The therapy bridge carries
  --     sessions and notes; it does not carry this.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', true);
  set local role authenticated;
  select count(*) into n from mood_checkins;
  reset role;
  if n <> 0 then failures := failures || format(E'\n  a therapist read %s mood rows', n); end if;

  -- 8 · signed out, nothing
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  select count(*) into n from mood_checkins;
  reset role;
  if n <> 0 then failures := failures || format(E'\n  a signed-out caller read %s mood rows', n); end if;

  -- 9 · the axes are bounded, so a client bug cannot store a point off the grid
  begin
    insert into mood_checkins (user_id, context, valence, arousal, locale, color_oklch)
    values (ana, 'standalone', 1.4, 0, 'pt-BR', 'oklch(0.780 0.020 80.0)');
    failures := failures || E'\n  a valence of 1.4 was accepted';
  exception when check_violation then null;
  end;

  -- 10 · the pre and the post of one session are findable together
  select count(*) into n from mood_checkins where session_id = sess;
  if n <> 2 then failures := failures || format(E'\n  the session correlation id links %s rows, expected 2', n); end if;

  if failures <> '' then raise exception 'mood privacy failed:%', failures; end if;
  raise notice 'ok  : her own rows, consent enforced in the database, nothing for HR or a clinician';
end $$;
