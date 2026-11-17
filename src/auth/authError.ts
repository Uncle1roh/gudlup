/* ============================================================================
   What the door says when it refuses

   Supabase Auth answers in English, in sentences written for a developer
   reading a console: "User already registered", "Invalid login
   credentials", "For security purposes, you can only request this after 46
   seconds". The door printed them as they came, so a Brazilian trying to
   register an address they already had was told, in English, something they
   then had to work out the consequence of themselves.

   This maps the refusals a PERSON can actually reach onto keys the
   dictionaries carry, and leaves everything else exactly as it arrived —
   a message nobody wrote for a human still beats a shrug, and inventing a
   friendly sentence for a failure we have not understood is how a real
   cause gets hidden.

   WHY THE KEY AND NOT THE SENTENCE. These are read inside a component that
   already has `t()`, so the mapping returns an English key and the caller
   translates. One dictionary, one place to find the wording, and the key is
   the English a reader of the code sees.

   ON SAYING THAT AN ADDRESS IS TAKEN. It is a sign-UP form: the person in
   front of it either owns that address or is guessing at somebody else's,
   and the useful answer — sign in instead, or reset the password — is the
   same one Supabase already gives by refusing. Saying it in their language
   adds no information to the internet; it only stops a person staring at a
   form that will never accept them.
   ============================================================================ */

/** The English key for a refusal, or the original message when we have no
    better words for it. */
export function authErrorKey(e: unknown): string {
  const err = (e ?? {}) as { message?: string; code?: string; status?: number; name?: string }
  const code = (err.code ?? '').toLowerCase()
  const msg = (err.message ?? String(e)).trim()
  const m = msg.toLowerCase()

  /* The address already has an account. The next step is the whole point of
     the sentence, so it is in it. */
  if (code === 'user_already_exists' || code === 'email_exists'
    || /already registered|already been registered|user already exists|email.*already/.test(m)) {
    return 'This address already has an account. Sign in instead, or ask for a new password if you have forgotten it.'
  }

  /* Wrong address or wrong password, and deliberately not saying which:
     that distinction is what tells a stranger whether an address exists. */
  if (code === 'invalid_credentials' || /invalid login credentials|invalid email or password/.test(m)) {
    return 'That email and password do not match an account.'
  }

  if (code === 'email_not_confirmed' || /email not confirmed|confirm your email/.test(m)) {
    return 'This account still has to be confirmed. Open the link in the email we sent you.'
  }

  /* Supabase's own minimum, which is shorter than the form's. Reached only
     by an account created elsewhere or a changed setting. */
  if (code === 'weak_password' || /password should be at least|password is too short|weak password/.test(m)) {
    return 'That password is too short.'
  }

  if (code === 'validation_failed' || /unable to validate email address|invalid format/.test(m)) {
    return 'That does not look like an email address.'
  }

  /* Too many attempts. The number of seconds is Supabase's and changes with
     the setting, so the sentence does not promise one. */
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit'
    || err.status === 429 || /for security purposes|rate limit|too many requests/.test(m)) {
    return 'Too many attempts just now. Wait a minute and try again.'
  }

  /* No network, a blocked request, a backend that is down. `TypeError` with
     "fetch" in it is what a browser gives for all three. */
  if (err.name === 'TypeError' || /failed to fetch|networkerror|load failed/.test(m)) {
    return 'We could not reach goodloop. Check your connection and try again.'
  }

  return msg
}
